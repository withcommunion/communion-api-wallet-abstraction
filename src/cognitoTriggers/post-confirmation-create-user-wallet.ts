import type {
  PostConfirmationTriggerEvent,
  PostConfirmationTriggerHandler,
} from 'aws-lambda';

import {
  generatePrivateEvmKey,
  createSingletonWallet,
} from '../util/avax-wallet-util';

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent
) => {
  const { request } = event;
  const { userAttributes } = request;

  const usersPrivateKey = generatePrivateEvmKey();
  const usersWallet = createSingletonWallet(
    usersPrivateKey.evmKeyWithLeadingHex,
    true
  );

  const addressC = usersWallet.avaxWallet.getAddressC();
  const addressP = usersWallet.avaxWallet.getAddressP();
  const addressX = usersWallet.avaxWallet.getAddressX();

  const user = {
    id: `${userAttributes.sub}`,
    email: userAttributes.email,
    firstName: userAttributes['given_name'],
    lastName: userAttributes['family_name'],
    organization: userAttributes['custom:organization'],
    wallet: {
      privateKeyWithLeadingHex: usersPrivateKey.evmKeyWithLeadingHex,
      addressC,
      addressP,
      addressX,
    },
  };

  try {
    console.log(event);
    console.log('Received user', userAttributes);
    console.log('Attempting to create user', { user });

    return event;
  } catch (error) {
    // Don't throw error.  We don't want to block a user from signing in because of this
    console.error('Failed to save user', error);
  }

  return event;
};
