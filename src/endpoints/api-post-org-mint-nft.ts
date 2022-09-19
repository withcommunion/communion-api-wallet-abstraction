import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { initDynamoClient, getUserById, getOrgById } from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

interface ExpectedPostBody {
  joinCode: string;
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
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.pathParameters?.orgId;
    if (!orgId) {
      return generateReturn(400, { message: 'orgId is required' });
    }

    let joinCode = '';
    try {
      const body = JSON.parse(event.body || '') as ExpectedPostBody;
      if (body.joinCode) {
        joinCode = body.joinCode;
      }
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      return generateReturn(500, { message: 'Failed to parse body' });
    }
    console.log(joinCode);

    logger.info('Fetching org from db', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.verbose('Retrieved org from db', { values: { org } });

    if (!org) {
      logger.info('Org not found', { values: { orgId } });
      return generateReturn(404, {
        message: 'org with given id does not exist',
        orgId,
      });
    }

    logger.info('Fetching user from db', { values: { userId } });
    const user = await getUserById(userId, dynamoClient);
    logger.verbose('Retrieved user from db', { values: { user } });
    if (!user) {
      logger.info('User not found', { values: { orgId } });
      return generateReturn(404, {
        message: 'user with given id does not exist',
        orgId,
      });
    }

    return generateReturn(200, {
      success: true,
    });
  } catch (error) {
    console.log(error);
    logger.error('Failed to mint nft', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to mint the nft',
      error: error,
    });
  }
};
