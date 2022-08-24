import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  getUserById,
  initDynamoClient,
  Self,
  batchGetOrgsById,
  // getTxsToUserInOrg,
  // getTxsFromUserInOrg,
  getAllUsersTxsInOrg,
} from '../util/dynamo-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

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
    // For some reason it can come through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);
    //  * Check for querystring param
    const orgId = event.queryStringParameters?.orgId;

    //  * Fetch user
    logger.verbose('Fetching user', { values: { userId: userId } });
    const self = (await getUserById(userId, dynamoClient)) as Self;
    if (!self) {
      logger.error(
        'User not found on - something is wrong, user is Authd and exists in Cognito but not in our DB',
        {
          values: { userId },
        }
      );
      return generateReturn(404, { message: 'User not found' });
    }
    logger.info('Received user', { values: self });

    const orgIdsToFetch = orgId
      ? [orgId]
      : self.organizations.map((org) => org.orgId);
    const orgs = await fetchOrgsHelper(orgIdsToFetch);

    if (!orgs || !orgs.length) {
      logger.info('User is not apart of the requested org or any orgs', {
        values: { orgId, selfOrgs: self.organizations },
      });

      return generateReturn(404, {
        message: 'User is not apart of the requested org or any orgs',
      });
    }

    //  * query for to
    // const txsToSelf = await getTxsToUserInOrg(
    //   orgs[0].id,
    //   self.id,
    //   dynamoClient
    // );
    //  * query for from

    // const txsFromSelf = await getTxsFromUserInOrg(
    //   orgs[0].id,
    //   self.id,
    //   dynamoClient
    // );

    const allSelfTxs = await getAllUsersTxsInOrg(
      orgs[1].id,
      self.id,
      dynamoClient
    );

    // console.log('txsToSelf', txsToSelf);
    // console.log('txsFromSelf', txsFromSelf);
    console.log('allSelfTxs', allSelfTxs);
    //  *  Make 1 query for both?
    //  * Fetch all users
    //  *  100 is MAX
    //  *  If more, need to loop (can add todo for this)
    //  * Map them together making the txn
    //  *  Flag for received or sent
    //  *  Flag for redeem
    //  *  Flag for isFromBank
    //  * Sort the array

    const returnValue = generateReturn(200, {
      ...self,
    });
    logger.info('Returning', { values: returnValue });

    return returnValue;
  } catch (error) {
    logger.error('Failed to get self txs', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to fetch your txs',
      error: error,
    });
  }
};

async function fetchOrgsHelper(orgIds: string[]) {
  try {
    logger.info('Fetching orgs');
    const orgs = await batchGetOrgsById(orgIds, dynamoClient);
    return orgs;
  } catch (error) {
    logger.error('Failed to fetch orgs', { values: { error, orgIds } });
  }
}
