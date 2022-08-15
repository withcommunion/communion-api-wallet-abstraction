import type {
  PostConfirmationTriggerEvent,
  PreSignUpAdminCreateUserTriggerEvent,
  AuthResponseContext,
} from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

import {
  initDynamoClient,
  insertUser,
  User,
  getUserById,
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
      logger.info('Does user exist in DB', { values: { existingUser } });

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

    const user: User = {
      id: userId,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organizations: [],
      walletPrivateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      walletAddressC,
      walletAddressP: 'N/A',
      walletAddressX: 'N/A',
    };

    await insertUserHelper(user);

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
