jest.mock('../util/dynamo-util.ts');
import { handler } from './api-get-self-txs';
import * as dynamoUtil from '../util/dynamo-util';
import {
  generateApiGatewayEvent,
  generateMockUser,
  generateMockOrg,
  generateMockTx,
} from '../util/jest-mock-util';

const MOCK_USER_SELF = generateMockUser({ id: 'self-user-id' });
const MOCK_USER_A = generateMockUser({ id: 'a-user-id' });
const MOCK_ORG = generateMockOrg({
  id: MOCK_USER_SELF.organizations[0].orgId,
  member_ids: [MOCK_USER_SELF.id],
});

const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_SELF.id,
  queryStringParameters: { orgId: MOCK_ORG.id },
});

const MOCK_TX_SENT = generateMockTx({
  from_user_id: MOCK_USER_SELF.id,
  to_user_id: MOCK_USER_A.id,
});
const MOCK_TX_RECEIVED = generateMockTx({
  from_user_id: MOCK_USER_A.id,
  to_user_id: MOCK_USER_SELF.id,
});

const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
getUserByIdSpy.mockImplementation(() => Promise.resolve(MOCK_USER_SELF));

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
getOrgByIdSpy.mockImplementation(() => Promise.resolve(MOCK_ORG));

const getUserReceivedTxsInOrgSpy = jest.spyOn(
  dynamoUtil,
  'getUserReceivedTxsInOrg'
);
getUserReceivedTxsInOrgSpy.mockImplementation(() =>
  Promise.resolve([MOCK_TX_RECEIVED])
);
const getUserSentTxsInOrgSpy = jest.spyOn(dynamoUtil, 'getUserSentTxsInOrg');
getUserSentTxsInOrgSpy.mockImplementation(() =>
  Promise.resolve([MOCK_TX_SENT])
);

const batchGetUsersByIdSpy = jest.spyOn(dynamoUtil, 'batchGetUsersById');
batchGetUsersByIdSpy.mockImplementation(() =>
  Promise.resolve([MOCK_USER_A, MOCK_USER_SELF])
);

describe('api-get-self-txs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    it('Should return an array of CommunionTxs', async () => {
      const resp = await handler(MOCK_EVENT);
      const body = JSON.parse(resp.body);

      expect(body.txs.length).toEqual(2);
      expect(body.txs[0]).toEqual({
        fromUser: expect.any(Object),
        toUser: expect.any(Object),
        timeStampSeconds: 1661457691,
        tokenName: MOCK_ORG.avax_contract.token_name,
        tokenSymbol: MOCK_ORG.avax_contract.token_symbol,
        txHash: expect.any(String),
        txHashUrl: expect.any(String),
        txStatus: 'succeeded',
        txType: 'received',
        value: 2,
      });
    });

    it('Should call getUserById with user from event', async () => {
      await handler(MOCK_EVENT);
      expect(getUserByIdSpy).toHaveBeenCalledWith(
        MOCK_EVENT.requestContext.authorizer.jwt.claims.username,
        {}
      );
    });

    it('Should call getOrgById with orgId from event', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgByIdSpy).toHaveBeenCalledWith(MOCK_ORG.id, {});
    });

    it('Should call getUserReceivedTxsInOrg with orgId from event', async () => {
      await handler(MOCK_EVENT);
      expect(getUserReceivedTxsInOrgSpy).toHaveBeenCalledTimes(1);
      expect(getUserReceivedTxsInOrgSpy).toHaveBeenCalledWith(
        MOCK_EVENT.queryStringParameters?.orgId,
        MOCK_USER_SELF.id,
        {}
      );
    });

    it('Should call getUserSentTxsInOrg with orgId from event', async () => {
      await handler(MOCK_EVENT);
      expect(getUserSentTxsInOrgSpy).toHaveBeenCalledTimes(1);
      expect(getUserSentTxsInOrgSpy).toHaveBeenCalledWith(
        MOCK_EVENT.queryStringParameters?.orgId,
        MOCK_USER_SELF.id,
        {}
      );
    });

    it('Should call batchGetUsersById with array of userIds from txs', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledWith(
        [MOCK_USER_A.id, MOCK_USER_SELF.id],
        {}
      );
    });
  });

  describe('Unhappy path', () => {
    it('Should return a 400 status code if no orgId in event', async () => {
      const event = generateApiGatewayEvent({
        userId: MOCK_USER_SELF.id,
        queryStringParameters: {},
      });
      const resp = await handler(event);
      expect(resp.statusCode).toBe(400);
    });

    it('Should return a 404 if the user was not found', async () => {
      getUserByIdSpy.mockImplementationOnce(() => Promise.resolve(undefined));
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(404);
    });

    it('Should return a 404 if the org was not found', async () => {
      getOrgByIdSpy.mockImplementationOnce(() => Promise.resolve(null));
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(404);
    });

    it('Should return a 403 if the user is not in the org', async () => {
      const MOCK_ORG_USER_NOT_IN = generateMockOrg({
        id: MOCK_USER_SELF.organizations[0].orgId,
        member_ids: [],
      });
      getOrgByIdSpy.mockImplementationOnce(() =>
        Promise.resolve(MOCK_ORG_USER_NOT_IN)
      );
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(403);
    });
  });
});
