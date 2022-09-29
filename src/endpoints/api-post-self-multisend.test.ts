jest.mock('../util/dynamo-util.ts');
jest.mock('../util/twilio-util.ts');
import { handler } from './api-post-self-multisend';
import * as dynamoUtil from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';
import * as twilioUtil from '../util/twilio-util';
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import {
  MOCK_USER_SELF,
  MOCK_USER_A,
  MOCK_ORG,
} from '../util/__mocks__/dynamo-util';

const MOCK_BODY = {
  orgId: MOCK_ORG.id,
  toUserIdAndAmountObjs: [
    {
      userId: MOCK_USER_A.id,
      amount: '1',
    },
  ],
};
const MOCK_BODY_PARAMS = JSON.stringify(MOCK_BODY);
const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_SELF.id,
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

const MOCK_HASH = '0x12345325252';
const multisendEmployeeTokensSpy = jest.fn(() => ({ hash: MOCK_HASH }));
// @ts-expect-error it's okay
getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
  return {
    multisendEmployeeTokens: multisendEmployeeTokensSpy,
  };
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
const batchGetUsersByIdSpy = jest.spyOn(dynamoUtil, 'batchGetUsersById');
// @ts-expect-error it's okay
batchGetUsersByIdSpy.mockImplementation(async () => [MOCK_USER_A]);

const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
const insertTransactionSpy = jest.spyOn(dynamoUtil, 'insertTransaction');

const sendSmsSpy = jest.spyOn(twilioUtil, 'sendSms');
// @ts-expect-error it's okay
sendSmsSpy.mockImplementation(async () => []);

describe('api-post-self-multisend', () => {
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

    it('Should call batchGetUsersById with the toUserIds', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledTimes(1);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledWith([MOCK_USER_A.id], {});
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

    it('Should call multisendEmployeeTokens with the passed in amount and addresses from users', async () => {
      await handler(MOCK_EVENT);
      expect(multisendEmployeeTokensSpy).toHaveBeenCalledTimes(1);
      expect(multisendEmployeeTokensSpy).toHaveBeenCalledWith(
        MOCK_USER_SELF.walletAddressC,
        [MOCK_USER_A.walletAddressC],
        ['1']
      );
    });

    it('Should call insertTransactionSpy with the performed transactions', async () => {
      await handler(MOCK_EVENT);
      expect(insertTransactionSpy).toHaveBeenCalledTimes(1);
      expect(insertTransactionSpy).toHaveBeenCalledWith(
        {
          amount: '1',
          // eslint-disable-next-line
          created_at: expect.any(Number),
          from_user_id: 'local-mock-user-self',
          from_user_to_user_txn_hash_urn:
            'local-mock-user-self:local-invoke-mock-user-a:0x12345325252',
          message: undefined,
          org_id: 'jacks-pizza-1',
          to_user_id: 'local-invoke-mock-user-a',
          to_user_id_txn_hash_urn: 'local-invoke-mock-user-a:0x12345325252',
          tx_hash: '0x12345325252',
          modifier: undefined,
          type: 'erc20Transfer',
        },
        {}
      );
    });

    it('Should call sendSms for the users with a phone number and allow_sms as true', async () => {
      await handler(MOCK_EVENT);
      expect(sendSmsSpy).toHaveBeenCalledTimes(1);
      expect(sendSmsSpy).toHaveBeenCalledWith(
        MOCK_USER_A.phone_number,
        expect.any(String)
      );
    });

    describe('When allow_sms is false for the user', () => {
      it('Should call not call sendSms', async () => {
        // @ts-expect-error it's okay
        batchGetUsersByIdSpy.mockImplementationOnce(async () => [
          { ...MOCK_USER_A, allow_sms: false },
        ]);
        await handler(MOCK_EVENT);
        expect(sendSmsSpy).toHaveBeenCalledTimes(0);
        expect(sendSmsSpy).not.toHaveBeenCalledWith(
          MOCK_USER_A.phone_number,
          expect.any(String)
        );
      });
    });

    describe('When isManagerMode is true in the body', () => {
      const MANAGER_MODE_EVENT = generateApiGatewayEvent({
        userId: MOCK_USER_SELF.id,
        body: JSON.stringify({ ...MOCK_BODY, isManagerMode: true }),
      });
      beforeEach(() => {
        getUserByIdSpy.mockImplementationOnce(async () => ({
          ...MOCK_USER_SELF,
          organizations: [{ orgId: MOCK_ORG.id, role: 'manager' }],
        }));
      });
      it('Should call multisendEmployeeTokens with the from user being the orgs seeder wallet address', async () => {
        await handler(MANAGER_MODE_EVENT);

        expect(multisendEmployeeTokensSpy).toHaveBeenCalledTimes(1);
        expect(multisendEmployeeTokensSpy).toHaveBeenCalledWith(
          MOCK_ORG.seeder.walletAddressC,
          [MOCK_USER_A.walletAddressC],
          ['1']
        );
      });
    });
  });

  describe('Unhappy path', () => {
    describe('When fetching the to and from users', () => {
      describe('If the users do not exist', () => {
        it('Should return a 404 status code', async () => {
          batchGetUsersByIdSpy.mockImplementationOnce(async () => {
            return [];
          });
          const res = await handler(MOCK_EVENT);
          expect(res.statusCode).toBe(404);
        });
      });
      describe('If the users are not in the org that is requested', () => {
        it('Should returna a 401 status code', async () => {
          batchGetUsersByIdSpy.mockImplementationOnce(async () => {
            return [
              MOCK_USER_SELF as dynamoUtil.User,
              {
                ...MOCK_USER_A,
                organizations: [{ orgId: 'some-other-org' }],
              } as dynamoUtil.User,
            ];
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

    describe('When isManagerMode is true in the body', () => {
      const MANAGER_MODE_EVENT = generateApiGatewayEvent({
        userId: MOCK_USER_SELF.id,
        body: JSON.stringify({ ...MOCK_BODY, isManagerMode: true }),
      });
      describe('And the user is not the role of manager', () => {
        it('Should return a 401 unauthorized', async () => {
          getUserByIdSpy.mockImplementationOnce(async () => ({
            ...MOCK_USER_SELF,
            organizations: [{ orgId: MOCK_ORG.id, role: 'worker' }],
          }));
          const resp = await handler(MANAGER_MODE_EVENT);
          expect(multisendEmployeeTokensSpy).toHaveBeenCalledTimes(0);
          expect(resp.statusCode).toBe(401);
        });
      });
      describe('And the user manger is trying to send to themselves', () => {
        it('Should return a 401 unauthorized', async () => {
          const MANAGER_MODE_EVENT = generateApiGatewayEvent({
            userId: MOCK_USER_SELF.id,
            body: JSON.stringify({
              ...MOCK_BODY,
              toUserIdAndAmountObjs: [
                {
                  userId: MOCK_USER_A.id,
                  amount: '1',
                },
                {
                  userId: MOCK_USER_SELF.id,
                  amount: '1',
                },
              ],
              isManagerMode: true,
            }),
          });

          getUserByIdSpy.mockImplementationOnce(async () => ({
            ...MOCK_USER_SELF,
            organizations: [{ orgId: MOCK_ORG.id, role: 'manager' }],
          }));

          const resp = await handler(MANAGER_MODE_EVENT);
          expect(multisendEmployeeTokensSpy).toHaveBeenCalledTimes(0);
          expect(resp.statusCode).toBe(401);
        });
      });
    });
  });
});
