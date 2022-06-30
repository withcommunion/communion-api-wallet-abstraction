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
    const user = await getUserById(userId, dynamoClient);
    logger.verbose('Received user', { values: user });

    const usersAddressC = user.walletAddressC;

    logger.info('Fetching user transactions', { values: { usersAddressC } });
    const rawUserTxs = await getAddressTxHistory(usersAddressC);
    logger.verbose('Received txns', { values: { rawUserTxs } });

    logger.info('Creating txAddress array');
    const txAddresses = rawUserTxs
      .reduce((acc, curr) => {
        acc.push(curr.from.toLowerCase());
        acc.push(curr.to.toLowerCase());
        return acc;
      }, [] as string[])
      .filter((item, _, arr) => arr.includes(item));
    logger.verbose('Created txAddresses array', { values: { txAddresses } });

    /**
     * TODO - This API endpoint will be /org/id/self/txs
     * And then a user can view their history within the context of an org
     * Or we can create a table that has user wallet addy as the primary key with user id as attribute
     * Then we can batch fetch
     * And then batch fetch again
     * This will support the user viewing their own history across multiple orgs
     *
     */
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
      if (txAddresses.includes(curr.walletAddressC.toLowerCase())) {
        acc[curr.walletAddressC.toLowerCase()] = curr;
      }
      return acc;
    }, {} as { [key: string]: User });
    logger.verbose('Created user map', { values: { addressCToUserMap } });

    // TODO - This should be a helper function
    logger.verbose('Matching txns to users');
    const txsWithUserData = rawUserTxs.map((tx) => {
      const fromUser = {
        ...addressCToUserMap[tx.from.toLowerCase()],
        walletPrivateKeyWithLeadingHex: undefined,
        email: undefined,
      } as UserWithPublicData;

      const toUser = {
        ...addressCToUserMap[tx.to.toLowerCase()],
        walletPrivateKeyWithLeadingHex: undefined,
        email: undefined,
      } as UserWithPublicData;

      return { ...tx, fromUser, toUser };
    }, []);
    logger.verbose('Matched txns to users', { values: { txsWithUserData } });

    const returnValue = generateReturn(200, { txs: txsWithUserData });

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
