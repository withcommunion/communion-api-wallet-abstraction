jest.mock('../util/dynamo-util.ts');
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler } from './api-get-org-by-id';
import {
  MOCK_ORG,
  //   MOCK_USER_A,
  MOCK_USER_SELF,
} from '../util/__mocks__/dynamo-util';
import * as dynamoUtil from '../util/dynamo-util';
import { User, getOrgById, batchGetUsersById } from '../util/dynamo-util';

const MOCK_EVENT: APIGatewayProxyEventV2WithJWTAuthorizer = {
  headers: {
    accept: '*/*',
    'accept-encoding': 'gzip, deflate, br',
    authorization: 'Bearer ey',
    'content-length': '0',
    host: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    'postman-token': 'bc915041-5a6c-46ba-91bb-198abca8940b',
    'user-agent': 'PostmanRuntime/7.26.8',
    'x-amzn-trace-id': 'Root=1-62b3cee4-022a11c4700cca9572af32cd',
    'x-forwarded-for': '187.171.26.64',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  isBase64Encoded: false,
  pathParameters: {
    orgId: 'jacks-pizza-1',
  },
  rawPath: '/org/jacks-pizza-1',
  rawQueryString: '',
  requestContext: {
    accountId: '143056416942',
    apiId: 'p0rddetfk8',
    authorizer: {
      jwt: {
        claims: {
          aud: '4eerlu1taf72c8r20pv2tmmvmt',
          auth_time: '1655231244',
          'cognito:username': MOCK_USER_SELF.id,
          'custom:organization': 'org-jacks-pizza-1',
          'custom:role': 'worker',
          email: 'mfalicea58+8@gmail.com',
          email_verified: 'true',
          event_id: '2ca1abf8-d8f9-4ea6-84ea-a7372bc1fe3e',
          exp: '1655954448',
          family_name: 'Euler',
          given_name: 'George',
          iat: '1655950848',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXRZZF0cp',
          jti: 'e14f5743-0fda-4c7d-a9d7-02d6d9676906',
          origin_jti: '17de6adc-7b16-4019-924d-0299ac94ab99',
          sub: 'c7530d06-208a-45fe-a83d-147b146cb257',
          token_use: 'id',
        },
        scopes: [],
      },
      principalId: '',
      integrationLatency: 1,
    },
    domainName: 'p0rddetfk8.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'p0rddetfk8',
    http: {
      method: 'GET',
      path: '/org/jacks-pizza-1',
      protocol: 'HTTP/1.1',
      sourceIp: '187.171.26.64',
      userAgent: 'PostmanRuntime/7.26.8',
    },
    requestId: 'UJ1Dyi-3oAMEM6Q=',
    routeKey: 'GET /org/{orgId}',
    stage: '$default',
    time: '23/Jun/2022:02:24:36 +0000',
    timeEpoch: 1655951076898,
  },
  routeKey: 'GET /org/{orgId}',
  version: '2.0',
};

describe('getOrgById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    it('Should return the correct org', async () => {
      const resp = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const org = JSON.parse(resp.body);
      const expectedOrg = MOCK_ORG;
      // @ts-expect-error This is ok
      delete expectedOrg.seeder;

      expect(getOrgById).toHaveBeenCalledWith('jacks-pizza-1', {});
      expect(org).toEqual(expect.objectContaining(MOCK_ORG));
    });

    it('Should call getOrgById with the org in the path param', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgById).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
    });

    it('Should call batchGetUsersById with all users returned from the org', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersById).toHaveBeenCalledWith(MOCK_ORG.member_ids, {});
    });

    it('Should not include the requesting user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).members as User[];

      expect(usersInBody).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SELF.id }),
        ])
      );
    });
  });

  describe('Unhappy path', () => {
    it('Should return a 403 status code if the user is not a member of the org', async () => {
      const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
      // @ts-expect-error This is ok
      getOrgByIdSpy.mockImplementationOnce(async () => ({
        ...MOCK_ORG,
        member_ids: ['not-a-member'],
      }));
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(403);
    });
    it('Should return a 404 status code if org doesnt exist in the DB', async () => {
      const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
      getOrgByIdSpy.mockImplementationOnce(async () => null);
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(404);
    });
  });
});
