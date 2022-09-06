jest.mock('../util/dynamo-util.ts');
import { handler } from './api-get-self';
import * as dynamoUtil from '../util/dynamo-util';
import {
  generateApiGatewayEvent,
  generateMockUser,
} from '../util/jest-mock-util';

const MOCK_USER_SELF = generateMockUser({ id: 'self-user-id' });
const MOCK_EVENT = generateApiGatewayEvent({ userId: MOCK_USER_SELF.id });

describe('api-get-self', () => {
  const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
  getUserByIdSpy.mockImplementation(() => Promise.resolve(MOCK_USER_SELF));

  it('Should return a 200 status code', async () => {
    await handler(MOCK_EVENT);
    expect(true).toBe(true);
  });

  it('Should return the user', async () => {
    const res = await handler(MOCK_EVENT);

    expect(JSON.parse(res.body)).toEqual({
      ...MOCK_USER_SELF,
      isBankHeistAvailable: false,
      walletPrivateKeyWithLeadingHex: undefined,
    });
  });
});
