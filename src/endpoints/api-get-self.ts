import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import { getUserById, initDynamoClient } from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    console.log('incomingEvent', event);
    console.log('incomingEventAuth', event.requestContext.authorizer);

    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const user = await getUserById(dynamoClient, userId);

    return generateReturn(200, {
      ...user,
    });
  } catch (error) {
    console.error('Failed to get wallet', {
      error,
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
      error: error,
    });
  }
};
