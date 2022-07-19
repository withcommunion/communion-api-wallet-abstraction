import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
// import { ethers } from 'ethers';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import {
  batchGetUsersById,
  initDynamoClient,
  // getOrgById,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

async function fetchToAndFromUserHelper(toUserId: string, fromUserId: string) {
  logger.verbose('Fetching users', { values: { toUserId, fromUserId } });
  try {
    const users = await batchGetUsersById([toUserId, fromUserId], dynamoClient);

    const toUser = users.find((user) => user.id === toUserId);
    const fromUser = users.find((user) => user.id === fromUserId);

    if (!toUser || !fromUser) {
      return { toUser: null, fromUser: null };
    }

    logger.info('Received users', { values: { toUser, fromUser } });
    return { toUser, fromUser };
  } catch (error) {
    logger.error('Error fetching users', {
      values: { toUserId, fromUserId, error },
    });
    throw error;
  }
}

// async function getOrgGovernanceContractHelper(orgId: string) {
//   const org = await getOrgById(orgId, dynamoClient);
//   // const governanceContractAddress = org.a
// }

interface ExpectedPostBody {
  toUserId: string;
  orgId: string;
}
/**
 * Parse body
 * Get to and from user id
 * Fetch to user
 * Fetch from user
 * Ensure to user is in org
 * Ensure from user is in org
 * Fetch org for private key in seeder
 * Create contract as seeder with Ethers
 * Call endpoint to transfer tokens
 * Wait for txn?  Accept param to wait for txn?
 * Return txn hash
 */
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
    const fromUserId =
      (claims.username as string) || (claims['cognito:username'] as string);

    let orgId = '';
    let toUserId = '';
    try {
      if (!event.body) {
        return generateReturn(400, { message: 'No body provided' });
      }

      const body = JSON.parse(event.body) as ExpectedPostBody;
      orgId = body.orgId;
      toUserId = body.toUserId;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body' });
    }
    if (!orgId || !toUserId || !fromUserId) {
      return generateReturn(400, {
        message: 'Missing required fields',
        fields: { orgId, toUserId },
      });
    }

    const { toUser, fromUser } = await fetchToAndFromUserHelper(
      toUserId,
      fromUserId
    );
    if (!toUser || !fromUser) {
      return generateReturn(400, { message: 'Could not find users' });
    }

    const isToUserInOrg = Boolean(
      toUser.organizations.find((org) => org.orgId === orgId)
    );
    const isFromUserInOrg = Boolean(
      fromUser.organizations.find((org) => org.orgId === orgId)
    );

    if (!isToUserInOrg || !isFromUserInOrg) {
      return generateReturn(400, {
        message:
          'Either the toUser or the fromUser is not in org, they both must be in the org',
        fields: { orgId, isToUserInOrg, isFromUserInOrg },
      });
    }

    // const orgGovernanceContract = await getOrgGovernanceContractHelper(orgId);

    return generateReturn(200, { transaction: {} });
  } catch (error) {
    logger.error('Failed to Transfer', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to transfer funds',
      error: error,
    });
  }
};
