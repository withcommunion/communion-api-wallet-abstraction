import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import type { Contract, Transaction } from 'ethers';
import { generateReturn } from '../util/api-util';
import {
  initDynamoClient,
  getOrgById,
  OrgWithPublicData,
  batchGetUsersById,
  getUserById,
  UserWithPublicData,
  User,
  OrgWithPrivateData,
  OrgWithManagerData,
} from '../util/dynamo-util';

import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

import {
  getCommunionTestGovernanceContract,
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';

const dynamoClient = initDynamoClient();

function removePrivateDataFromUsersHelper(
  usersInOrg: User[]
): UserWithPublicData[] {
  const usersInOrgWithPublicData = usersInOrg.map(
    (user) =>
      ({
        ...user,
        email: undefined,
        walletPrivateKeyWithLeadingHex: undefined,
        phone_number: undefined,
      } as UserWithPublicData)
  );

  logger.info('Removed Self, Seeder and private data', {
    values: { usersInOrgWithPublicData },
  });

  return usersInOrgWithPublicData;
}

function getGovernanceContract(org: OrgWithPrivateData) {
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

  return governanceContract;
}

async function isUserInOrgInSmartContract(
  governanceContract: Contract,
  userWalletAddressC: string
) {
  try {
    logger.info('Checking if user is in Governance Contract', {
      values: {
        contractAddress: governanceContract.address,
        userWalletAddressC,
      },
    });
    // eslint-disable-next-line
    const isUserInContract = (await governanceContract.hasEmployee(
      userWalletAddressC
    )) as boolean;

    return isUserInContract;
  } catch (error) {
    logger.error('Failed to check if user is in Governance Contract', {
      values: {
        contractAddress: governanceContract.address,
        userWalletAddressC,
        error,
      },
    });
  }
}

async function addUserToOrgInSmartContractHelper(
  governanceContract: Contract,
  userWalletAddressC: string
) {
  try {
    logger.info('Attempting to add user to org in smart contract', {
      values: { userWalletAddressC },
    });

    // eslint-disable-next-line
    const txn = (await governanceContract.addEmployee(
      userWalletAddressC
    )) as Transaction;

    logger.info('Successfully sent txn to add user to contract', {
      values: { txn, address: userWalletAddressC },
    });

    return txn;
  } catch (error) {
    logger.error('Failed to add user to org in smart contract', {
      values: { userWalletAddressC, error },
    });
    return { hasAddEmployeeMethod: false };
  }
}

async function ensureMemberIsInOrgSmartContractHelper(
  requestingUser: User,
  org: OrgWithPrivateData
) {
  try {
    const userForLogging = {
      id: requestingUser.id,
      name: `${requestingUser.first_name} ${requestingUser.last_name}`,
      walletAddressC: requestingUser.walletAddressC,
    };

    logger.verbose('Checking if user in org is in org smart contract', {
      values: {
        user: userForLogging,
        orgContract: org.avax_contract,
      },
    });
    const governanceContract = getGovernanceContract(org);
    const isUserInContract = await isUserInOrgInSmartContract(
      governanceContract,
      requestingUser.walletAddressC
    );
    logger.info('Is user in org in smart contract', {
      values: {
        isUserInContract,
        user: userForLogging,
        contractAddress: governanceContract.address,
      },
    });

    if (!isUserInContract) {
      logger.info('User is not in the contract, adding them', {
        values: {
          user: userForLogging,
          orgContract: org.avax_contract,
        },
      });
      const txn = await addUserToOrgInSmartContractHelper(
        governanceContract,
        requestingUser.walletAddressC
      );
      logger.info('Made txn to add user', {
        values: { txn, user: userForLogging },
      });

      return true;
    }

    logger.info('User is in org, no need to add them', {
      values: { user: userForLogging, isUserInContract },
    });
    return true;
  } catch (error) {
    logger.error('Failed to ensure member is in smart contract', {
      userId: requestingUser.id,
      values: error,
    });
  }
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

    logger.info('Incoming Event', {
      values: { event },
    });
    logger.verbose('Incoming Event Auth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    const orgId = event.pathParameters?.orgId;

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

    logger.verbose('Getting requesting by id', {
      values: { userId: requestUserId },
    });
    const requestingUser = await getUserById(requestUserId, dynamoClient);
    if (!requestingUser) {
      logger.error(
        'User not found on - something is wrong, user is Authd and exists in Cognito but not in our DB',
        {
          values: { requestUserId },
        }
      );
      return generateReturn(404, { message: 'User not found' });
    }
    logger.info('Received user', { values: { requestingUser } });

    const isRequestingUserManager =
      requestingUser.organizations.find((usersOrg) => usersOrg.orgId === orgId)
        ?.role === 'manager';

    logger.verbose('Is User a manager?', {
      values: { isRequestingUserManager },
    });

    await ensureMemberIsInOrgSmartContractHelper(requestingUser, org);

    const baseOrgWithPublicData = {
      id: org.id,
      actions: org.actions,
      roles: org.roles,
      member_ids: org.member_ids,
      redeemables: org.redeemables,
      avax_contract: org.avax_contract,
      minted_nfts: org.minted_nfts,
      available_nfts: org.available_nfts,
    } as OrgWithPublicData;

    const orgWithPublicData: OrgWithManagerData | OrgWithPublicData =
      isRequestingUserManager
        ? ({
            ...baseOrgWithPublicData,
            join_code: org.join_code,
          } as OrgWithManagerData)
        : baseOrgWithPublicData;

    logger.info('Returning org with Public Data', {
      values: { orgWithPublicData },
    });
    logger.verbose('Fetching all users in org', {
      values: { member_ids: orgWithPublicData.member_ids },
    });
    const allUsersInOrgWithPrivateData = await batchGetUsersById(
      orgWithPublicData.member_ids,
      dynamoClient
    );
    logger.verbose('Received users in org', {
      values: { orgId, usersInOrg: allUsersInOrgWithPrivateData },
    });

    const usersInOrgWithoutSelfAndSeeder = allUsersInOrgWithPrivateData.filter(
      (user) => user.id !== requestUserId && user.role !== 'seeder'
    );

    const usersInOrgWithPublicData = removePrivateDataFromUsersHelper(
      usersInOrgWithoutSelfAndSeeder
    );

    return generateReturn(200, {
      ...orgWithPublicData,
      members: usersInOrgWithPublicData,
    });
  } catch (error) {
    logger.error('Failed to get org', {
      values: { error },
    });

    return generateReturn(500, {
      message: 'Something went wrong trying to get the org',
      error: error,
    });
  }
};
