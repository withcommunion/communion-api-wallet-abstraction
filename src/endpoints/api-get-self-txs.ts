import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  getUserById,
  initDynamoClient,
  User,
  OrgWithPrivateData,
  batchGetOrgsById,
  Transaction,
  getUserReceivedTxsInOrg,
  getUserSentTxsInOrg,
  batchGetUsersById,
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
    //  * Check for querystring param
    const orgId = event.queryStringParameters?.orgId;

    //  * Fetch user
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

    const orgIdsToFetch = orgId
      ? [orgId]
      : self.organizations.map((org) => org.orgId);
    const orgs = await fetchOrgsHelper(orgIdsToFetch);

    if (!orgs || !orgs.length) {
      logger.info('User is not in any orgs', {
        values: { orgId, selfOrgs: self.organizations },
      });

      return generateReturn(404, {
        message: 'User is not in any orgs, so there is nothing to fetch',
      });
    }

    //  * query for to
    const receivedTxs = await getUserReceivedTxsInOrg(
      orgs[1].id,
      self.id,
      dynamoClient
    );
    //  * query for from

    const sentTxs = await getUserSentTxsInOrg(
      orgs[1].id,
      self.id,
      dynamoClient
    );

    const allTxs = [...receivedTxs, ...sentTxs];

    //  * Fetch all users
    const allUsersTransactedWith = await fetchUsersInTxsHelper(allTxs);
    //  * Map them together making the txn
    //  *  Flag for received or sent
    //  *  Flag for redeem
    //  *  Flag for isFromBank
    const completeCommunionTxnsForUser = constructCompleteTxsForUserHelper(
      self,
      allTxs,
      allUsersTransactedWith,
      orgs[1]
    ).sort((txA, txB) => txA.timeStampSeconds - txB.timeStampSeconds);
    //  * Sort the array

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

async function fetchOrgsHelper(orgIds: string[]) {
  try {
    logger.info('Fetching orgs');
    const orgs = await batchGetOrgsById(orgIds, dynamoClient);
    return orgs;
  } catch (error) {
    logger.error('Failed to fetch orgs', { values: { error, orgIds } });
  }
}

async function fetchUsersInTxsHelper(allTxs: Transaction[]) {
  try {
    logger.info('Fetching users in txs');

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
  const userIdUserMap = {} as { [userId: string]: User };
  allUsersTransactedWith.forEach((user) => {
    userIdUserMap[user.id] = user;
  });

  const communionTxs = allTxs.map((tx) =>
    constructCompleteTx(self, tx, userIdUserMap, org)
  );

  return communionTxs;
}
