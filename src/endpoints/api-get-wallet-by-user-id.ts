import type {
  // APIGatewayAuthorizerHandler,
  APIGatewayAuthorizerEvent,
} from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import { getUserById, initDynamoClient } from '../util/dynamo-util';

export const handler = async (
  event: APIGatewayAuthorizerEvent,
  requestContext: string
) => {
  try {
    console.log('incomingEvent', event);
    console.log('incomingContext', requestContext);
    // eslint-disable-next-line
    console.log(
      'incomingEventAuth',
      // @ts-expect-error just for now
      // eslint-disable-next-line
      event.requestContext.authorizer
    );
    // @ts-expect-error just for now
    // eslint-disable-next-line
    const username = event.requestContext.authorizer.jwt.claims
      .username as string;
    const userUrn = `org-jacks-pizza-1:${username}`;
    console.log('user', userUrn);

    const dynamoClient = initDynamoClient();
    const user = await getUserById(dynamoClient, userUrn);

    return generateReturn(200, {
      user,
      privateKeyWithLeadingHex: user.wallet.privateKeyWithLeadingHex,
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
