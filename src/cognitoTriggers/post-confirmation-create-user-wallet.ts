import type { PostConfirmationTriggerEvent } from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

import { ethers } from 'ethers';

import { sendAvax } from '../util/avax-chain-util';

import {
  initDynamoClient,
  insertUser,
  User,
  getUserById,
} from '../util/dynamo-util';

export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

const dynamoClient = initDynamoClient();

export async function getSeedAccountPrivateKey(): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(dynamoClient, SEED_ACCOUNT_ID);
  const seedPrivateKey = seedAccount.wallet.privateKeyWithLeadingHex;

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

export const handler = async (event: PostConfirmationTriggerEvent) => {
  try {
    console.log('Incoming request:', event.request);

    const { request } = event;
    const { userAttributes } = request;
    const userId = userAttributes.sub;

    try {
      const existingUser = await getUserById(dynamoClient, userId);

      if (existingUser && existingUser.wallet.privateKeyWithLeadingHex) {
        console.log('Cognito fired twice, there is nothing to do here');
        return event;
      }
    } catch (error) {
      // Nothing to do here, move on
    }

    let usersPrivateKey;
    let usersWallet;
    try {
      usersPrivateKey = generatePrivateEvmKey();
      usersWallet = createSingletonWallet(
        usersPrivateKey.evmKeyWithLeadingHex,
        true
      );
    } catch (error) {
      /* Throw error.  We want to stop the lambda and prevent the user from verifying.
       * Something is very wrong here - this is essential for user function.
         TODO: Alert on this
     */
      console.log('Error creating user wallet:', error);
      throw error;
    }

    const userWalletInfo = {
      privateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      addressC: usersWallet.avaxWallet.getAddressC(),
      addressP: usersWallet.avaxWallet.getAddressP(),
      addressX: usersWallet.avaxWallet.getAddressX(),
    };

    const userOrg = userAttributes['custom:organization'];
    const user: User = {
      id: userId,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organization: userOrg,
      wallet: userWalletInfo,
    };

    try {
      console.log('Attempting to create user', { user });
      await insertUser(dynamoClient, user);
      console.log('Created user');

      console.log('Attempting to seed user', {
        userAddress: user.wallet.addressC,
      });
      const sendAvax = await seedFundsForUser(user.wallet.addressC);
      console.log('Seeded user', sendAvax);
    } catch (error) {
      /* Throw error.  We want to stop the lambda and prevent the user from verifying.
     * Something is very wrong here - this is essential for user function.
       TODO: Alert on this
     */
      console.error('Failed to create user', error);
      throw error;
    }

    return event;
  } catch (error) {
    console.error(
      'Error in cognito-triggers/post-confirmation-create-user-wallet.ts',
      error
    );
    throw error;
  }
};
