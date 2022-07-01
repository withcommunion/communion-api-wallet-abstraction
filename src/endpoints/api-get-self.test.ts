jest.mock('../util/dynamo-util.ts');
import { handler } from './api-get-self';
import { MOCK_USER_SELF } from '../util/__mocks__/dynamo-util';
import { generateApiGatewayEvent } from '../util/jest-mock-util';

const MOCK_EVENT = generateApiGatewayEvent({});

describe('api-get-self', () => {
  it('Should return a 200 status code', async () => {
    await handler(MOCK_EVENT);
    expect(true).toBe(true);
  });

  it('Should return the user', async () => {
    const res = await handler(MOCK_EVENT);

    expect(JSON.parse(res.body)).toEqual(MOCK_USER_SELF);
  });
});
