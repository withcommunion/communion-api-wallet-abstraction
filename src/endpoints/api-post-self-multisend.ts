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
  getUserById,
  batchGetUsersById,
  initDynamoClient,
  getOrgById,
  OrgWithPrivateData,
  Transaction,
  insertTransaction,
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

function mapUserToUserIdHelper(
  toUsers: User[],
  toUserIdAndAmountObjs: { userId: string; amount: number; message?: string }[]
) {
  return toUserIdAndAmountObjs.map((toUserIdAndAmount) => {
    const toUser = toUsers.find(
      (toUser) => toUser.id === toUserIdAndAmount.userId
    );

    if (!toUser) {
      logger.error('We failed to map a User from the DB to their found User', {
        values: { toUserIdAndAmountObjs, toUserIdAndAmount, toUsers },
      });
      throw new Error(
        'A toUserId wasnt able to be matched to a user in the DB, something is wrong here'
      );
    }

    return {
      toUser,
      amount: toUserIdAndAmount.amount,
      message: toUserIdAndAmount.message,
    };
  });
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

async function multisendTokenHelper(
  fromUser: User | { id: string; walletAddressC: string },
  toUsersAndAmounts: {
    toUser: User;
    amount: number;
    message: string | undefined;
  }[],
  governanceContract: Contract,
  isManagerMode: boolean
) {
  logger.info('Multisending tokens', {
    values: {
      fromUser: { id: fromUser.id, address: fromUser.walletAddressC },
      toUsersAndAmounts,
      isManagerMode,
    },
  });

  const toUsersAddresses = toUsersAndAmounts.map(
    (toUserAndAmount) => toUserAndAmount.toUser.walletAddressC
  );
  const amounts = toUsersAndAmounts.map(
    (toUserAndAmount) => toUserAndAmount.amount
  );
  // eslint-disable-next-line
  const transaction = (await governanceContract.multisendEmployeeTokens(
    fromUser.walletAddressC,
    toUsersAddresses,
    amounts
  )) as EthersTxn;

  logger.verbose('Transferred tokens', { values: { transaction } });

  return transaction;
}

async function storeTransactionsHelper(
  orgId: string,
  toUsersAndAmounts: {
    toUser: User;
    amount: number;
    message: string | undefined;
  }[],
  fromUser: User,
  transaction: EthersTxn,
  isManagerModeEnabled: boolean
) {
  logger.info('Storing transactions in TransactionsTable');
  logger.verbose('Values to store in TxnTable', {
    values: {
      orgId,
      toUsersAndAmounts,
      transaction,
    },
  });
  try {
    const txns: Transaction[] = toUsersAndAmounts.map(
      ({ toUser, amount, message }) => {
        /**
         * TODO: This may be bad - the hash should always there.
         * Keep an eye out for ones without
         */
        const hash =
          transaction.hash ||
          // @ts-expect-error This value does exist, but TS doesnt know it
          (transaction.transactionHash as string) ||
          `RANDOM:${Math.random()}`;
        const fromUserId = isManagerModeEnabled ? `${orgId}` : fromUser.id;
        return {
          org_id: orgId,
          to_user_id_txn_hash_urn: `${toUser.id}:${hash}`,
          from_user_to_user_txn_hash_urn: `${fromUserId}:${toUser.id}:${hash}`,
          to_user_id: toUser.id,
          from_user_id: fromUserId,
          tx_hash: hash,
          amount,
          // Store in seconds because expiry time uses seconds, let's stay consistent
          created_at: Math.floor(Date.now() / 1000),
          message,
          type: 'tokenSend',
          modifier: undefined,
        };
      }
    );

    const insertResps = await Promise.all(
      txns.map((txn) => insertTransaction(txn, dynamoClient))
    );

    logger.verbose('Stored txns in TransactionsTable', {
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
          toUsersAndAmounts,
          transaction,
        },
      },
    });
    console.error(error);
  }
}

async function sendSmsToAllUsersHelper(
  fromUser: User,
  toUsersAndAmounts: {
    toUser: User;
    amount: number;
    message: string | undefined;
  }[]
) {
  logger.info('Sending notifications');
  const sentTextMessages = await Promise.all(
    toUsersAndAmounts.map(async ({ toUser, amount, message }) => {
      if (toUser.phone_number && toUser.allow_sms) {
        const url =
          process.env.STAGE === 'prod'
            ? 'https://withcommunion.com'
            : 'https://dev.withcommunion.com';

        logger.verbose('Sending notif to user', { values: { toUser } });

        const theySentMsg = message ? 'They sent you a message!' : '';
        return sendSms(
          toUser.phone_number,
          `🎊 Congrats ${toUser.first_name}! You just received ${amount} tokens from ${fromUser.first_name} ${fromUser.last_name}

${theySentMsg}

Check it out on the app: ${url}`
        );
      }
    })
  );

  logger.verbose('Sent text messages', { values: { sentTextMessages } });
  return sentTextMessages;
}

interface ExpectedPostBody {
  toUserIdAndAmountObjs: { userId: string; amount: number; message?: string }[];
  orgId: string;
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
    let toUserIdAndAmountObjs: {
      userId: string;
      amount: number;
      message?: string;
    }[] = [];
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

    const areAllAmountsValid = toUserIdAndAmountObjs.every(
      (userIdAndAmount) => userIdAndAmount.amount && userIdAndAmount.amount > 0
    );
    if (!areAllAmountsValid) {
      const invalidUserIdAndAmount = toUserIdAndAmountObjs.find(
        (toUserIdAndAmount) =>
          !toUserIdAndAmount.amount || toUserIdAndAmount.amount <= 0
      );
      logger.error('At least 1 amount is invalid', {
        values: { toUserIdAndAmountObjs },
      });
      return generateReturn(400, {
        message: 'At least 1 amount is invalid',
        invalidUserIdAndAmount,
      });
    }

    const fromUser = await getUserById(fromUserId, dynamoClient);
    if (!fromUser) {
      logger.error(
        'User not found on - something is wrong, user is Authd and exists in Cognito but not in our DB',
        {
          values: { fromUserId },
        }
      );
      return generateReturn(404, { message: 'User not found' });
    }

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
    const toUserIds = toUserIdAndAmountObjs.map(
      (toUserIdAndAmountObj) => toUserIdAndAmountObj.userId
    );
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

    const toUsersAndAmounts = mapUserToUserIdHelper(
      toUsers,
      toUserIdAndAmountObjs
    );

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
      toUsersAndAmounts,
      orgGovernanceContract,
      isManagerModeEnabled
    );

    await sendSmsToAllUsersHelper(fromUser, toUsersAndAmounts);

    await storeTransactionsHelper(
      orgId,
      toUsersAndAmounts,
      fromUser,
      transaction,
      isManagerModeEnabled
    );

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
