import type { PostConfirmationTriggerEvent } from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

import {
  initDynamoClient,
  insertUser,
  BaseUserWallet,
  User,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

// TODO: Come up with a way to differentiate the chains.  Ask Kathleen this.
const ORG_JACKS_PIZZA_1 = 'org-jacks-pizza-1';
export const handler = async (event: PostConfirmationTriggerEvent) => {
  const { request } = event;
  const { userAttributes } = request;
  console.log('Incoming request:', request);

  let userWalletInfo: BaseUserWallet;
  try {
    const usersPrivateKey = generatePrivateEvmKey();
    const usersWallet = createSingletonWallet(
      usersPrivateKey.evmKeyWithLeadingHex,
      true
    );

    const addressC = usersWallet.avaxWallet.getAddressC();
    const addressP = usersWallet.avaxWallet.getAddressP();
    const addressX = usersWallet.avaxWallet.getAddressX();

    userWalletInfo = {
      privateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      addressC,
      addressP,
      addressX,
    };
  } catch (error) {
    /* Throw error.  We want to stop the lambda and prevent the user from verifying.
     * Something is very wrong here - this is essential for user function.
       TODO: Alert on this
     */
    console.log('Error creating user wallet:', error);
    throw error;
  }

  try {
    // TODO: Get this from the auth form
    const userOrg = userAttributes['custom:organization'] || ORG_JACKS_PIZZA_1;
    const user: User = {
      urn: `${userOrg}:${userAttributes.sub}`,
      id: `${userAttributes.sub}`,
      email: userAttributes.email,
      first_name: userAttributes['given_name'],
      last_name: userAttributes['family_name'],
      /* 
         TODO: Figure out a better way to get the organization into place.
       */
      organization: userOrg,
      wallet: userWalletInfo,
    };

    console.log('Attempting to create user', { user });
    const res = await insertUser(dynamoClient, user);
    console.log('User created successfully', res);

    return event;
  } catch (error) {
    /* Throw error.  We want to stop the lambda and prevent the user from verifying.
     * Something is very wrong here - this is essential for user function.
       TODO: Alert on this
     */
    console.error('Failed to create user', error);
    throw error;
  }
};
