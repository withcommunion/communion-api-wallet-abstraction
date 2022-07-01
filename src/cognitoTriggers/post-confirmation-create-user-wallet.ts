import type {
  PostConfirmationTriggerEvent,
  AuthResponseContext,
} from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

import { seedFundsForUser } from '../util/seed-util';

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

    // TODO - This can be a util function
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
      const existingUser = await getUserById(userId, dynamoClient);
      logger.info('User exists in DB', { values: { existingUser } });

      // TODO: Figure out how often this is happening, move to helper function
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

    // TODO - Move to helper function, it's noisy and should be a single function call
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

    // TODO move to helper function
    const user: User = {
      id: userId,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organization: userAttributes['custom:organization'],
      role: userAttributes['custom:role'],
      walletPrivateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      walletAddressC: usersWallet.avaxWallet.getAddressC(),
      walletAddressP: usersWallet.avaxWallet.getAddressP(),
      walletAddressX: usersWallet.avaxWallet.getAddressX(),
    };

    try {
      logger.verbose('Attempting to create user', { values: { user } });
      const respFromDb = await insertUser(user, dynamoClient);
      logger.info('Created user', { values: { respFromDb } });

      logger.verbose('Attempting to seed user', {
        userAddress: user.walletAddressC,
      });
      const sendAvax = await seedFundsForUser(
        user.walletAddressC,
        dynamoClient
      );
      logger.info('Seeded user', { values: { sendAvax } });
    } catch (error) {
      /* Throw error.  We want to stop the lambda and prevent the user from verifying.
     * Something is very wrong here - this is essential for user function.
       TODO: Alert on this
     */
      logger.error('Failed to create and seed user', { values: { error } });
      throw error;
    }

    return event;
  } catch (error) {
    // TODO - We likely want to just move on.  When this errors the user is already confirmed - our dynamo trigger will catch it
    logger.error(
      'Error in cognito-triggers/post-confirmation-create-user-wallet.ts',
      { values: { error } }
    );
    throw error;
  }
};
