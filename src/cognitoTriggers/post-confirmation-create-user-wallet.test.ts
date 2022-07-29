/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
jest.mock('../util/avax-chain-util.ts');

import { ethers } from 'ethers';

import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { insertUser, getUserById, addUserToOrg } from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';
import * as dynamoUtil from '../util/dynamo-util';

import { handler } from './post-confirmation-create-user-wallet';
import { MOCK_ORG, MOCK_USER_SELF } from '../util/__mocks__/dynamo-util';

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
        // TODO This is a hack for now, as all users are in jacks pizza
        const TEMP_EXPECTED_ORG =
          'org-jacks-pizza-1' ||
          MOCK_EVENT.request.userAttributes['custom:organization'];

        expect(insertUser).toHaveBeenCalledTimes(1);
        expect(insertUser).toHaveBeenCalledWith(
          {
            id: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
            email: 'someUser@gmail.com',
            first_name: 'Mike',
            last_name: 'A',
            organization: TEMP_EXPECTED_ORG,
            organizations: [{ orgId: TEMP_EXPECTED_ORG, role: 'worker' }],
            role: 'worker',
            walletAddressC: expect.any(String),
            walletAddressP: expect.any(String),
            walletAddressX: expect.any(String),
            walletPrivateKeyWithLeadingHex: expect.any(String),
          },
          {}
        );
      });
    });

    describe.skip('Inserting user into org database', () => {
      it('should call addUserToOrg with users org parsed from event', async () => {
        await handler(MOCK_EVENT);

        // TODO This is a hack for now, as all users are in jacks pizza
        const TEMP_EXPECTED_ORG =
          'org-jacks-pizza-1' ||
          MOCK_EVENT.request.userAttributes['custom:organization'];

        expect(addUserToOrg).toHaveBeenCalledTimes(1);
        expect(addUserToOrg).toHaveBeenCalledWith(
          MOCK_EVENT.userName,
          TEMP_EXPECTED_ORG,
          {}
        );
      });

      describe('If the user is for some reason already in the org', () => {
        it('Should handle it gracefully', async () => {
          const addUserToOrgSpy = jest.spyOn(dynamoUtil, 'addUserToOrg');
          addUserToOrgSpy.mockImplementationOnce(() =>
            Promise.reject({ name: 'ConditionalCheckFailedException' })
          );
          await handler(MOCK_EVENT);
          expect(addUserToOrg).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe.skip('Adding user to the JacksPizzaGovernance contract', () => {
      // TODO This is a hack for now, as all users are in jacks pizza
      const TEMP_EXPECTED_ORG =
        'org-jacks-pizza-1' || MOCK_USER_SELF.organization;
      it('Should call getOrgById', async () => {
        const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
        await handler(MOCK_EVENT);
        expect(getOrgByIdSpy).toHaveBeenCalledTimes(1);
        expect(getOrgByIdSpy).toHaveBeenCalledWith(TEMP_EXPECTED_ORG, {});
      });
      it('Should call getEthersWallet with the org seeder key', async () => {
        await handler(MOCK_EVENT);
        expect(getEthersWalletSpy).toHaveBeenCalledTimes(1);
        expect(getEthersWalletSpy).toHaveBeenCalledWith(
          MOCK_ORG.seeder.privateKeyWithLeadingHex
        );
      });
      it('Should call getJacksPizzaGovernanceContract with the address in the org and ethers wallet', async () => {
        await handler(MOCK_EVENT);
        expect(getJacksPizzaGovernanceContractSpy).toHaveBeenCalledTimes(1);
        expect(getJacksPizzaGovernanceContractSpy).toHaveBeenCalledWith(
          MOCK_ORG.avax_contract.address,
          {}
        );
      });
      it('Should call addEmployee with the users walletAddressC', async () => {
        await handler(MOCK_EVENT);
        expect(addEmployeeSpy).toHaveBeenCalledTimes(1);
        expect(addEmployeeSpy).toHaveBeenCalledWith(expect.any(String));
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
