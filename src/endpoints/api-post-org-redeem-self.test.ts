jest.mock('../util/dynamo-util.ts');
import { handler } from './api-post-org-redeem-self';
import * as dynamoUtil from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import { MOCK_USER_SELF, MOCK_ORG } from '../util/__mocks__/dynamo-util';

const MOCK_BODY_PARAMS = JSON.stringify({
  amount: 1,
  message: '1 day pto, tuition',
});
const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_SELF.id,
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
const burnEmployeeTokensSpy = jest.fn(() => ({ hash: MOCK_HASH }));
// @ts-expect-error it's okay
getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
  return {
    burnEmployeeTokens: burnEmployeeTokensSpy,
  };
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
const insertTransactionSpy = jest.spyOn(dynamoUtil, 'insertTransaction');

describe('api-post-org-redeem-self', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const res = await handler(MOCK_EVENT);
      expect(JSON.parse(res.body)).toEqual({
        transaction: { hash: MOCK_HASH },
        txnHash: MOCK_HASH,
      });
      expect(res.statusCode).toBe(200);
    });

    it('Should call getUserById with the authd user', async () => {
      await handler(MOCK_EVENT);
      expect(getUserByIdSpy).toHaveBeenCalledTimes(1);
      expect(getUserByIdSpy).toHaveBeenCalledWith(MOCK_USER_SELF.id, {});
    });

    it('Should call getOrgById with the passed in orgId', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgByIdSpy).toHaveBeenCalledTimes(1);
      expect(getOrgByIdSpy).toHaveBeenCalledWith(MOCK_ORG.id, {});
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

    it('Should call burnEmployeeToken with the passed in amount and addresses from users', async () => {
      await handler(MOCK_EVENT);
      expect(burnEmployeeTokensSpy).toHaveBeenCalledTimes(1);
      expect(burnEmployeeTokensSpy).toHaveBeenCalledWith(
        MOCK_USER_SELF.walletAddressC,
        1
      );
    });

    it('Should call insertTransaction', async () => {
      await handler(MOCK_EVENT);
      expect(insertTransactionSpy).toHaveBeenCalledTimes(1);
      expect(insertTransactionSpy).toHaveBeenCalledWith(
        {
          amount: 1,
          created_at: expect.any(Number),
          from_user_id: 'local-mock-user-self',
          from_user_to_user_txn_hash_urn:
            'local-mock-user-self:0x0000000000000000000000000000000000000000:0x12345325252',
          message: '1 day pto, tuition',
          org_id: 'jacks-pizza-1',
          to_user_id: '0x0000000000000000000000000000000000000000',
          to_user_id_txn_hash_urn:
            '0x0000000000000000000000000000000000000000:0x12345325252',
          tx_hash: '0x12345325252',
        },
        {}
      );
    });
  });

  describe('Unhappy path', () => {
    describe('When fetching the to and from users', () => {
      describe('If the users do not exist', () => {
        it('Should return a 404 status code', async () => {
          // @ts-expect-error it's okay
          getUserByIdSpy.mockImplementationOnce(async () => {
            return null;
          });
          const res = await handler(MOCK_EVENT);
          expect(res.statusCode).toBe(404);
        });
      });
      describe('If the users are not in the org that is requested', () => {
        it('Should returna a 401 status code', async () => {
          getUserByIdSpy.mockImplementationOnce(async () => {
            return {
              ...MOCK_USER_SELF,
              organizations: [{ orgId: 'some-other-org' }],
            } as dynamoUtil.User;
          });

          const res = await handler(MOCK_EVENT);
          expect(res.statusCode).toBe(401);
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

    describe('getOrgGovernanceContractHelper', () => {
      describe('When there is no avax contract in the org object', () => {
        it('Should throw an error and return a 500', async () => {
          getOrgByIdSpy.mockImplementationOnce(async () => {
            // @ts-expect-error it's okay
            return {
              ...MOCK_ORG,
              avax_contract: undefined,
            } as dynamoUtil.OrgWithPrivateData;
          });

          const res = await handler(MOCK_EVENT);
          expect(res.statusCode).toBe(500);
        });
      });
    });
  });
});
