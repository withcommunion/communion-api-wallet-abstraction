import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  User,
  initDynamoClient,
  getUserById,
  getUsersInOrganization,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  console.log('incomingEvent', event);
  console.log('incomingEventAuth', event.requestContext.authorizer);

  const claims = event.requestContext.authorizer.jwt.claims;
  // For some reason it can go through in two seperate ways
  const requestUserId =
    (claims.username as string) || (claims['cognito:username'] as string);

  const requestUser = await getUserById(dynamoClient, requestUserId);

  const requestUsersOrganization = requestUser.organization;
  const requestedOrganization = event.pathParameters?.orgId;

  if (requestUsersOrganization !== requestedOrganization) {
    return generateReturn(403, {
      message: 'You are not authorized to access this organization',
    });
  }
  try {
    const usersInOrgWithPrivateData = (
      await getUsersInOrganization(requestUsersOrganization, dynamoClient)
    ).filter((user) => user.id !== requestUserId && user.role !== 'seeder');
    console.log(usersInOrgWithPrivateData);

    const usersInOrgWithPublicData = usersInOrgWithPrivateData.map(
      (user) =>
        ({
          ...user,
          email: undefined,
          wallet: {
            ...user.wallet,
            privateKeyWithLeadingHex: undefined,
          },
        } as User)
    );

    return generateReturn(200, {
      name: requestedOrganization,
      users: usersInOrgWithPublicData,
    });
  } catch (error) {
    console.error('Failed to getUsersInOrganization', error);
    return generateReturn(500, {
      message: 'Failed to get users in organization',
    });
  }
};
