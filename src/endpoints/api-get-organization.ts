import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  User,
  initDynamoClient,
  getUserById,
  getUsersInOrganization,
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

  const requestUser = await getUserById(dynamoClient, requestUserId);

  const requestUsersOrganization = requestUser.organization;
  const requestedOrganization = event.pathParameters?.orgId;

  if (requestUsersOrganization !== requestedOrganization) {
    logger.verbose('User does not have access to requested organization', {
      values: {
        requestUsersOrganization,
        requestedOrganization,
      },
    });

    return generateReturn(403, {
      message: 'You are not authorized to access this organization',
    });
  }
  try {
    logger.verbose('Fetching users in org', { values: requestedOrganization });

    const usersInOrgWithPrivateData = (
      await getUsersInOrganization(requestedOrganization, dynamoClient)
    ).filter((user) => user.id !== requestUserId && user.role !== 'seeder');

    logger.verbose('Received users', { values: usersInOrgWithPrivateData });

    const usersInOrgWithPublicData = usersInOrgWithPrivateData.map(
      (user) =>
        ({
          ...user,
          email: undefined,
          walletPrivateKeyWithLeadingHex: undefined,
        } as User)
    );

    const returnVal = generateReturn(200, {
      name: requestedOrganization,
      users: usersInOrgWithPublicData,
    });

    logger.info('Returning', { values: returnVal });
    return returnVal;
  } catch (error) {
    logger.error('Failed to getUsersInOrganization', { values: error });
    return generateReturn(500, {
      message: 'Failed to get users in organization',
    });
  }
};
