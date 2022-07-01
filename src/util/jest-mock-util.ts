import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

interface ParamOverrides {
  userId?: string;
  orgId?: string;
  role?: string;
  familyName?: string;
  givenName?: string;
  email?: string;
}
export function generateApiGatewayEvent(
  paramOverrides: ParamOverrides
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
