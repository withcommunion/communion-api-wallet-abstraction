import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { Contract, Transaction } from 'ethers';
import {
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';
import {
  User,
  batchGetUsersById,
  initDynamoClient,
  getOrgById,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

async function fetchToAndFromUserHelper(toUserId: string, fromUserId: string) {
  logger.verbose('Fetching users', { values: { toUserId, fromUserId } });
  try {
    const users = await batchGetUsersById([toUserId, fromUserId], dynamoClient);

    const toUser = users.find((user) => user.id === toUserId);
    const fromUser = users.find((user) => user.id === fromUserId);

    if (!toUser || !fromUser) {
      logger.verbose('The users did not exist', {
        values: { toUserId, fromUserId, toUser, fromUser },
      });
      return { toUser: null, fromUser: null };
    }

    logger.info('Received users', { values: { toUser, fromUser } });
    return { toUser, fromUser };
  } catch (error) {
    logger.error('Error fetching users', {
      values: { toUserId, fromUserId, error },
    });
    throw error;
  }
}

async function getOrgGovernanceContractHelper(orgId: string) {
  try {
    const org = await getOrgById(orgId, dynamoClient);
    const governanceContractAddress = org?.avax_contract?.address;
    if (!governanceContractAddress) {
      logger.error(
        'Failed to get governance contract address from org - it should have one',
        {
          values: { orgId, org },
        }
      );
      throw new Error('No governance contract address found');
    }

    const orgDevWallet = getEthersWallet(org.seeder.privateKeyWithLeadingHex);
    const governanceContract = getJacksPizzaGovernanceContract(
      governanceContractAddress,
      orgDevWallet
    );

    return governanceContract;
  } catch (error) {
    logger.error('Error fetching org governance contract', {
      values: { orgId, error },
    });
    throw error;
  }
}

async function transferTokensHelper(
  fromUser: User,
  toUser: User,
  amount: number,
  governanceContract: Contract
) {
  logger.info('Transferring tokens', {
    values: {
      fromUser: { id: fromUser.id, address: fromUser.walletAddressC },
      toUser: { id: toUser.id, address: toUser.walletAddressC },
      amount,
    },
  });

  // eslint-disable-next-line
  const transaction = (await governanceContract.transferEmployeeTokens(
    fromUser.walletAddressC,
    toUser.walletAddressC,
    amount
  )) as Transaction;

  logger.verbose('Transferred tokens', { values: { transaction } });

  return transaction;
}

interface ExpectedPostBody {
  toUserId: string;
  orgId: string;
  amount: number;
}

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
    // For some reason it can go through in two seperate ways
    const fromUserId =
      (claims.username as string) || (claims['cognito:username'] as string);

    let orgId = '';
    let toUserId = '';
    let amount = 0;
    try {
      if (!event.body) {
        return generateReturn(400, { message: 'No body provided' });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      orgId = body.orgId;
      toUserId = body.toUserId;
      amount = body.amount;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body' });
    }

    if (!orgId || !toUserId || !fromUserId || !amount) {
      return generateReturn(400, {
        message: 'Missing required fields in body',
        fields: { orgId, toUserId, amount },
      });
    }

    const { toUser, fromUser } = await fetchToAndFromUserHelper(
      toUserId,
      fromUserId
    );
    if (!toUser || !fromUser) {
      logger.error('We could not find the users', {
        values: { toUser, fromUser },
      });
      return generateReturn(400, { message: 'Could not find users' });
    }

    const isToUserInOrg = Boolean(
      toUser.organizations.find((org) => org.orgId === orgId)
    );
    const isFromUserInOrg = Boolean(
      fromUser.organizations.find((org) => org.orgId === orgId)
    );

    if (!isToUserInOrg || !isFromUserInOrg) {
      return generateReturn(400, {
        message:
          'Either the toUser or the fromUser is not in org, they both must be in the org',
        fields: { orgId, isToUserInOrg, isFromUserInOrg },
      });
    }

    const orgGovernanceContract = await getOrgGovernanceContractHelper(orgId);

    const transaction = await transferTokensHelper(
      fromUser,
      toUser,
      amount,
      orgGovernanceContract
    );

    logger.info('Returning 200', {
      values: { transaction, txnHash: transaction.hash },
    });
    return generateReturn(200, { transaction, txnHash: transaction.hash });
  } catch (error) {
    logger.error('Failed to Transfer', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to transfer funds',
      error: error,
    });
  }
};
