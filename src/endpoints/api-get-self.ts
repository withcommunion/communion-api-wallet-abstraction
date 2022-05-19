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

    const username = event.requestContext.authorizer.jwt.claims
      .username as string;
    // TODO: This is where and why we need to go by pure user key, not by urn
    const userUrn = `org-jacks-pizza-1:${username}`;

    const user = await getUserById(dynamoClient, userUrn);

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
