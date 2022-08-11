/**
 * TODO: Update to include adding user to the orgs governance contract
 * TODO: Add tests for this function
 * This is a shit show - but it works for now.
 * The manual role passing isn't good
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import type { Transaction } from 'ethers';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import {
  initDynamoClient,
  addUserToOrg,
  addOrgToUser,
  User,
  OrgWithPrivateData,
  getUserById,
  getOrgById,
} from '../util/dynamo-util';

import {
  getCommunionTestGovernanceContract,
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';

const dynamoClient = initDynamoClient();

async function addOrgToUserHelper(userId: string, orgId: string) {
  try {
    logger.verbose('Attempting to add org to user', {
      values: { userId, orgId },
    });
    /**
     * All users start as a "worker" in org
     * Will have managers or owners add them to other roles
     */
    const respFromDb = await addOrgToUser(
      userId,
      orgId,
      'worker',
      dynamoClient
    );
    logger.info('Added org to user', {
      values: { orgId, respFromDb },
    });

    return respFromDb;
  } catch (error) {
    // @ts-expect-error error.name does exist here
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn(
        `Org already exists in user ${orgId}, this is weird - but it is okay.`,
        {
          values: { userId, orgId },
        }
      );

      return null;
    } else {
      // TODO: Alert - this is bad
      logger.error('Fatal: Failed to add org to user', {
        values: { userId, orgId, error },
      });
      throw error;
    }
  }
}

async function addUserToOrgHelper(userId: string, orgId: string) {
  try {
    logger.verbose('Attempting to add user to org', {
      values: { userId, orgId },
    });
    const respFromDb = await addUserToOrg(userId, orgId, dynamoClient);
    logger.info('Added user to org', {
      values: { orgId, respFromDb },
    });

    return respFromDb;
  } catch (error) {
    // @ts-expect-error error.name does exist here
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn(
        `User already exists in org ${orgId}, this is weird - but it is okay.`,
        {
          values: { userId, orgId },
        }
      );

      return null;
    } else {
      // TODO: Alert - this is bad
      logger.error('Fatal: Failed to add user to org', {
        values: { userId, orgId, error },
      });
      throw error;
    }
  }
}

async function addUserToOrgInSmartContractHelper(
  org: OrgWithPrivateData,
  user: User
) {
  try {
    logger.info('Attempting to add user to org in smart contract', {
      values: { user },
    });
    const governanceContractAddress = org?.avax_contract?.address || '';
    const orgDevWallet = getEthersWallet(
      org?.seeder.privateKeyWithLeadingHex || ''
    );

    /**
     * TODO: This is a hack to get the smart contract to work.
     * We will need to make this more robust - store ABI in Dynamo?
     */
    const governanceContract =
      org.id === 'communion-test-org'
        ? getCommunionTestGovernanceContract(
            governanceContractAddress,
            orgDevWallet
          )
        : getJacksPizzaGovernanceContract(
            governanceContractAddress,
            orgDevWallet
          );

    // eslint-disable-next-line
    const txn = (await governanceContract.addEmployee(
      user.walletAddressC
    )) as Transaction;
    logger.info('Successfully added user to org in smart contract', {
      values: { txn, address: user.walletAddressC },
    });

    return txn;
  } catch (error) {
    logger.error('Failed to add user to org in smart contract', {
      values: { user, error },
    });
    throw error;
  }
}

interface ExpectedPostBody {
  joinCode: string;
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
    if (!orgId) {
      return generateReturn(400, { message: 'orgId is required' });
    }

    let joinCode = '';
    try {
      if (!event.body) {
        return generateReturn(400, { message: 'No body provided' });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      if (body.joinCode) {
        joinCode = body.joinCode;
      }
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body' });
    }

    logger.info('Fetching org from db', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.verbose('Retrieved org from db', { values: { org } });

    if (!org) {
      logger.info('Org not found', { values: { orgId } });
      return generateReturn(400, {
        message: 'org wht given id does not exist',
        orgId,
      });
    }

    if (org.join_code && org.join_code !== joinCode) {
      logger.warn('Join code does not match', {
        values: { orgId, orgJoinCode: org.join_code, joinCode, userId },
      });
      return generateReturn(401, {
        message:
          'Join code does not match, you are not allowed to join this org',
      });
    }

    logger.info('Fetching user from db', { values: { userId } });
    const user = await getUserById(userId, dynamoClient);
    logger.verbose('Retrieved user from db', { values: { user } });

    const orgIsAlreadyInUserObject = Boolean(
      user.organizations.filter((org) => org.orgId === orgId).length
    );

    if (!orgIsAlreadyInUserObject) {
      await addOrgToUserHelper(userId, orgId);
    } else {
      logger.warn('No-op: User obj already has org');
    }

    const userWasAddedToOrg = Boolean(await addUserToOrgHelper(userId, orgId));
    if (!userWasAddedToOrg) {
      logger.warn('No-op: User already exists in org, and that is okay.');
    }

    const txn = await addUserToOrgInSmartContractHelper(org, user);

    return generateReturn(200, {
      userAddedInDb: true,
      userAddedInSmartContract: true,
      userAddContractTxn: txn,
    });
  } catch (error) {
    console.log(error);
    logger.error('Failed to join org', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to join the org',
      error: error,
    });
  }
};
