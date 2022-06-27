import type {
  PostConfirmationTriggerEvent,
  AuthResponseContext,
} from 'aws-lambda';
import { ethers } from 'ethers';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';
import { sendAvax } from '../util/avax-chain-util';
import {
  initDynamoClient,
  insertUser,
  User,
  getUserById,
  getOrgById,
  addUserToOrg,
} from '../util/dynamo-util';

import logger from '../util/winston-logger-util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

const dynamoClient = initDynamoClient();

export async function getUserByIdHelper(
  userId: string,
  dynamoClient: DynamoDBClient
) {
  try {
    const existingUser = await getUserById(dynamoClient, userId);
    return existingUser;
  } catch (error) {
    // Nothing to do here
  }
}
export function setupUserWalletHelper() {
  try {
    const usersPrivateKey = generatePrivateEvmKey();
    const usersWallet = createSingletonWallet(
      usersPrivateKey.evmKeyWithLeadingHex,
      true
    );

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

export async function addUserToOrgHelper(userId: string, orgId: string) {
  try {
    const respFromUpdate = await addUserToOrg(userId, orgId, dynamoClient);
    return respFromUpdate;
  } catch (error) {
    // @ts-expect-error error.name does exist here
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn(
        `User already exists in org ${orgId}, this is weird - but it is okay.`,
        {
          values: { userId },
        }
      );

      return null;
    } else {
      logger.error('Something went wrong trying to update org', {
        values: { error },
      });
      throw error;
    }
  }
}

export async function getSeedAccountPrivateKey(): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(dynamoClient, SEED_ACCOUNT_ID);
  const seedPrivateKey = seedAccount.walletPrivateKeyWithLeadingHex;

  if (!seedPrivateKey) {
    throw new Error('Seed account has no private key');
  }

  return seedPrivateKey;
}

export async function seedFundsForUser(userCchainAddressToSeed: string) {
  const seedPrivateKey = await getSeedAccountPrivateKey();
  const seedWallet = new ethers.Wallet(seedPrivateKey);

  const res = await sendAvax(
    seedWallet,
    BASE_AMOUNT_TO_SEED_USER,
    userCchainAddressToSeed
  );

  return res;
}

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

    const usersOrgId = userAttributes['custom:organization'];
    if (!usersOrgId) {
      logger.error('Payload has no organization', { values: { userId } });
      throw new Error('Payload has no organization');
    }

    logger.info('Checking if user exists in DB', { values: { userId } });
    try {
      const existingUser = await getUserById(dynamoClient, userId);
      logger.verbose('User exists in DB', { values: { existingUser } });

      // TODO: Figure out how often this is happening
      const userIsAlreadySetup =
        existingUser &&
        existingUser.walletPrivateKeyWithLeadingHex &&
        process.env.NODE_ENV !== 'local';

      if (userIsAlreadySetup) {
        logger.warn('Cognito fired twice, there is nothing to do here');
        logger.info(
          'User exists in DB and has a wallet.  Nothing to do, lets return',
          { values: { event } }
        );
        return event;
      }
    } catch (error) {
      // Nothing to do here Move on
    }

    logger.verbose('Generating keys and wallets for user');
    const { usersPrivateKey, usersWallet } = setupUserWalletHelper();
    logger.info('Generated keys and wallets for user', {
      values: {
        usersPrivateKey,
        usersWallet,
      },
    });

    try {
      logger.verbose('Fetching org by id', { values: { usersOrgId } });
      const usersFirstOrg = await getOrgById(usersOrgId, dynamoClient);
      logger.info('Fetched org by id', { values: { usersFirstOrg } });

      if (!usersFirstOrg) {
        logger.error('Org not found', { values: { usersOrgId } });
        throw new Error(`There is no org with that name [${usersOrgId}]`);
      }

      // Add org and role to user org array [{orgId, role}]
      const user: User = {
        id: userId,
        email: userAttributes.email,
        first_name: userAttributes['given_name'],
        last_name: userAttributes['family_name'],
        organization: usersOrgId,
        role: userAttributes['custom:role'],
        organizations: [
          { orgId: usersOrgId, role: userAttributes['custom:role'] },
        ],
        walletPrivateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
        walletAddressC: usersWallet.avaxWallet.getAddressC(),
        walletAddressP: usersWallet.avaxWallet.getAddressP(),
        walletAddressX: usersWallet.avaxWallet.getAddressX(),
      };

      logger.verbose('Adding user to user table', {
        values: { user },
      });
      const respFromDb = await insertUser(dynamoClient, user);
      logger.info('Added user', { values: { respFromDb } });

      logger.verbose('Adding user to org member_ids', {
        values: { userId },
      });
      const updatedOrgResp = await addUserToOrgHelper(userId, usersOrgId);
      logger.info('Added user to org member_ids', {
        values: { updatedOrgResp },
      });

      logger.verbose('Seeding user', {
        userAddress: user.walletAddressC,
      });
      const sendAvax = await seedFundsForUser(user.walletAddressC);
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
    logger.error(
      'Error in cognito-triggers/post-confirmation-create-user-wallet.ts',
      { values: { error } }
    );
    throw error;
  }
};
