import type { APIGatewayProxyHandler } from 'aws-lambda';
// import log from 'lambda-log';

interface returnObject {
  statusCode: number;
  body: string;
  headers: {
    'Access-Control-Allow-Origin': '*';
    'Access-Control-Allow-Credentials': boolean;
  };
}

//   export function getMemberFromAuthorizer(
//     event: APIGatewayProxyEvent
//   ): { memberId: string; isEmailVerified: boolean } {
//     const isInLocal = process.env.IS_LOCAL === 'true';

//     const memberId = isInLocal
//       ? 'dev-id'
//       : event.requestContext.authorizer.claims['cognito:username'];

//     const isEmailVerified = isInLocal
//       ? true
//       : event.requestContext.authorizer.claims.email_verified;

//     return { memberId, isEmailVerified };
//   }

export function generateReturn(
  statusCode: number,
  body: Record<string, unknown>
): returnObject {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
  };
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    return generateReturn(200, {
      message: 'Hello world!',
    });
  } catch (error) {
    // log.error('Failed to get wallet', {
    //   error,
    // });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
    });
  }
};
