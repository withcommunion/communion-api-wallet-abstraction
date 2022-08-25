import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { OrgWithPrivateData, User } from './dynamo-util';

interface GatewayEventParamOverrides {
  userId?: string;
  orgId?: string;
  role?: string;
  familyName?: string;
  givenName?: string;
  email?: string;
  body?: string;
  queryStringParameters?: { [key: string]: string };
}
export function generateApiGatewayEvent(
  paramOverrides: GatewayEventParamOverrides
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    headers: {
      authorization: 'Bearer someRandomToken',
    },
    body: paramOverrides.body || '',
    isBase64Encoded: false,
    pathParameters: {
      orgId: paramOverrides.orgId || 'jacks-pizza-1',
    },
    rawPath: paramOverrides.orgId
      ? `/org/${paramOverrides.orgId}`
      : '/org/jacks-pizza-1',
    rawQueryString: '',
    queryStringParameters: paramOverrides.queryStringParameters || {},
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
  organizations?: { orgId: string; role: string }[];
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
    organizations: paramOverrides.organizations || [
      { orgId: 'test-org', role: 'worker' },
    ],
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
export function generateMockOrg(
  paramOverrides: MockOrgParamOverrides
): OrgWithPrivateData {
  return {
    id: paramOverrides.id || 'some-mock-org-a',
    member_ids: paramOverrides.member_ids || ['some-user-a', 'some-user-b'],
    join_code: 'asdf',
    // @ts-expect-error it's okay
    roles: ['worker', 'manager', 'owner', 'seeder'],
    actions: [
      {
        allowed_roles: ['worker', 'manager', 'owner'],
        amount: '0.05',
        name: 'Kindness',
      },
    ],
    redeemables: [
      {
        // @ts-expect-error it's okay
        allowed_roles: ['worker', 'manager', 'owner'],
        amount: '10',
        name: 'Slice of Pizza',
      },
      {
        // @ts-expect-error it's okay
        allowed_roles: ['worker', 'manager', 'owner'],
        amount: '150',
        name: '1 Day PTO',
      },
    ],
    avax_contract: {
      address: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
      token_address: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
      token_name: 'Avax',
      token_symbol: 'AVAX',
    },
    seeder: {
      privateKeyWithLeadingHex: '0xf9c...294c',
      walletAddressC: '0xfE96DA...965f',
    },
  };
}

interface MockTxParamOverrides {
  to_user_id: string;
  from_user_id: string;
  org_id?: string;
}
export function generateMockTx(paramOverrides: MockTxParamOverrides) {
  return {
    org_id: paramOverrides.org_id || 'communion-test-org',
    from_user_id: paramOverrides.from_user_id || 'local-mock-user-self',
    to_user_id: paramOverrides.to_user_id || 'local-mock-user-self',
    to_user_id_txn_hash_urn:
      '6281d918-df36-48bf-b8a4-3ee1f2b8305e:0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
    amount: 2,
    created_at: 1661457691,
    from_user_to_user_txn_hash_urn:
      '563ca6ea-53e0-42d9-932d-cf284fa2583f:6281d918-df36-48bf-b8a4-3ee1f2b8305e:0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
    tx_hash:
      '0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
  };
}
