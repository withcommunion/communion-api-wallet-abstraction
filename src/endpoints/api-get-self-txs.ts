import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  initDynamoClient,
  getUserById,
  getOrgById,
  getUserReceivedTxsInOrg,
  getUserSentTxsInOrg,
  batchGetUsersById,
  User,
  Transaction,
  OrgWithPrivateData,
} from '../util/dynamo-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    setDefaultLoggerMetaForApi(event, logger);

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can come through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.queryStringParameters?.orgId;
    if (!orgId) {
      logger.info('No orgId provided, returning 400', {
        values: { orgId, qsp: event.queryStringParameters },
      });
      generateReturn(400, {
        message:
          'Please provide "orgId=" as a query string parameter.  For now only one org is supported.',
      });
    }

    logger.verbose('Fetching user', { values: { userId: userId } });
    const self = await getUserById(userId, dynamoClient);
    if (!self) {
      logger.error(
        'User not found on - something is wrong, user is Authd and exists in Cognito but not in our DB',
        {
          values: { userId },
        }
      );
      return generateReturn(404, { message: 'User not found' });
    }
    logger.info('Received user', { values: self });

    const orgIdToFetch = orgId ? orgId : self.organizations[0].orgId;

    const org = await fetchOrgHelper(orgIdToFetch);

    if (!org) {
      logger.info('User is not in any orgs', {
        values: { orgId, selfOrgs: self.organizations },
      });

      return generateReturn(404, {
        message: 'User is not in any orgs, so there is nothing to fetch',
      });
    }

    const allTxs = await fetchSelfTxsInOrgHelper(org, self);

    const allUsersTransactedWith = await fetchUsersInTxsHelper(allTxs);

    const completeCommunionTxnsForUser = constructCompleteTxsForUserHelper(
      self,
      allTxs,
      allUsersTransactedWith,
      org
    ).sort((txA, txB) => txA.timeStampSeconds - txB.timeStampSeconds);

    const returnValue = generateReturn(200, {
      txs: completeCommunionTxnsForUser,
    });
    logger.info('Returning', { values: returnValue });

    return returnValue;
  } catch (error) {
    logger.error('Failed to get self txs', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to fetch your txs',
      error: error,
    });
  }
};

async function fetchOrgHelper(orgId: string) {
  try {
    logger.info('Fetching org', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.verbose('Received orgs', { values: { org } });
    return org;
  } catch (error) {
    logger.error('Failed to fetch org', { values: { error, orgId } });
  }
}

async function fetchSelfTxsInOrgHelper(org: OrgWithPrivateData, self: User) {
  try {
    logger.info('Fetching self txs in tx db', {
      values: { orgId: org.id, selfId: self.id },
    });
    const receivedTxs = await getUserReceivedTxsInOrg(
      org.id,
      self.id,
      dynamoClient
    );

    const sentTxs = await getUserSentTxsInOrg(org.id, self.id, dynamoClient);
    logger.verbose('Received txs', {
      values: { orgId: org.id, selfId: self.id, receivedTxs, sentTxs },
    });

    return [...receivedTxs, ...sentTxs];
  } catch (error) {
    logger.error('Failed to fetch users txs from db', {
      values: { error, orgId: org.id, selfId: self.id },
    });
    throw error;
  }
}

async function fetchUsersInTxsHelper(allTxs: Transaction[]) {
  try {
    logger.info('Fetching users in txs', {
      values: { allTxsLength: allTxs.length },
    });

    const userMap = {} as { [userId: string]: boolean };
    allTxs.forEach((tx) => {
      userMap[tx.from_user_id] = true;
      userMap[tx.to_user_id] = true;
    });

    const userIds = Object.keys(userMap);
    // TODO: Deal with 100+ users
    if (userIds.length > 75) {
      // TODO: Alert here!
      logger.error('We are gonna break at 100, lets loop through this!');
    }

    const users = await batchGetUsersById(userIds, dynamoClient);
    logger.verbose('Received users', { values: { users } });
    return users;
  } catch (error) {
    logger.error('Failed to fetch users in txs', { values: { error } });
    throw error;
  }
}

interface CommunionTx {
  timeStampSeconds: number;
  tokenName: string;
  tokenSymbol: string;
  value: number;
  txHash: string;
  txHashUrl: string;
  txStatus: 'succeeded' | 'failed';
  txType: 'received' | 'sent' | 'redemption';
  fromUser: {
    id: string;
    walletAddressC: string;
    firstName: string;
    lastName: string;
  };
  toUser: {
    id: string;
    walletAddressC: string;
    firstName: string;
    lastName: string;
  };
}

function constructCompleteTx(
  self: User,
  tx: Transaction,
  userIdUserMap = {} as { [userId: string]: User },
  org: OrgWithPrivateData
): CommunionTx {
  const rootExplorerUrl =
    process.env.STAGE === 'prod'
      ? `https://snowtrace.io`
      : `https://testnet.snowtrace.io`;
  const fromUser = {
    id: userIdUserMap[tx.from_user_id].id,
    walletAddressC: userIdUserMap[tx.from_user_id].walletAddressC.toLowerCase(),
    firstName: userIdUserMap[tx.from_user_id].first_name,
    lastName: userIdUserMap[tx.from_user_id].last_name,
  };
  const toUser = {
    id: userIdUserMap[tx.to_user_id].id,
    walletAddressC: userIdUserMap[tx.to_user_id].walletAddressC.toLowerCase(),
    firstName: userIdUserMap[tx.to_user_id].first_name,
    lastName: userIdUserMap[tx.to_user_id].last_name,
  };

  const isRedemptionTxn =
    toUser.walletAddressC === '0x0000000000000000000000000000000000000000';
  const isReceivedTxn =
    toUser.walletAddressC === self.walletAddressC.toLowerCase();

  let txType: CommunionTx['txType'];
  if (isRedemptionTxn) {
    txType = 'redemption';
  } else if (isReceivedTxn) {
    txType = 'received';
  } else {
    txType = 'sent';
  }

  return {
    fromUser,
    toUser,
    txType,
    timeStampSeconds: tx.created_at,
    tokenName: org.avax_contract.token_name,
    tokenSymbol: org.avax_contract.token_symbol,
    value: tx.amount,
    txHash: tx.tx_hash,
    txHashUrl: `https://${rootExplorerUrl}/tx/${tx.tx_hash}`,
    // TODO: We will want this when we deal with other statuses, rn only succeeded goes in DB
    txStatus: 'succeeded',
  };
}

function constructCompleteTxsForUserHelper(
  self: User,
  allTxs: Transaction[],
  allUsersTransactedWith: User[],
  org: OrgWithPrivateData
): CommunionTx[] {
  try {
    logger.info('Constructing complete txs for user', {
      values: {
        selfId: self.id,
        allTxsLength: allTxs,
        allUsersTransactedWithLength: allUsersTransactedWith,
      },
    });
    const userIdUserMap = {} as { [userId: string]: User };
    [...allUsersTransactedWith, self].forEach((user) => {
      userIdUserMap[user.id] = user;
    });

    const communionTxs = allTxs.map((tx) =>
      constructCompleteTx(self, tx, userIdUserMap, org)
    );
    logger.verbose('Constructed complete txs for user', {
      values: { communionTxs },
    });

    return communionTxs;
  } catch (error) {
    console.error(error);
    logger.error('Failed to construct complete txs for user', {
      values: { error },
    });
    throw error;
  }
}
