import type {
  PostConfirmationTriggerEvent,
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

export const handler = async (
  event: PostConfirmationTriggerEvent,
  context?: AuthResponseContext
) => {
  try {
    const { request } = event;
    const { userAttributes } = request;
    const userId = userAttributes.sub;
    const requestId = context?.awsRequestId
      ? (context.awsRequestId as string)
      : '';

    logger.defaultMeta = {
      _requestId: `${requestId?.substring(0, 8)}...${requestId?.substring(
        30
      )}}}`,
      requestId,
      userId,
    };

    logger.info('Incoming request event:', { values: { event } });
    logger.verbose('Incoming request context:', { values: { context } });

    try {
      logger.verbose('Checking if user exists in DB', { values: { userId } });
      const existingUser = await getUserById(dynamoClient, userId);
      logger.verbose('User exists in DB', { values: { existingUser } });

      // TODO: Figure out how often this is happening
      if (
        existingUser &&
        existingUser.wallet.privateKeyWithLeadingHex &&
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

    let usersPrivateKey;
    let usersWallet;
    try {
      logger.verbose('Generating keys and wallets for user');
      usersPrivateKey = generatePrivateEvmKey();
      usersWallet = createSingletonWallet(
        usersPrivateKey.evmKeyWithLeadingHex,
        true
      );

      logger.verbose('Generated keys and wallets for user', {
        values: {
          usersPrivateKey,
          usersWallet,
        },
      });
    } catch (error) {
      /* Throw error.  We want to stop the lambda and prevent the user from verifying.
       * Something is very wrong here - this is essential for user function.
         TODO: Alert on this
     */
      logger.error('Error creating user wallet:', error);
      throw error;
    }

    const userWalletInfo = {
      privateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      addressC: usersWallet.avaxWallet.getAddressC(),
      addressP: usersWallet.avaxWallet.getAddressP(),
      addressX: usersWallet.avaxWallet.getAddressX(),
    };

    const user: User = {
      id: userId,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organization: userAttributes['custom:organization'],
      role: userAttributes['custom:role'],
      wallet: userWalletInfo,
    };

    try {
      logger.verbose('Attempting to create user', { values: { user } });
      const respFromDb = await insertUser(dynamoClient, user);
      logger.info('Created user', { values: { respFromDb } });
    } catch (error) {
      /* Throw error.  We want to stop the lambda and prevent the user from verifying.
     * Something is very wrong here - this is essential for user function.
       TODO: Alert on this
     */
      logger.error('Failed to create and seed user', { values: { error } });
      throw error;
    }

    logger.info('Returning', { values: { event } });
    return event;
  } catch (error) {
    logger.error(
      'Error in cognito-triggers/post-confirmation-create-user-wallet.ts',
      { values: { error } }
    );
    throw error;
  }
};
