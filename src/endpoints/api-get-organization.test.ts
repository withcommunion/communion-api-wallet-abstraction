jest.mock('../util/dynamo-util.ts');
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler } from './api-get-organization';
import { MOCK_USER_SELF, MOCK_USER_A } from '../util/__mocks__/dynamo-util';
import { getUserById, getUsersInOrganization, User } from '../util/dynamo-util';

const MOCK_EVENT: APIGatewayProxyEventV2WithJWTAuthorizer = {
  version: '2.0',
  routeKey: 'GET /user/self',
  rawPath: '/user/self',
  rawQueryString: '',
  headers: {
    accept: 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.5',
    authorization:
      'eyJraWQiOiJrOU9RdjB5XC9TMER2QmdxXC9rTVwvWWltdDZPWXVBa2UrK1dUck9nQnpiS1B3PSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiIyMWY1NmQyMS00NWZmLTQwYTktOTA0MS0xZjNkM2I4NjRkZjUiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9FWFJaWkYwY3AiLCJjbGllbnRfaWQiOiI0ZWVybHUxdGFmNzJjOHIyMHB2MnRtbXZtdCIsIm9yaWdpbl9qdGkiOiI4ZmVkYzk5My1jN2U1LTRlZWUtODgwMi1jZTcyMDRlYmM5NTYiLCJldmVudF9pZCI6IjY0YWExNTg0LWRiNzUtNGIzZS05MTdkLWZlZjdhZmEyM2RjYiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE2NTI5MzAzNDksImV4cCI6MTY1Mjk4MTcxNSwiaWF0IjoxNjUyOTc4MTE1LCJqdGkiOiI1MDU3ZDFlNi1hMjY0LTQ4MmEtOTRkYS1iYjA2YzgzYTY2YTYiLCJ1c2VybmFtZSI6IjIxZjU2ZDIxLTQ1ZmYtNDBhOS05MDQxLTFmM2QzYjg2NGRmNSJ9.IENPV4e7DMx5nd02XqESAKjVvBAONDdw1Y2jlavtkM2Kk84HdjLmn0yFOnxQbH5srMxxvjhGP5KYIy_dm_feIAYVCoThc0d6msTQb74HZgq5JImbzZ06699W-fgfzTmSiCSnmjkMGPGx3NOkUhlaLCWsKIZiwPptmShpXWtOT6NxUMkkRytceVpteTmhxRcd2vKSI7mG1fAp9tUMi9-TdTwBqcMrBKdjhwNVIaXkLbSqj5TxJyi4AGZz8_1lQOo6sw28J0dlSk9bHvJI4vFfunESvcwFxXTRbwbDTx06Eff4Xn6DcFAVEwwJyklS9uJfUF0RhMevR-aHOZ1-FYKpiQ',
    'cache-control': 'no-cache',
    'content-length': '0',
    dnt: '1',
    host: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    origin: 'http://localhost:3000',
    pragma: 'no-cache',
    referer: 'http://localhost:3000/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-gpc': '1',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0',
    'x-amzn-trace-id': 'Root=1-62867f2f-666d68fa1b39c7da36f9181d',
    'x-forwarded-for': '187.252.201.14',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  requestContext: {
    accountId: '143056416942',
    apiId: 'p0rddetfk8',
    authorizer: {
      jwt: {
        claims: {
          auth_time: '1652930349',
          client_id: '4eerlu1taf72c8r20pv2tmmvmt',
          event_id: '64aa1584-db75-4b3e-917d-fef7afa23dcb',
          exp: '1652981715',
          iat: '1652978115',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXRZZF0cp',
          jti: '5057d1e6-a264-482a-94da-bb06c83a66a6',
          origin_jti: '8fedc993-c7e5-4eee-8802-ce7204ebc956',
          scope: 'aws.cognito.signin.user.admin',
          sub: 'local-invoke-45ff-40a9-9041-1f3d3b864df5',
          token_use: 'access',
          username: MOCK_USER_SELF.id,
        },
        scopes: ['some-scope'],
      },
      principalId: 'asdf',
      integrationLatency: 0,
    },
    domainName: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'p0rddetfk8',
    http: {
      method: 'GET',
      path: '/user/self',
      protocol: 'HTTP/1.1',
      sourceIp: '187.252.201.14',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0',
    },
    requestId: 'SYjPgjuCoAMEJzw=',
    routeKey: 'GET /user/self',
    stage: '$default',
    time: '19/May/2022:17:32:31 +0000',
    timeEpoch: 1652981551844,
  },
  pathParameters: {
    orgId: 'test-org',
  },
  isBase64Encoded: false,
};

describe('getWalletByUserId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    // TODO: Fix this test once we no longer use URN to fetch user
    it('Should call getUserById with the requester id', async () => {
      await handler(MOCK_EVENT);
      expect(getUserById).toHaveBeenCalledWith({}, `${MOCK_USER_SELF.id}`);
    });
    it('Should call getOrganization with the organization that was passed in', async () => {
      await handler(MOCK_EVENT);
      expect(getUsersInOrganization).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
    });

    it('Should not include the requesting user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).users as User[];

      expect(usersInBody).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SELF.id }),
        ])
      );
    });

    it('Should include all users except the request user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).users as User[];

      expect(usersInBody).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_A.id }),
        ])
      );
    });
  });

  describe('Unhappy path', () => {
    describe('If the user is not in the org that is being requested', () => {
      it('Should return a 403 status code', async () => {
        const res = await handler({
          ...MOCK_EVENT,
          pathParameters: { orgId: 'not-test-org' },
        });

        expect(res.statusCode).toBe(403);
      });
    });
  });
});
