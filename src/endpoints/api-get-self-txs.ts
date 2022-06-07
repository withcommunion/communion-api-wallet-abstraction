import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import {
  User,
  UserWithPublicData,
  getUserById,
  initDynamoClient,
  getUsersInOrganization,
} from '../util/dynamo-util';
import { getAddressTxHistory } from '../util/avax-chain-util';
import logger from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    logger.defaultMeta = {
      _requestId: event.requestContext.requestId,
      userId,
    };

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    logger.info('Fetching user', { values: { userId: userId } });
    const user = await getUserById(dynamoClient, userId);
    logger.verbose('Received user', { values: user });

    const usersAddressC = user.walletAddressC;

    logger.info('Fetching user transactions', { values: { usersAddressC } });
    const rawUserTxs = await getAddressTxHistory(usersAddressC);
    logger.verbose('Received txns', { values: { rawUserTxs } });

    const txAddresses = rawUserTxs
      .reduce((acc, curr) => {
        acc.push(curr.from);
        acc.push(curr.to);
        return acc;
      }, [] as string[])
      .filter((item, _, arr) => arr.includes(item));

    /**
     * TODO: This won't work when we have multiple organizations.
     * I cannot SCAN for multiple users by their walletAddressC </3
     * I need to reshape the DB to effectively support querying for multiple users by their Address
     * It's becoming clear that DynamoDB may not be the best choice.  A shift to Aurora may need to happen.
     */
    logger.info('Fetching users in Organization', {
      values: { orgId: user.organization },
    });
    const txCandidates = await getUsersInOrganization(
      user.organization,
      dynamoClient
    );
    logger.verbose('Received users in org', { values: txCandidates });

    logger.verbose('Creating user map based on txCandidates');
    const addressCToUserMap = txCandidates.reduce((acc, curr) => {
      if (txAddresses.includes(curr.walletAddressC)) {
        acc[curr.walletAddressC] = curr;
      }
      return acc;
    }, {} as { [key: string]: User });
    logger.verbose('Created user map', { values: { addressCToUserMap } });

    logger.verbose('Matching txns to users');
    const txsWithUserData = rawUserTxs.map((tx) => {
      const fromUser = {
        ...addressCToUserMap[tx.from],
        walletPrivateKeyWithLeadingHex: undefined,
        email: undefined,
      } as UserWithPublicData;

      const toUser = {
        ...addressCToUserMap[tx.to],
        walletPrivateKeyWithLeadingHex: undefined,
        email: undefined,
      } as UserWithPublicData;

      return { ...tx, fromUser, toUser };
    }, []);
    logger.verbose('Matched txns to users', { values: { txsWithUserData } });

    const returnValue = generateReturn(200, {
      txs: txsWithUserData,
    });

    logger.info('Returning', { values: returnValue });

    return returnValue;
  } catch (error) {
    logger.error('Failed to get wallet', {
      values: error,
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
      error: error,
    });
  }
};
