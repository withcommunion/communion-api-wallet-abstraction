/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { insertUser } from '../util/dynamo-util';

import { handler } from './post-confirmation-create-user-wallet';
import * as avaxWalletUtil from '../util/avax-wallet-util';

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
          {},
          {
            email: 'someUser@gmail.com',
            first_name: 'Mike',
            id: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
            last_name: 'A',
            organization: 'org-jacks-pizza-1',
            urn: 'org-jacks-pizza-1:21f56d21-45ff-40a9-9041-1f3d3b864df5',
            wallet: {
              addressC: expect.any(String),
              addressP: expect.any(String),
              addressX: expect.any(String),
              privateKeyWithLeadingHex: expect.any(String),
            },
          }
        );
      });
    });
  });
});
