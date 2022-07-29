import type {
  PostConfirmationTriggerEvent,
  PreSignUpAdminCreateUserTriggerEvent,
  AuthResponseContext,
} from 'aws-lambda';

import type { Transaction } from 'ethers';

import {
  getEthersWallet,
  generatePrivateEvmKey,
  createSingletonWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';

import {
  initDynamoClient,
  insertUser,
  User,
  getUserById,
  addUserToOrg,
  getOrgById,
} from '../util/dynamo-util';

import logger from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

function setDefaultLoggerMeta(
  event: PostConfirmationTriggerEvent | PreSignUpAdminCreateUserTriggerEvent,
  context?: AuthResponseContext
) {
  const { request } = event;
  const { userAttributes } = request;
  const userId = userAttributes.sub || event.userName;
  const requestId = context?.awsRequestId
    ? (context.awsRequestId as string)
    : '';

  logger.defaultMeta = {
    _requestId: `${requestId?.substring(0, 8)}...${requestId?.substring(30)}}}`,
    requestId,
    userId,
  };
}

function setupUserWalletHelper() {
  try {
    logger.verbose('Generating keys and wallets for user');
    const usersPrivateKey = generatePrivateEvmKey();
    const usersWallet = createSingletonWallet(
      usersPrivateKey.evmKeyWithLeadingHex,
      true
    );

    logger.verbose('Generated keys and wallets for user', {
      values: {
        usersPrivateKey,
        usersWallet,
      },
    });

    return { usersPrivateKey, usersWallet };
  } catch (error) {
    /* Throw error.  We want to stop the lambda and prevent the user from verifying.
       * Something is very wrong here - this is essential for user function.
         TODO: Alert on this
     */
    logger.error('Error creating user wallet:', error);
    throw error;
  }
}

async function insertUserHelper(user: User) {
  try {
    logger.verbose('Attempting to create user', { values: { user } });
    const respFromDb = await insertUser(user, dynamoClient);
    logger.info('Created user', { values: { respFromDb } });
  } catch (error) {
    // TODO: Alert - this is bad
    logger.error('Fatal: Failed to insert user into DB', {
      values: { user, error },
    });
    throw error;
  }
}

async function addUserToOrgInDbHelper(user: User) {
  try {
    logger.verbose('Attempting to add user to org', {
      values: { user, userId: user.id, orgId: user.organization },
    });
    const respFromDb = await addUserToOrg(
      user.id,
      user.organization,
      dynamoClient
    );
    logger.info('Added user to org', {
      values: { orgId: user.organization, respFromDb },
    });

    return respFromDb;
  } catch (error) {
    // @ts-expect-error error.name does exist here
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn(
        `User already exists in org ${user.organization}, this is weird - but it is okay.`,
        {
          values: { userId: user.id, orgId: user.organization },
        }
      );

      return null;
    } else {
      // TODO: Alert - this is bad
      logger.error('Fatal: Failed to add user to org', {
        values: { user, orgId: user.organization, error },
      });
      throw error;
    }
  }
}

/**
 * TODO: This will be moved to the api-post-join-org-by-id endpoint
 * For now it works.
 */
async function addUserToOrgInSmartContractHelper(user: User) {
  try {
    logger.info('Attempting to add user to org in smart contract', {
      values: { user },
    });
    const org = await getOrgById(user.organization, dynamoClient);
    const governanceContractAddress = org?.avax_contract?.address || '';
    const orgDevWallet = getEthersWallet(
      org?.seeder.privateKeyWithLeadingHex || ''
    );

    const governanceContract = getJacksPizzaGovernanceContract(
      governanceContractAddress,
      orgDevWallet
    );

    // eslint-disable-next-line
    const txn = await governanceContract.addEmployee(user.walletAddressC);
    // eslint-disable-next-line
    const completedTxn = (await txn.wait()) as Transaction;
    logger.info('Successfully added user to org in smart contract', {
      values: { txn: completedTxn, address: user.walletAddressC },
    });

    return completedTxn;
  } catch (error) {
    logger.error('Failed to add user to org in smart contract', {
      values: { user, error },
    });
    throw error;
  }
}

export const handler = async (
  event: PostConfirmationTriggerEvent | PreSignUpAdminCreateUserTriggerEvent,
  context?: AuthResponseContext
) => {
  try {
    const { request } = event;
    const { userAttributes } = request;
    const userId = userAttributes.sub || event.userName;

    setDefaultLoggerMeta(event, context);

    logger.info('Incoming request event:', { values: { event } });
    logger.verbose('Incoming request context:', { values: { context } });

    try {
      logger.verbose('Checking if user exists in DB', { values: { userId } });
      const existingUser = await getUserById(userId, dynamoClient);
      logger.info('User exists in DB', { values: { existingUser } });

      if (
        existingUser &&
        existingUser.walletPrivateKeyWithLeadingHex &&
        process.env.NODE_ENV !== 'local'
      ) {
        logger.warn('Cognito fired twice, there is nothing to do here');
        logger.info(
          'User exists in DB and has a wallet.  Nothing to do, lets return',
          { values: { event } }
        );
        return event;
      }
    } catch (error) {
      // Nothing to do here, move on
    }

    const { usersPrivateKey, usersWallet } = setupUserWalletHelper();

    const walletAddressC = await usersWallet.ethersWallet.getAddress();

    /**
     * TODO: Have users actually join an org and not be added to one automagically
     */
    const TEMP_JACKS_PIZZA_ORG = 'jacks-pizza-pittsfield';
    const TEMP_JACKS_PIZZA_DEFAULT_ROLE = 'worker';
    const user: User = {
      id: userId,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organization: TEMP_JACKS_PIZZA_ORG,
      organizations: [
        {
          orgId: TEMP_JACKS_PIZZA_ORG,
          role: TEMP_JACKS_PIZZA_DEFAULT_ROLE,
        },
      ],
      role: TEMP_JACKS_PIZZA_DEFAULT_ROLE,
      walletPrivateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      walletAddressC,
      walletAddressP: 'N/A',
      walletAddressX: 'N/A',
    };

    await insertUserHelper(user);
    /**
     * TODO: This will go away once we start using the endpoint and users join orgs manually
     * This is okay for jacks pizza, right now
     */
    await addUserToOrgInDbHelper(user);
    await addUserToOrgInSmartContractHelper(user);

    return event;
  } catch (error) {
    //
    /**
     * We likely want to just move on.
     * When this errors the user is already confirmed. And we cannot block them
     * If the seed fails
     * Our dynamo trigger will catch it and seed the user
     */
    logger.error(
      'Error in cognito-triggers/post-confirmation-create-user-wallet.ts',
      { values: { error } }
    );
    throw error;
  }
};
