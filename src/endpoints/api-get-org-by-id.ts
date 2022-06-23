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
    logger.info('Getting org by id', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.verbose('Received org', { values: { org } });

    if (!org) {
      return generateReturn(404, {
        message: `${orgId} organization not found`,
      });
    }

    const orgWithPublicData: OrgWithPublicData = {
      id: org.id,
      actions: org.actions,
      roles: org.roles,
      member_ids: org.member_ids,
    };

    logger.info('Fetching all users in org', {
      values: { member_ids: orgWithPublicData.member_ids },
    });
    const allUsersInOrgWithPrivateData = await batchGetUsersById(
      orgWithPublicData.member_ids,
      dynamoClient
    );

    logger.verbose('Received users', {
      values: { usersInOrg: allUsersInOrgWithPrivateData },
    });

    const filteredUsersInOrgWithPrivateData =
      allUsersInOrgWithPrivateData.filter(
        (user) => user.id !== requestUserId && user.role !== 'seeder'
      );

    const usersInOrgWithPublicData = filteredUsersInOrgWithPrivateData.map(
      (user) =>
        ({
          ...user,
          email: undefined,
          walletPrivateKeyWithLeadingHex: undefined,
        } as UserWithPublicData)
    );

    logger.verbose('Removed Self, Seeder and private data', {
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
