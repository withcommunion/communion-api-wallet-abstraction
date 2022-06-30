import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import { getUserById, initDynamoClient, Self } from '../util/dynamo-util';
import logger from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    // TODO - This can be a util function
    logger.defaultMeta = {
      _requestId: event.requestContext.requestId,
      userId,
    };

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    logger.verbose('Fetching user', { values: { userId: userId } });
    const user = (await getUserById(userId, dynamoClient)) as Self;
    logger.verbose('Received user', { values: user });

    const returnValue = generateReturn(200, {
      ...user,
    });
    logger.info('Returning', { values: returnValue });

    return returnValue;
  } catch (error) {
    logger.error('Failed to get wallet', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
      error: error,
    });
  }
};
