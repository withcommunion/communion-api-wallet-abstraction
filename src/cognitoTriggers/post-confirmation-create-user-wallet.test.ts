/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
jest.mock('../util/avax-chain-util.ts');

import { ethers } from 'ethers';

import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { insertUser, getUserById } from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';

import { handler } from './post-confirmation-create-user-wallet';
import { MOCK_USER_SELF } from '../util/__mocks__/dynamo-util';

const MOCK_EVENT: PostConfirmationTriggerEvent = {
  version: '1',
  region: 'us-east-1',
  userPoolId: 'us-east-1_EXRZZF0cp',
  userName: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
  callerContext: {
    awsSdkVersion: 'aws-sdk-unknown-unknown',
    clientId: '4eerlu1taf72c8r20pv2tmmvmt',
  },
  triggerSource: 'PostConfirmation_ConfirmSignUp',
  request: {
    userAttributes: {
      sub: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
      email_verified: 'true',
      phone_number: '+11234567890',
      'cognito:user_status': 'CONFIRMED',
      'cognito:email_alias': 'someUser@gmail.com',
      'custom:organization': 'test-org',
      'custom:role': 'worker',
      given_name: 'Mike',
      family_name: 'A',
      email: 'someUser@gmail.com',
    },
  },
  response: {},
};

describe('postConfirmationCreateUserWallet', () => {
  const generatePrivateEvmKeySpy = jest.spyOn(
    avaxWalletUtil,
    'generatePrivateEvmKey'
  );
  const createSingletonWalletSpy = jest.spyOn(
    avaxWalletUtil,
    'createSingletonWallet'
  );

  const getEthersWalletSpy = jest.spyOn(avaxWalletUtil, 'getEthersWallet');
  getEthersWalletSpy.mockImplementation(() => ({} as ethers.Wallet));

  const getJacksPizzaGovernanceContractSpy = jest.spyOn(
    avaxWalletUtil,
    'getJacksPizzaGovernanceContract'
  );
  const addEmployeeSpy = jest.fn(() => ({ wait: () => Promise.resolve() }));
  // @ts-expect-error it's okay
  getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
    return {
      addEmployee: addEmployeeSpy,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    beforeEach(() => {
      // @ts-expect-error because we're mocking it
      // eslint-disable-next-line
      getUserById.mockImplementationOnce(async () => {
        throw new Error('User not found');
      });
    });
    it('Should call getUserById with the user from the event', async () => {
      await handler(MOCK_EVENT);

      expect(getUserById).toHaveBeenCalledWith(
        MOCK_EVENT.request.userAttributes.sub,
        expect.any(Object)
      );
    });
    describe('Seeing if the user already exists', () => {
      describe('If the user does not already exist', () => {
        it('Should carry on, calling all the other methods', async () => {
          await handler(MOCK_EVENT);

          expect(generatePrivateEvmKeySpy).toHaveBeenCalledTimes(1);
          expect(createSingletonWalletSpy).toHaveBeenCalledTimes(1);
          expect(insertUser).toHaveBeenCalledTimes(1);
        });
      });
    });
    describe('Avax wallet creation', () => {
      it('Should call generatePrivateEvmKeySpy', async () => {
        await handler(MOCK_EVENT);
        expect(generatePrivateEvmKeySpy).toHaveBeenCalledTimes(1);
      });
      it('Should call createSingletonWallet', async () => {
        await handler(MOCK_EVENT);
        expect(createSingletonWalletSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('Inserting user into the database', () => {
      it('should call inserUser with user parsed from event', async () => {
        await handler(MOCK_EVENT);
        expect(insertUser).toHaveBeenCalledTimes(1);
        expect(insertUser).toHaveBeenCalledWith(
          {
            id: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
            email: 'someUser@gmail.com',
            first_name: 'Mike',
            last_name: 'A',
            organizations: [],
            allow_sms: true,
            phone_number: MOCK_EVENT.request.userAttributes.phone_number,
            walletAddressC: expect.any(String),
            walletAddressP: expect.any(String),
            walletAddressX: expect.any(String),
            walletPrivateKeyWithLeadingHex: expect.any(String),
          },
          {}
        );
      });
    });
  });
  describe('Unhappy path', () => {
    describe('If the user already exists', () => {
      it('Should return immediately without calling the other methods', async () => {
        // @ts-expect-error because we're mocking it
        // eslint-disable-next-line
        getUserById.mockReset();
        // @ts-expect-error because we're mocking it
        // eslint-disable-next-line
        getUserById.mockImplementationOnce(async () => MOCK_USER_SELF);
        await handler(MOCK_EVENT);

        expect(generatePrivateEvmKeySpy).toHaveBeenCalledTimes(0);
        expect(createSingletonWalletSpy).toHaveBeenCalledTimes(0);
        expect(insertUser).toHaveBeenCalledTimes(0);
      });
    });
  });
});
