jest.mock('../util/dynamo-util.ts');
import { handler } from './api-post-join-org-by-id';
import * as dynamoUtil from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import { MOCK_USER_SELF, MOCK_ORG } from '../util/__mocks__/dynamo-util';

const MOCK_USER_NOT_IN_ORG = {
  ...MOCK_USER_SELF,
  organizations: [],
};

const MOCK_BODY_PARAMS = JSON.stringify({
  joinCode: 'asdf',
});
const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_NOT_IN_ORG.id,
  orgId: MOCK_ORG.id,
  body: MOCK_BODY_PARAMS,
});

const getEthersWalletSpy = jest.spyOn(avaxWalletUtil, 'getEthersWallet');
// @ts-expect-error it's okay
getEthersWalletSpy.mockImplementation(() => {
  return {};
});
const getJacksPizzaGovernanceContractSpy = jest.spyOn(
  avaxWalletUtil,
  'getJacksPizzaGovernanceContract'
);

// eslint-disable-next-line
const MOCK_HASH = '0x12345325252';
const addEmployeeSpy = jest.fn(() => ({ hash: MOCK_HASH }));
// @ts-expect-error it's okay
getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
  return {
    addEmployee: addEmployeeSpy,
  };
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
getUserByIdSpy.mockImplementation(() => Promise.resolve(MOCK_USER_NOT_IN_ORG));

const addUserToOrgSpy = jest.spyOn(dynamoUtil, 'addUserToOrg');
const addOrgToUserSpy = jest.spyOn(dynamoUtil, 'addOrgToUser');

describe('api-post-join-org-by-id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const res = await handler(MOCK_EVENT);
      expect(JSON.parse(res.body)).toEqual({
        userAddedInDb: true,
        userAddedInSmartContract: true,
        // eslint-disable-next-line
        userAddContractTxn: expect.any(Object),
      });
      expect(res.statusCode).toBe(200);
    });

    it('Should call getOrgById with the passed in orgId', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgByIdSpy).toHaveBeenCalledTimes(1);
      expect(getOrgByIdSpy).toHaveBeenCalledWith(MOCK_ORG.id, {});
    });

    it('Should call getUserById with the authd user', async () => {
      await handler(MOCK_EVENT);
      expect(getUserByIdSpy).toHaveBeenCalledTimes(1);
      expect(getUserByIdSpy).toHaveBeenCalledWith(MOCK_USER_NOT_IN_ORG.id, {});
    });

    it('Should call addUserToOrg with the userId, orgId', async () => {
      await handler(MOCK_EVENT);
      expect(addUserToOrgSpy).toHaveBeenCalledTimes(1);
      expect(addUserToOrgSpy).toHaveBeenCalledWith(
        MOCK_USER_NOT_IN_ORG.id,
        MOCK_ORG.id,
        {}
      );
    });

    it('Should call addOrgToUser with the userId, orgId, and worker role', async () => {
      await handler(MOCK_EVENT);
      expect(addOrgToUserSpy).toHaveBeenCalledTimes(1);
      expect(addOrgToUserSpy).toHaveBeenCalledWith(
        MOCK_USER_NOT_IN_ORG.id,
        MOCK_ORG.id,
        'worker',
        {}
      );
    });

    it('Should call getEthersWallet with the seeder private key', async () => {
      await handler(MOCK_EVENT);
      expect(getEthersWalletSpy).toHaveBeenCalledTimes(1);
      expect(getEthersWalletSpy).toHaveBeenCalledWith(
        MOCK_ORG.seeder.privateKeyWithLeadingHex
      );
    });

    it('Should call getJacksPizzaGovernanceContract with the org governance contract address', async () => {
      await handler(MOCK_EVENT);
      expect(getJacksPizzaGovernanceContractSpy).toHaveBeenCalledTimes(1);
      expect(getJacksPizzaGovernanceContractSpy).toHaveBeenCalledWith(
        MOCK_ORG.avax_contract.address,
        {}
      );
    });

    it('Should call addEmployee with the passed in amount and addresses from users', async () => {
      await handler(MOCK_EVENT);
      expect(addEmployeeSpy).toHaveBeenCalledTimes(1);
      expect(addEmployeeSpy).toHaveBeenCalledWith(
        MOCK_USER_NOT_IN_ORG.walletAddressC
      );
    });
  });

  describe('Unhappy path', () => {
    describe('When fetching the requesting user', () => {
      describe('If the user do not exist', () => {
        it('Should return a 404 status code', async () => {
          // @ts-expect-error it's okay
          getUserByIdSpy.mockImplementationOnce(async () => {
            return null;
          });
          const res = await handler(MOCK_EVENT);
          expect(res.statusCode).toBe(404);
        });
      });
    });

    describe('When the org is not found', () => {
      it('Should return a 404 status code', async () => {
        getOrgByIdSpy.mockImplementationOnce(async () => {
          return null;
        });
        const res = await handler(MOCK_EVENT);
        expect(res.statusCode).toBe(404);
      });
    });

    describe('When the org has a join code and it doesnt match what is passed in', () => {
      it('Should return a 401 unauthorized status code', async () => {
        getOrgByIdSpy.mockImplementationOnce(() =>
          Promise.resolve({
            ...MOCK_ORG,
            join_code: 'OTHER_CODE',
          } as dynamoUtil.OrgWithPrivateData)
        );

        const res = await handler(MOCK_EVENT);
        expect(res.statusCode).toBe(401);
      });
    });
  });
});
