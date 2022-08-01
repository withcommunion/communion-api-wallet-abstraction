import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import { getUserById, initDynamoClient, Self } from '../util/dynamo-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

interface ExpectedPostBody {
  action: string;
  message: string;
}
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    setDefaultLoggerMetaForApi(event, logger);

    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can come through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    let message = '';
    let action = '';
    try {
      if (!event.body) {
        return generateReturn(400, {
          message: 'No body provided, need message',
          body: event.body,
        });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      message = body.message;
      action = body.action;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body', error });
    }

    logger.verbose('Fetching user', { values: { userId: userId } });
    let user;
    try {
      user = (await getUserById(userId, dynamoClient)) as Self;
      logger.verbose('Received user', { values: user });
    } catch (error) {
      logger.error('Failed to get user', { values: { error } });
    }
    const userForLogging = user && {
      name: `${user.first_name} ${user.last_name}`,
      id: user.id,
      email: user.email,
      walletAddressC: user.walletAddressC,
    };

    const returnValue = generateReturn(200, {
      message,
      action,
    });
    logger.info('Error message sent:', {
      values: {
        userId,
        userForLogging,
        message,
        action,
      },
    });

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
