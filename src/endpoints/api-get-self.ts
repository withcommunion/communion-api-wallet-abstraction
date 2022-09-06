import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import {
  getUserById,
  initDynamoClient,
  Self,
  getIsUserInBankHeistTable,
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

    logger.verbose('Fetching user', { values: { userId: userId } });
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
    logger.info('Received user', { values: user });

    const isBankHeistEnabled = process.env.IS_BANK_HEIST_ENABLED === 'true';
    const isBankHeistAvailableForUser = await getIsBankHeistTxnHelper(userId);

    const returnValue = generateReturn(200, {
      ...user,
      isBankHeistAvailable: isBankHeistEnabled
        ? isBankHeistAvailableForUser
        : false,
      walletPrivateKeyWithLeadingHex: undefined,
    });
    logger.info('Returning', { values: returnValue });

    return returnValue;
  } catch (error) {
    logger.error('Failed to get wallet', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
      error: error,
    });
  }
};

async function getIsBankHeistTxnHelper(userId: string) {
  try {
    logger.info('Checking if user is in BankHeistTable', {
      values: { userId },
    });
    const hasUserAlreadySentFromBankHeist = await getIsUserInBankHeistTable(
      userId,
      dynamoClient
    );
    logger.verbose('Checked if user is in BankHeistTable', {
      values: { userId, hasUserAlreadySentFromBankHeist },
    });
    if (hasUserAlreadySentFromBankHeist) {
      return false;
    } else {
      return true;
    }
  } catch (error) {
    logger.error('Error fetching getIsUserInBankHeistTable', {
      values: { userId, error },
    });
    throw error;
  }
}
