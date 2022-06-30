import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ethers } from 'ethers';

import { generateReturn } from '../util/api-util';
import logger from '../util/winston-logger-util';
import { getUserById, initDynamoClient, Self } from '../util/dynamo-util';
import { getEthersWallet } from '../util/avax-wallet-util';
import { sendAvax } from '../util/avax-chain-util';

const dynamoClient = initDynamoClient();
export const avaxTestNetworkNodeUrl =
  'https://api.avax-test.network/ext/bc/C/rpc';
const HTTPSProvider = new ethers.providers.JsonRpcProvider(
  avaxTestNetworkNodeUrl
);

// TODO - This is bad, lets fetch it from the organization
export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
// TODO - This value is used in multiple places - let's move to own function
export const BASE_AMOUNT_TO_SEED_USER = '0.01';
export const MIN_BALANCE_TO_SEED = '0.005';

// TODO - this can be a util function as it is used in multiple places
export async function getSeedAccountPrivateKey(): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(SEED_ACCOUNT_ID, dynamoClient);
  const seedPrivateKey = seedAccount.walletPrivateKeyWithLeadingHex;

  if (!seedPrivateKey) {
    throw new Error('Seed account has no private key');
  }

  return seedPrivateKey;
}

// TODO - this can be a util function as it is used in multiple places
export async function seedFundsForUser(
  seedWallet: ethers.Wallet,
  userCchainAddressToSeed: string
) {
  const res = await sendAvax(
    seedWallet,
    BASE_AMOUNT_TO_SEED_USER,
    userCchainAddressToSeed
  );

  return res;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    // TODO - This can be a util function
    logger.defaultMeta = {
      _requestId: event.requestContext.requestId,
      userId,
    };

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    logger.info('Fetching user', { values: { userId } });
    const user = (await getUserById(userId, dynamoClient)) as Self;
    if (!user) {
      throw new Error('User not found, something bigger is wrong');
    }
    logger.verbose('Received user', { values: { user } });

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

    logger.info('Fetching seed wallet');
    const seedWalletPrivateKey = await getSeedAccountPrivateKey();
    const seedWallet = new ethers.Wallet(seedWalletPrivateKey, HTTPSProvider);
    logger.verbose('Received seed wallet');

    logger.info('Seeding user', { values: { user } });
    const transaction = await sendAvax(
      seedWallet,
      BASE_AMOUNT_TO_SEED_USER,
      user.walletAddressC,
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
