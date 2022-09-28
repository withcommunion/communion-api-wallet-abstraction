import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { Contract, Transaction as EthersTxn } from 'ethers';
import {
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';
import {
  User,
  initDynamoClient,
  getOrgById,
  OrgWithPrivateData,
  getUserById,
  insertTransaction,
  Transaction,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

async function fetchUserHelper(userId: string) {
  logger.verbose('Fetching user', { values: { userId } });
  try {
    const user = await getUserById(userId, dynamoClient);

    if (!user) {
      logger.error('The user does not exist', {
        values: { userId },
      });
      return null;
    }

    logger.info('Received user', { values: { userId, user } });
    return user;
  } catch (error) {
    logger.error('Error fetching users', {
      values: { userId, error },
    });
    throw error;
  }
}

async function getOrgGovernanceContractHelper(org: OrgWithPrivateData) {
  try {
    const governanceContractAddress = org?.avax_contract?.address;
    if (!governanceContractAddress) {
      logger.error(
        'Failed to get governance contract address from org - it should have one',
        {
          values: { org },
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
      values: { org, error },
    });
    throw error;
  }
}

async function burnTokensHelper(
  user: User,
  amount: number,
  governanceContract: Contract
) {
  try {
    logger.info('Burning tokens', {
      values: {
        user: {
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          address: user.walletAddressC,
        },
        amount,
      },
    });

    // eslint-disable-next-line
    const transaction = (await governanceContract.burnEmployeeTokens(
      user.walletAddressC,
      amount
    )) as EthersTxn;

    logger.verbose('Burned tokens', { values: { transaction } });

    return transaction;
  } catch (error) {
    logger.error('Failed to burning tokens', {
      values: { user, amount, error },
    });
    throw error;
  }
}

async function storeTransactionsHelper(
  orgId: string,
  fromUser: User,
  message: string,
  amount: number,
  transaction: EthersTxn
) {
  logger.info('Storing transaction in TransactionsTable');
  logger.verbose('Values to store in TxnTable', {
    values: {
      orgId,
      fromUser,
      transaction,
    },
  });
  try {
    const hash = transaction.hash || `RANDOM:${Math.random()}`;
    /**
     * This is the burn address, where the token is actually going
     * Would use transaction.to but that is to the contract and not for the token itself
     */
    const toId = '0x0000000000000000000000000000000000000000';
    const txn = {
      org_id: orgId,
      to_user_id_txn_hash_urn: `${toId}:${hash}`,
      from_user_to_user_txn_hash_urn: `${fromUser.id}:${toId}:${hash}`,
      to_user_id: toId,
      from_user_id: fromUser.id,
      tx_hash: hash,
      amount,
      // Store in seconds because expiry time uses seconds, let's stay consistent
      created_at: Math.floor(Date.now() / 1000),
      message,
      type: 'redemption',
    } as Transaction;

    const insertResps = await insertTransaction(txn, dynamoClient);

    logger.verbose('Stored txn in TransactionsTable', {
      values: { insertResps },
    });

    return insertResps;
  } catch (error) {
    logger.error('Failed to store transactions in table', {
      values: {
        error,
        args: {
          orgId,
          fromUser,
          message,
          amount,
          transaction,
        },
      },
    });
    console.error(error);
  }
}

interface ExpectedPostBody {
  amount: number;
  message: string;
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
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.pathParameters?.orgId;

    let amount = 0;
    let message = '';
    try {
      if (!event.body) {
        return generateReturn(400, {
          message: 'No body provided, need amount',
          body: event.body,
        });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      amount = body.amount;
      message = body.message;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body', error });
    }

    if (!orgId || !userId || !amount || !message) {
      return generateReturn(400, {
        message: 'Missing required fields',
        fields: { amount, orgId, userId, message },
      });
    }

    const user = await fetchUserHelper(userId);
    if (!user) {
      logger.error('We could not find the user', {
        values: { userId, user },
      });
      return generateReturn(404, { message: 'Could not find user' });
    }

    const isUserInOrg = Boolean(
      user.organizations.find((org) => org.orgId === orgId)
    );

    if (!isUserInOrg) {
      return generateReturn(401, {
        message:
          'Unauthorized: You are not in the organization that you are trying to claim rewards from',
        fields: { orgId, isUserInOrg },
      });
    }

    const org = await getOrgById(orgId, dynamoClient);
    if (!org) {
      return generateReturn(404, {
        message: 'the requested org was not found',
        orgId,
      });
    }

    const orgGovernanceContract = await getOrgGovernanceContractHelper(org);

    const transaction = await burnTokensHelper(
      user,
      amount,
      orgGovernanceContract
    );

    await storeTransactionsHelper(orgId, user, message, amount, transaction);

    logger.info('Returning 200', {
      values: { transaction, txnHash: transaction.hash },
    });
    return generateReturn(200, { transaction, txnHash: transaction.hash });
  } catch (error) {
    logger.error('Failed to Redeem rewards', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to redeem rewards',
      error: error,
    });
  }
};
