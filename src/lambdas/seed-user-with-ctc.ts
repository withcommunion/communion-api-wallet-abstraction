import { generateReturn } from '../util/api-util';
import { Contract, Transaction as EthersTxn } from 'ethers';
import {
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';
import {
  User,
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
  console.log('Fetching users', { values: { userIds } });
  try {
    const users = await batchGetUsersById(userIds, dynamoClient);

    const areAllUsersFound = users.every((user) => Boolean(user));

    if (!users || !users.length || !areAllUsersFound) {
      console.log('At least 1 user not found', { values: { userIds } });
      return null;
    }
    console.log('Received users', { values: { users } });
    return users;
  } catch (error) {
    console.log('Error fetching users', { values: { userIds, error } });
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
      console.log('We failed to map a User from the DB to their found User', {
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
      console.log(
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
    console.log('Error fetching org governance contract', {
      values: { org, error },
    });
    throw error;
  }
}

async function addUserToOrgInSmartContractHelper(
  org: OrgWithPrivateData,
  user: User
) {
  try {
    console.log('Attempting to add user to org in smart contract', {
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
    const governanceContract = getJacksPizzaGovernanceContract(
      governanceContractAddress,
      orgDevWallet
    );

    // eslint-disable-next-line
    const txn = await governanceContract.addEmployee(user.walletAddressC);
    // eslint-disable-next-line
    const waitedTxn = (await txn.wait()) as EthersTxn;
    console.log('Successfully added user to org in smart contract', {
      values: { waitedTxn, address: user.walletAddressC },
    });

    return waitedTxn;
  } catch (error) {
    console.log('Failed to add user to org in smart contract', {
      values: { user, error },
    });
    return { hasAddEmployeeMethod: false, hash: 'N/A' };
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
  console.log('Multisending tokens', {
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
  const transaction = await governanceContract.multisendEmployeeTokens(
    fromUser.walletAddressC,
    toUsersAddresses,
    amounts
  );

  // eslint-disable-next-line
  const waitedTxn = (await transaction.wait()) as EthersTxn;

  console.log('Transferred tokens', { values: { waitedTxn } });

  return waitedTxn;
}

async function storeTransactionsHelper(
  orgId: string,
  toUsersAndAmounts: {
    toUser: User;
    amount: number;
    message: string | undefined;
  }[],
  transaction: EthersTxn
) {
  console.log('Storing transactions in TransactionsTable');
  console.log('Values to store in TxnTable', {
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
        const fromUserId = `${orgId}`;
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
          modifier: undefined,
          type: 'tokenSend',
        };
      }
    );

    const insertResps = await Promise.all(
      txns.map((txn) => insertTransaction(txn, dynamoClient))
    );

    console.log('Stored txns in TransactionsTable', {
      values: { insertResps },
    });

    return insertResps;
  } catch (error) {
    console.log('Failed to store transactions in table', {
      values: {
        error,
        args: {
          orgId,
          fromUser: 'Communion Org',
          toUsersAndAmounts,
          transaction,
        },
      },
    });
    console.error(error);
  }
}

async function sendSmsToAllUsersHelper(
  toUsersAndAmounts: {
    toUser: User;
    amount: number;
    message: string | undefined;
  }[]
) {
  console.log('Sending notifications');
  const sentTextMessages = await Promise.all(
    toUsersAndAmounts.map(async ({ toUser, amount, message }) => {
      if (toUser.phone_number && toUser.allow_sms) {
        const url =
          process.env.STAGE === 'prod'
            ? 'https://withcommunion.com'
            : 'https://dev.withcommunion.com';

        console.log('Sending notif to user', { values: { toUser } });

        const theySentMsg = message ? 'They sent you a message!' : '';
        return sendSms(
          toUser.phone_number,
          `🎊 Congrats ${toUser.first_name}! You just received ${amount} tokens from Communion!

${theySentMsg}

Check it out on the app: ${url}`
        );
      }
    })
  );

  console.log('Sent text messages', { values: { sentTextMessages } });
  return sentTextMessages;
}

export const handler = async (
  event: { userId: string; amount: number; message?: string }[]
) => {
  console.log(event);
  try {
    console.log('incomingEvent', { values: { event } });

    // const claims = event.requestContext.authorizer.jwt.claims;
    // // For some reason it can go through in two seperate ways

    const orgId = 'communion-test-org';
    const toUserIdAndAmountObjs: {
      userId: string;
      amount: number;
      message?: string;
    }[] = event;
    console.log('toUserIdAndAmountObjs', { values: { toUserIdAndAmountObjs } });

    if (!orgId || !toUserIdAndAmountObjs || !toUserIdAndAmountObjs.length) {
      console.log('Invalid request, returning 400');
      return generateReturn(400, {
        message: 'Missing required fields in body',
        fields: { orgId, toUserIdAndAmountObjs },
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
      console.log('At least 1 amount is invalid', {
        values: { toUserIdAndAmountObjs },
      });
      return generateReturn(400, {
        message: 'At least 1 amount is invalid',
        invalidUserIdAndAmount,
      });
    }

    const toUserIds = toUserIdAndAmountObjs.map(
      (toUserIdAndAmountObj) => toUserIdAndAmountObj.userId
    );
    const isManagerModeEnabled = true;

    const toUsers = await fetchUsersHelper(toUserIds);

    if (!toUsers) {
      console.log('At least 1 user not found', {
        values: { toUsers },
      });
      return generateReturn(404, { message: 'Could not find users' });
    }

    const toUsersAndAmounts = mapUserToUserIdHelper(
      toUsers,
      toUserIdAndAmountObjs
    );

    const areAllUsersInRequestedOrg = [...toUsers].every((user) =>
      Boolean(user.organizations.find((org) => org.orgId === orgId))
    );

    if (!areAllUsersInRequestedOrg) {
      return generateReturn(401, {
        message:
          'Unauthorized: at least 1 toUser or the fromUser is not in org, they all must be in the org',
        fields: { orgId, toUsers },
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

    const userToSendTokensFrom = {
      id: `${org.id}-seeder`,
      walletAddressC: org.seeder.walletAddressC,
    };

    const addedUserToOrg = await addUserToOrgInSmartContractHelper(
      org,
      toUsersAndAmounts[0].toUser
    );
    const transaction = await multisendTokenHelper(
      userToSendTokensFrom,
      toUsersAndAmounts,
      orgGovernanceContract,
      isManagerModeEnabled
    );

    await sendSmsToAllUsersHelper(toUsersAndAmounts);

    await storeTransactionsHelper(orgId, toUsersAndAmounts, transaction);

    console.log('Returning 200', {
      values: {
        transaction,
        txnHash: transaction.hash,
        addedUserToOrgTxnHash: addedUserToOrg.hash,
      },
    });
    return generateReturn(200, { transaction, txnHash: transaction.hash });
  } catch (error) {
    console.log('Failed to Transfer', { values: { error: error } });
    console.log(error);
    return generateReturn(500, {
      message: 'Something went wrong trying to transfer funds',
      error,
    });
  }
};
