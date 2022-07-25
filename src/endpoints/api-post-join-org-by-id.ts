/**
 * TODO: Update to include adding user to the orgs governance contract
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import { initDynamoClient, addUserToOrg } from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

async function addUserToOrgHelper(userId: string, orgId: string) {
  try {
    logger.verbose('Attempting to add user to org', {
      values: { userId, orgId },
    });
    const respFromDb = await addUserToOrg(userId, orgId, dynamoClient);
    logger.info('Added user to org', {
      values: { orgId, respFromDb },
    });

    return respFromDb;
  } catch (error) {
    // @ts-expect-error error.name does exist here
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn(
        `User already exists in org ${orgId}, this is weird - but it is okay.`,
        {
          values: { userId, orgId },
        }
      );

      return null;
    } else {
      // TODO: Alert - this is bad
      logger.error('Fatal: Failed to add user to org', {
        values: { userId, orgId },
      });
      throw error;
    }
  }
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

    const orgWithNewUser = await addUserToOrgHelper(userId, orgId);
    if (!orgWithNewUser) {
      // return no-op status code
      return generateReturn(204, {
        message: 'User already exists in org, you are good to go',
      });
    }

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
