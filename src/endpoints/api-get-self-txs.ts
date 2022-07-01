import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import {
  User,
  UserWithPublicData,
  getUserById,
  initDynamoClient,
  getUsersInOrganization,
} from '../util/dynamo-util';
import { getAddressTxHistory, HistoricalTxn } from '../util/avax-chain-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

function createUserTxnHistoryHelper(
  rawUserTxs: HistoricalTxn[],
  txCandidates: User[]
) {
  logger.verbose('Creating txAddress array');
  const txAddresses = rawUserTxs
    .reduce((acc, curr) => {
      acc.push(curr.from.toLowerCase());
      acc.push(curr.to.toLowerCase());
      return acc;
    }, [] as string[])
    .filter((item, _, arr) => arr.includes(item));
  logger.info('Created txAddresses array', { values: { txAddresses } });

  logger.verbose('Creating user map based on txCandidates');
  const addressCToUserMap = txCandidates.reduce((acc, curr) => {
    if (txAddresses.includes(curr.walletAddressC.toLowerCase())) {
      acc[curr.walletAddressC.toLowerCase()] = curr;
    }
    return acc;
  }, {} as { [key: string]: User });
  logger.info('Created user map', { values: { addressCToUserMap } });

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
  logger.info('Matched txns to users', { values: { txsWithUserData } });
  return txsWithUserData;
}

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

    logger.verbose('Fetching user', { values: { userId: userId } });
    const user = await getUserById(userId, dynamoClient);
    if (!user) {
      return generateReturn(404, { message: 'User not found' });
    }
    logger.info('Received user', { values: user });

    const usersAddressC = user.walletAddressC;
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
    logger.verbose('Fetching users in Organization', {
      values: { orgId: user.organization },
    });
    const txCandidates = await getUsersInOrganization(
      user.organization,
      dynamoClient
    );
    logger.info('Received users in org', { values: txCandidates });

    logger.verbose('Fetching user transactions', { values: { usersAddressC } });
    const rawUserTxs = await getAddressTxHistory(usersAddressC);
    logger.info('Received txns', { values: { rawUserTxs } });

    const txsWithUserData = createUserTxnHistoryHelper(
      rawUserTxs,
      txCandidates
    );

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
