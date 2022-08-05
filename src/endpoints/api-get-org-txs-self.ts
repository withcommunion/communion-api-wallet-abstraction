import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import {
  User,
  UserInTxn,
  getUserById,
  initDynamoClient,
  getOrgById,
  batchGetUsersById,
  OrgWithPrivateData,
} from '../util/dynamo-util';
import { getAddressTxHistory, HistoricalTxn } from '../util/avax-chain-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

function createUserTxnHistoryHelper(
  rawUserTxs: HistoricalTxn[],
  txCandidates: User[],
  organization: OrgWithPrivateData
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
    const txnIsFromOrgSeeder = Boolean(
      tx.from.toLowerCase() === organization.seeder.walletAddressC.toLowerCase()
    );

    const fromUser: UserInTxn = txnIsFromOrgSeeder
      ? {
          first_name: `${organization.avax_contract.token_symbol} Bank`,
          last_name: '',
          id: organization.id,
        }
      : {
          first_name: addressCToUserMap[tx.from.toLowerCase()].first_name,
          last_name: addressCToUserMap[tx.from.toLowerCase()].last_name,
          id: addressCToUserMap[tx.from.toLowerCase()].id,
        };

    const toUser: UserInTxn = txnIsFromOrgSeeder
      ? {
          first_name: `${organization.avax_contract.token_symbol} Bank`,
          last_name: '',
          id: organization.id,
        }
      : {
          first_name: addressCToUserMap[tx.to.toLowerCase()].first_name,
          last_name: addressCToUserMap[tx.to.toLowerCase()].last_name,
          id: addressCToUserMap[tx.to.toLowerCase()].id,
        };

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
    const requestUserId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.pathParameters?.orgId;

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    if (!orgId) {
      return generateReturn(400, {
        message: 'Missing orgId',
      });
    }

    logger.verbose('Getting org by id', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.info('Received org', { values: { org } });

    if (!org) {
      logger.verbose('Returing 404, the org was not found', {
        values: { orgId },
      });
      return generateReturn(404, {
        message: `${orgId} organization not found`,
      });
    }

    if (!org.member_ids.includes(requestUserId)) {
      logger.warn('User is not a member of this org, why are they here?', {
        values: { requestUserId, orgId },
      });
      return generateReturn(403, {
        message: `${requestUserId} is not a member of ${orgId}`,
      });
    }

    logger.verbose('Fetching user', { values: { requestUserId } });
    const user = await getUserById(requestUserId, dynamoClient);
    if (!user) {
      return generateReturn(404, { message: 'User not found' });
    }
    logger.info('Received user', { values: user });

    const usersAddressC = user.walletAddressC;

    logger.verbose('Fetching users in Organization', {
      values: { orgId },
    });
    const txCandidates = await batchGetUsersById(org.member_ids, dynamoClient);
    logger.info('Received users in org', { values: txCandidates });

    logger.verbose('Fetching user transactions', { values: { usersAddressC } });
    const rawUserTxs = await getAddressTxHistory(
      usersAddressC,
      org.avax_contract.token_address
    );
    logger.info('Received txns', { values: { rawUserTxs } });

    const txsWithUserData = createUserTxnHistoryHelper(
      rawUserTxs,
      txCandidates,
      org
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
