import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { initDynamoClient, addUserToOrg } from '../util/dynamo-util';

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

    const orgId = event.pathParameters?.orgId;
    if (!orgId) {
      return generateReturn(400, { message: 'orgId is required' });
    }

    logger.verbose('Adding user to org', { values: { userId, orgId } });
    const orgWithNewUser = await addUserToOrg(userId, orgId, dynamoClient);
    logger.info('Added user to org', { values: { orgWithNewUser } });

    const org = orgWithNewUser.Attributes;

    return generateReturn(200, { org });
  } catch (error) {
    console.log(error);
    logger.error('Failed to join org', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to join the org',
      error: error,
    });
  }
};
