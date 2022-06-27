/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
jest.mock('../util/avax-chain-util.ts');

import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import {
  insertUser,
  getUserById,
  getOrgById,
  addUserToOrg,
} from '../util/dynamo-util';
import { sendAvax } from '../util/avax-chain-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';

import {
  handler,
  SEED_ACCOUNT_ID,
  BASE_AMOUNT_TO_SEED_USER,
} from './post-confirmation-create-user-wallet';
import { MOCK_USER_SELF } from '../util/__mocks__/dynamo-util';

const MOCK_ORG_NAME = 'test-org';
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
      'cognito:user_status': 'CONFIRMED',
      'cognito:email_alias': 'someUser@gmail.com',
      'custom:organization': MOCK_ORG_NAME,
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

    describe('Fetching the organization', () => {
      it('Should call getOrgById with the id passed in from the event', async () => {
        await handler(MOCK_EVENT);
        expect(getOrgById).toHaveBeenCalledWith(
          MOCK_EVENT.request.userAttributes['custom:organization'],
          expect.any(Object)
        );
      });
    });
    it('Should call getUserById with the user from the event', async () => {
      await handler(MOCK_EVENT);

      expect(getUserById).toHaveBeenCalledWith(
        expect.any(Object),
        MOCK_EVENT.request.userAttributes.sub
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

    describe('Adding the user to the organization', () => {
      it('Should call addUserToOrg with the user and org', async () => {
        await handler(MOCK_EVENT);

        expect(addUserToOrg).toHaveBeenCalledWith(
          MOCK_EVENT.request.userAttributes.sub,
          MOCK_ORG_NAME,
          expect.any(Object)
        );
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

        const expectedOrgId =
          MOCK_EVENT.request.userAttributes['custom:organization'];
        const expectedOrg = {
          orgId: expectedOrgId,
          role: 'worker',
        };

        expect(insertUser).toHaveBeenCalledTimes(1);
        expect(insertUser).toHaveBeenCalledWith(
          {},
          {
            id: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
            email: 'someUser@gmail.com',
            first_name: 'Mike',
            last_name: 'A',
            organization: expectedOrgId,
            organizations: [expectedOrg],
            role: 'worker',
            walletAddressC: expect.any(String),
            walletAddressP: expect.any(String),
            walletAddressX: expect.any(String),
            walletPrivateKeyWithLeadingHex: expect.any(String),
          }
        );
      });
    });

    describe('Seeding user with Avax', () => {
      it('should call getUserById with the SEED_ACCOUNT_ID', async () => {
        await handler(MOCK_EVENT);

        // Once for the user lookup and another to get the seed account
        expect(getUserById).toHaveBeenCalledTimes(2);
        expect(getUserById).toHaveBeenCalledWith(
          expect.any(Object),
          SEED_ACCOUNT_ID
        );
      });

      it('should call sendAvax with the Seed Wallet, BASE_AMOUNT_TO_SEED_USER, and toAddress of the newly created user', async () => {
        await handler(MOCK_EVENT);

        expect(sendAvax).toHaveBeenCalledTimes(1);
        expect(sendAvax).toHaveBeenCalledWith(
          expect.objectContaining({ address: expect.any(String) }),
          BASE_AMOUNT_TO_SEED_USER,
          expect.any(String)
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

    describe('If there was no organization passed in', () => {
      it('Should throw an error', async () => {
        const event = {
          ...MOCK_EVENT,
          request: {
            ...MOCK_EVENT.request,
            userAttributes: {
              ...MOCK_EVENT.request.userAttributes,
              'custom:organization': '',
            },
          },
        };
        await expect(handler(event)).rejects.toThrow(
          'Payload has no organization'
        );
      });
    });
  });
});
