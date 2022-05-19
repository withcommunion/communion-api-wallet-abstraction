import type { PostConfirmationTriggerEvent } from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

import { initDynamoClient, insertUser, User } from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

// TODO: Come up with a way to differentiate the chains.  Ask Kathleen this.
const ORG_JACKS_PIZZA_1 = 'org-jacks-pizza-1';
export const handler = async (event: PostConfirmationTriggerEvent) => {
  try {
    console.log('Incoming request:', event.request);

    const { request } = event;
    const { userAttributes } = request;

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

    const userOrg = userAttributes['custom:organization'] || ORG_JACKS_PIZZA_1;
    const user: User = {
      urn: `${userOrg}:${userAttributes.sub}`,
      id: `${userAttributes.sub}`,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      organization: userOrg,
      wallet: userWalletInfo,
    };

    try {
      console.log('Attempting to create user', { user });
      const res = await insertUser(dynamoClient, user);
      console.log('User created successfully', res);
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
