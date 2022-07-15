import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
// import { ethers } from 'ethers';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { getUserById, initDynamoClient, Self } from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

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
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    let body;
    try {
      // eslint-disable-next-line
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body' });
    }
    // console.log(orgId);

    logger.verbose('Fetching user', { values: { userId } });
    const user = (await getUserById(userId, dynamoClient)) as Self;
    if (!user) {
      logger.error(
        'User not found on getSelf - something is wrong, user is Authd and exists in Cognito but not in our DB',
        {
          values: { userId },
        }
      );
      return generateReturn(404, { message: 'User not found' });
    }

    logger.info('Received user', { values: { user } });

    return generateReturn(200, { transaction: {} });
  } catch (error) {
    logger.error('Failed to Transfer', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to transfer funds',
      error: error,
    });
  }
};
