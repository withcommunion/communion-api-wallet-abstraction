import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { User } from './dynamo-util';

interface GatewayEventParamOverrides {
  userId?: string;
  orgId?: string;
  role?: string;
  familyName?: string;
  givenName?: string;
  email?: string;
}
export function generateApiGatewayEvent(
  paramOverrides: GatewayEventParamOverrides
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    headers: {
      authorization: 'Bearer someRandomToken',
    },
    isBase64Encoded: false,
    pathParameters: {
      orgId: paramOverrides.orgId || 'jacks-pizza-1',
    },
    rawPath: paramOverrides.orgId
      ? `/org/${paramOverrides.orgId}`
      : '/org/jacks-pizza-1',
    rawQueryString: '',
    requestContext: {
      accountId: '143056416942',
      apiId: 'p0rddetfk8',
      authorizer: {
        jwt: {
          claims: {
            'cognito:username': paramOverrides.userId || 'asdf-123',
            'custom:organization': paramOverrides.orgId || 'jacks-pizza-1',
            'custom:role': paramOverrides.role || 'worker',
            email: paramOverrides.email || 'billnye@withcommunion.com',
            family_name: paramOverrides.familyName || 'Nye',
            given_name: paramOverrides.givenName || 'Bill',
            email_verified: 'true',
            sub: 'c7530d06-208a-45fe-a83d-147b146cb257',
            username: paramOverrides.userId || 'asdf-123',
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
        path: paramOverrides.orgId
          ? `/org/${paramOverrides.orgId}`
          : '/org/jacks-pizza-1',
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
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

interface MockUserParamOverrides {
  id?: string;
  organization?: string;
  role?: string;
  last_name?: string;
  first_name?: string;
  walletAddressC?: string;
  walletAddressP?: string;
  walletAddressX?: string;
  walletPrivateKeyWithLeadingHex?: string;
  email?: string;
}

export function generateMockUser(paramOverrides: MockUserParamOverrides): User {
  return {
    id: paramOverrides.id || 'local-mock-user-self',
    organization: paramOverrides.organization || 'test-org',
    role: paramOverrides.role || 'worker',
    last_name: paramOverrides.last_name || 'invoke-self',
    first_name: paramOverrides.first_name || 'local-self',
    walletAddressC:
      paramOverrides.walletAddressC ||
      '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
    walletAddressP:
      paramOverrides.walletAddressP ||
      'P-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
    walletAddressX:
      paramOverrides.walletAddressX ||
      'X-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
    walletPrivateKeyWithLeadingHex:
      paramOverrides.walletPrivateKeyWithLeadingHex ||
      '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
    email: paramOverrides.email || 'local-invoke-self@gmail.com',
  };
}
interface MockOrgParamOverrides {
  id?: string;
  member_ids?: string[];
}
export function generateMockOrg(paramOverrides: MockOrgParamOverrides) {
  return {
    id: paramOverrides.id || 'some-mock-org-a',
    member_ids: paramOverrides.member_ids || ['some-user-a', 'some-user-b'],
    actions: [
      {
        allowed_roles: ['worker', 'manager', 'owner'],
        amount: '0.05',
        name: 'Kindness',
      },
    ],
    roles: ['worker', 'manager', 'owner', 'seeder'],
    seeder: {
      privateKeyWithLeadingHex: '0xf9c...294c',
      walletAddressC: '0xfE96DA...965f',
    },
  };
}
