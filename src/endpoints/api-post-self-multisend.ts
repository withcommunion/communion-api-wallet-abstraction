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
  getUserById,
  batchGetUsersById,
  initDynamoClient,
  getOrgById,
  OrgWithPrivateData,
} from '../util/dynamo-util';

import { sendSms } from '../util/twilio-util';

const dynamoClient = initDynamoClient();

async function fetchUsersHelper(userIds: string[]) {
  logger.verbose('Fetching users', { values: { userIds } });
  try {
    const users = await batchGetUsersById(userIds, dynamoClient);

    const areAllUsersFound = users.every((user) => Boolean(user));

    if (!users || !users.length || !areAllUsersFound) {
      logger.verbose('At least 1 user not found', { values: { userIds } });
      return null;
    }
    logger.info('Received users', { values: { users } });
    return users;
  } catch (error) {
    logger.error('Error fetching users', { values: { userIds, error } });
    throw error;
  }
}

async function getOrgGovernanceContractHelper(org: OrgWithPrivateData) {
  try {
    const governanceContractAddress = org?.avax_contract?.address; // contract address with multisend fn: 0xbA3FF6a903869A9fb40d5cEE8EdF44AdD0932f8e
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

async function constructUserPropertyArrays(
  toUsers: User[]
): Promise<{ userIds: string[]; toUsersAddresses: string[] }> {
  const userIds = toUsers.map((user) => user.id);
  const toUsersAddresses = toUsers.map((user) => user.walletAddressC);
  return { userIds, toUsersAddresses };
}

async function multisendTokenHelper(
  fromUser: User | { id: string; walletAddressC: string },
  toUsers: User[],
  amounts: number[],
  governanceContract: Contract,
  isManagerMode?: boolean
) {
  const { userIds, toUsersAddresses } = await constructUserPropertyArrays(
    toUsers
  );

  const toUsersIdsAddressesAndAmounts = userIds.map((id, index) => ({
    id,
    address: toUsersAddresses[index],
    amount: amounts[index],
  }));

  logger.info('Multisending tokens', {
    values: {
      fromUser: { id: fromUser.id, address: fromUser.walletAddressC },
      toUsers: toUsersIdsAddressesAndAmounts,
      isManagerMode,
    },
  });

  // eslint-disable-next-line
  const transaction = (await governanceContract.multisendEmployeeTokens(
    fromUser.walletAddressC,
    toUsersAddresses,
    amounts
  )) as Transaction;

  logger.verbose('Transferred tokens', { values: { transaction } });

  return transaction;
}

async function sendSmsToAllUsersHelper(
  fromUser: User,
  toUsers: User[],
  amounts: number[]
) {
  logger.info('Sending notifications');
  const sentTextMessages = await Promise.all(
    toUsers.map(async (user) => {
      if (user.phone_number) {
        const url =
          process.env.STAGE === 'prod'
            ? 'https://withcommunion.com'
            : 'https://dev.withcommunion.com';

        logger.verbose('Sending notif to user', { values: { user } });

        return sendSms(
          user.phone_number,
          `🎊 Congrats ${user.first_name}! You just received ${
            amounts[toUsers.indexOf(user)]
          } tokens from ${fromUser.first_name} ${fromUser.last_name}
            
Check it out on the app: ${url}
            `
        );
      }
    })
  );

  logger.verbose('Sent text messages', { values: { sentTextMessages } });
  return sentTextMessages;
}

interface ExpectedPostBody {
  toUserIdAndAmountObjs: { userId: string; amount: number }[];
  orgId: string;
  amount: number;
  isManagerMode?: boolean;
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
    let toUserIdAndAmountObjs: { userId: string; amount: number }[] = [];
    let isManagerModeInBody = false;
    try {
      if (!event.body) {
        return generateReturn(400, { message: 'No body provided' });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      orgId = body.orgId;
      toUserIdAndAmountObjs = body.toUserIdAndAmountObjs;
      isManagerModeInBody = Boolean(body.isManagerMode);
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body' });
    }

    if (
      !orgId ||
      !toUserIdAndAmountObjs ||
      !toUserIdAndAmountObjs.length ||
      !fromUserId
    ) {
      logger.info('Invalid request, returning 400');
      return generateReturn(400, {
        message: 'Missing required fields in body',
        fields: { orgId, toUserIdAndAmountObjs, fromUserId },
      });
    }

    const toUserIds = toUserIdAndAmountObjs.map((obj) => obj.userId);
    const amounts = toUserIdAndAmountObjs.map((obj) => obj.amount);

    const areAllAmountsValid = amounts.every((amount) => amount && amount > 0);
    if (!areAllAmountsValid) {
      logger.error('At least 1 amount is invalid', {
        values: { toUserIds, amounts },
      });
      return generateReturn(400, { message: 'At least 1 amount is invalid' });
    }

    const fromUser = await getUserById(fromUserId, dynamoClient);

    const isFromUserManager =
      fromUser.organizations.find((org) => org.orgId === orgId)?.role ===
      'manager';

    if (isManagerModeInBody && !isFromUserManager) {
      logger.warn('User requested manager mode but is not a manager', {
        values: { fromUserId, orgId, fromUserOrgs: fromUser.organizations },
      });

      return generateReturn(401, {
        message: 'You are do not have the role of "manager" in this org',
      });
    }

    const isManagerModeEnabled = isManagerModeInBody && isFromUserManager;
    const isManagerModeSendingToSelf =
      isManagerModeEnabled && toUserIds.includes(fromUserId);
    if (isManagerModeSendingToSelf) {
      /**
       * We cannot allow this, as managers can send tokens to themselves from the seed account
       */
      logger.warn('The manager is trying to send to themselves', {
        values: {
          fromUserId,
          toUserIds,
          orgId,
          fromUserOrgs: fromUser.organizations,
        },
      });

      return generateReturn(401, {
        message: 'You cannot send tokens to youself while in manager mode',
      });
    }

    const toUsers = await fetchUsersHelper(toUserIds);

    if (!toUsers || !fromUser) {
      logger.error('At least 1 user not found', {
        values: { toUsers, fromUser },
      });
      return generateReturn(404, { message: 'Could not find users' });
    }

    const areAllUsersInRequestedOrg = [fromUser, ...toUsers].every((user) =>
      Boolean(user.organizations.find((org) => org.orgId === orgId))
    );

    if (!areAllUsersInRequestedOrg) {
      return generateReturn(401, {
        message:
          'Unauthorized: at least 1 toUser or the fromUser is not in org, they all must be in the org',
        fields: { orgId, toUsers, fromUser },
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

    const userToSendTokensFrom = isManagerModeEnabled
      ? { id: `${org.id}-seeder`, walletAddressC: org.seeder.walletAddressC }
      : fromUser;

    const transaction = await multisendTokenHelper(
      userToSendTokensFrom,
      toUsers,
      amounts,
      orgGovernanceContract,
      isManagerModeEnabled
    );

    /**
     * Send twilio notif to each user
     */
    await sendSmsToAllUsersHelper(fromUser, toUsers, amounts);

    logger.info('Returning 200', {
      values: { transaction, txnHash: transaction.hash },
    });
    return generateReturn(200, { transaction, txnHash: transaction.hash });
  } catch (error) {
    logger.error('Failed to Transfer', { values: { error: error } });
    console.log(error);
    return generateReturn(500, {
      message: 'Something went wrong trying to transfer funds',
      error,
    });
  }
};
