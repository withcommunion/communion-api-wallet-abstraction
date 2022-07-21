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
  initDynamoClient,
  getOrgById,
  OrgWithPrivateData,
  getUserById,
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
    )) as Transaction;

    logger.verbose('Burned tokens', { values: { transaction } });

    return transaction;
  } catch (error) {
    logger.error('Failed to burning tokens', {
      values: { user, amount, error },
    });
    throw error;
  }
}

interface ExpectedPostBody {
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
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.pathParameters?.orgId;

    let amount = 0;
    try {
      if (!event.body) {
        return generateReturn(400, {
          message: 'No body provided, need amount',
          body: event.body,
        });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      amount = body.amount;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body', error });
    }

    if (!orgId || !userId || !amount) {
      return generateReturn(400, {
        message: 'Missing required fields',
        fields: { amount, orgId, userId },
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
