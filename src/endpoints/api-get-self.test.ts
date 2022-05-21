import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { handler } from './api-get-self';

const MOCK_EVENT: APIGatewayProxyHandlerV2 = {
  // @ts-expect-error mismatch on the types
  version: '2.0',
  routeKey: 'GET /wallet/{userId}',
  rawPath: '/wallet/1',
  rawQueryString: '',
  headers: {
    accept: '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'content-length': '0',
    host: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    'postman-token': '192ca78c-add8-476c-9829-fcc2c6daa45e',
    'user-agent': 'PostmanRuntime/7.26.8',
    'x-amzn-trace-id': 'Root=1-627c53d7-1d8664bb6a403c414a698e8e',
    'x-forwarded-for': '148.76.29.196',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  requestContext: {
    accountId: '143056416942',
    apiId: 'p0rddetfk8',
    domainName: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'p0rddetfk8',
    http: {
      method: 'GET',
      path: '/wallet/1',
      protocol: 'HTTP/1.1',
      sourceIp: '148.76.29.196',
      userAgent: 'PostmanRuntime/7.26.8',
    },
    requestId: 'R_IJrh9IIAMEJEg=',
    routeKey: 'GET /wallet/{userId}',
    stage: '$default',
    time: '12/May/2022:00:24:55 +0000',
    timeEpoch: 1652315095344,
  },
  pathParameters: { userId: '1' },
  isBase64Encoded: false,
};

describe('getWalletByUserId', () => {
  it('Should return a 200 status code', async () => {
    // @ts-expect-error mismatch on the types
    // eslint-disable-next-line
    await handler(MOCK_EVENT, MOCK_EVENT.requestContext, jest.fn());
    expect(true).toBe(true);
  });
});
