import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ethers } from 'ethers';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { getUserById, initDynamoClient, Self } from '../util/dynamo-util';
import { getEthersWallet } from '../util/avax-wallet-util';
import { seedFundsForUser } from '../util/seed-util';

const dynamoClient = initDynamoClient();

export const MIN_BALANCE_TO_SEED = '0.005';

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    setDefaultLoggerMetaForApi(event, logger);
    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    logger.verbose('Fetching user', { values: { userId } });
    const user = (await getUserById(userId, dynamoClient)) as Self;
    if (!user) {
      throw new Error('User not found, something bigger is wrong');
    }
    logger.info('Received user', { values: { user } });

    // TODO - No need to fetch wallet, I just need the users address
    const userWallet = getEthersWallet(user.walletPrivateKeyWithLeadingHex);
    const usersBalance = await userWallet.getBalance();

    if (usersBalance.gt(ethers.utils.parseEther(MIN_BALANCE_TO_SEED))) {
      const message =
        'Users balance is higher than MIN_AMOUNT_TO_SEED, no need to seed, returning';
      logger.info(message, {
        values: {
          usersBalance: ethers.utils.formatEther(usersBalance),
          MIN_BALANCE_TO_SEED,
        },
      });

      return generateReturn(304, {
        message,
        userBalance: ethers.utils.formatEther(usersBalance),
        MIN_BALANCE_TO_SEED,
      });
    }

    logger.info('User is eligible to be seeded, seeding', {
      values: { user, usersBalance },
    });

    logger.verbose('Seeding user', { values: { user } });
    const transaction = seedFundsForUser(
      user.walletAddressC,
      dynamoClient,
      true
    );

    logger.info('Seeded user', {
      values: {
        user,
        transaction,
      },
    });

    return generateReturn(200, { ...transaction });
  } catch (error) {
    console.log(error);
    logger.error('Failed to seed self', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to seed user',
      error: error,
    });
  }
};
