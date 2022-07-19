jest.mock('../util/dynamo-util.ts');
import { handler } from './api-post-self-transfer';
import * as dynamoUtil from '../util/dynamo-util';
import * as avaxWalletUtil from '../util/avax-wallet-util';
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import {
  MOCK_USER_SELF,
  MOCK_USER_A,
  MOCK_ORG,
} from '../util/__mocks__/dynamo-util';

const MOCK_BODY_PARAMS = JSON.stringify({
  toUserId: MOCK_USER_A.id,
  orgId: MOCK_ORG.id,
  amount: 1,
});
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

// eslint-disable-next-line
const MOCK_HASH = '0x12345325252';
const transferEmployeeTokensSpy = jest.fn(() => ({ hash: MOCK_HASH }));
// @ts-expect-error it's okay
getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
  return {
    transferEmployeeTokens: transferEmployeeTokensSpy,
  };
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
const batchGetUsersByIdSpy = jest.spyOn(dynamoUtil, 'batchGetUsersById');

describe('api-post-self-transfer', () => {
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

    it('Should call batchGetUsersById with the authd user and toUserId', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledTimes(1);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledWith(
        [MOCK_USER_A.id, MOCK_USER_SELF.id],
        {}
      );
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

    it('Should call transferEmployeeTokens with the passed in amount and addresses from users', async () => {
      await handler(MOCK_EVENT);
      expect(transferEmployeeTokensSpy).toHaveBeenCalledTimes(1);
      expect(transferEmployeeTokensSpy).toHaveBeenCalledWith(
        MOCK_USER_SELF.walletAddressC,
        MOCK_USER_A.walletAddressC,
        1
      );
    });
  });
});
