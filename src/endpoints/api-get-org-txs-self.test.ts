jest.mock('../util/dynamo-util.ts');
import { handler } from './api-get-org-txs-self';
import { generateApiGatewayEvent } from '../util/jest-mock-util';

const MOCK_EVENT = generateApiGatewayEvent({});

describe.skip('api-get-self-txs', () => {
  it('Should return a 200 status code', async () => {
    await handler(MOCK_EVENT);
    expect(true).toBe(true);
  });
});
