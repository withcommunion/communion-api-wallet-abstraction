import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  initDynamoClient,
  getOrgById,
  OrgWithPublicData,
  batchGetUsersById,
  UserWithPublicData,
} from '../util/dynamo-util';

import logger from '../util/winston-logger-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  const claims = event.requestContext.authorizer.jwt.claims;
  // For some reason it can go through in two seperate ways
  const requestUserId =
    (claims.username as string) || (claims['cognito:username'] as string);

  // TODO - This can be a util function
  logger.defaultMeta = {
    _requestId: event.requestContext.requestId,
    userId: requestUserId,
  };

  logger.info('Incoming Event', {
    values: { event },
  });
  logger.verbose('Incoming Event Auth', {
    values: { authorizer: event.requestContext.authorizer },
  });

  const orgId = event.pathParameters?.orgId;

  if (!orgId) {
    return generateReturn(400, {
      message: 'Missing orgId',
    });
  }

  try {
    logger.verbose('Getting org by id', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.info('Received org', { values: { org } });

    if (!org) {
      logger.verbose('Returing 404, the org was not found', {
        values: { orgId },
      });
      return generateReturn(404, {
        message: `${orgId} organization not found`,
      });
    }

    if (!org.member_ids.includes(requestUserId)) {
      logger.warn('User is not a member of this org, why are they here?', {
        values: { requestUserId, orgId },
      });
      return generateReturn(403, {
        message: `${requestUserId} is not a member of ${orgId}`,
      });
    }

    const orgWithPublicData: OrgWithPublicData = {
      id: org.id,
      actions: org.actions,
      roles: org.roles,
      member_ids: org.member_ids,
    };

    logger.verbose('Fetching all users in org', {
      values: { member_ids: orgWithPublicData.member_ids },
    });
    const allUsersInOrgWithPrivateData = await batchGetUsersById(
      orgWithPublicData.member_ids,
      dynamoClient
    );
    logger.verbose('Received users in org', {
      values: { orgId, usersInOrg: allUsersInOrgWithPrivateData },
    });

    // TODO - This can be a util function
    const filteredUsersInOrgWithPrivateData =
      allUsersInOrgWithPrivateData.filter(
        (user) => user.id !== requestUserId && user.role !== 'seeder'
      );

    // TODO - This can be a util function
    const usersInOrgWithPublicData = filteredUsersInOrgWithPrivateData.map(
      (user) =>
        ({
          ...user,
          email: undefined,
          walletPrivateKeyWithLeadingHex: undefined,
        } as UserWithPublicData)
    );

    logger.info('Removed Self, Seeder and private data', {
      values: { usersInOrgWithPublicData },
    });

    return generateReturn(200, {
      ...orgWithPublicData,
      members: usersInOrgWithPublicData,
    });
  } catch (error) {
    logger.error('Failed to get org', {
      values: { error },
    });

    return generateReturn(500, {
      message: 'Something went wrong trying to get the org',
      error: error,
    });
  }
};
