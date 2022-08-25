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
const MOCK_ORG = generateMockOrg({ id: MOCK_USER_SELF.organizations[0].orgId });

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

const batchGetOrgsByIdSpy = jest.spyOn(dynamoUtil, 'batchGetOrgsById');
batchGetOrgsByIdSpy.mockImplementation(() => Promise.resolve([MOCK_ORG]));

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
batchGetUsersByIdSpy.mockImplementation(() => Promise.resolve([MOCK_USER_A]));

describe('api-get-self-txs', () => {
  it('Should return a 200 status code', async () => {
    const resp = await handler(MOCK_EVENT);
    expect(resp.statusCode).toBe(200);
  });
});
