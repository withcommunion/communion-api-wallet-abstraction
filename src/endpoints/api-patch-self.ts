import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';

import {
  initDynamoClient,
  getUserById,
  updateUserPhoneFields,
} from '../util/dynamo-util';

const dynamoClient = initDynamoClient();

async function fetchUserHelper(userId: string) {
  logger.verbose('Fetching user', { values: { userId } });
  try {
    const user = await getUserById(userId, dynamoClient);

    if (!user) {
      logger.error('The user does not exist', {
        values: { userId },
      });
      return null;
    }

    logger.info('Received user', { values: { userId, user } });
    return user;
  } catch (error) {
    logger.error('Error fetching users', {
      values: { userId, error },
    });
    throw error;
  }
}

interface ExpectedPatchBody {
  phoneNumber: string;
  allowSms: boolean;
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

    let phoneNumber;
    let allowSms;
    try {
      if (!event.body) {
        return generateReturn(400, {
          message: 'No body provided, need phoneNumber or allowSms',
          body: event.body,
        });
      }

      const body = JSON.parse(event.body) as ExpectedPatchBody;
      phoneNumber = body.phoneNumber;
      allowSms = body.allowSms;
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      generateReturn(500, { message: 'Failed to parse body', error });
    }

    if (typeof allowSms !== 'boolean' && phoneNumber === undefined) {
      return generateReturn(400, {
        message: 'Nothing to update',
        fields: { phoneNumber, allowSms },
      });
    }

    const user = await fetchUserHelper(userId);
    if (!user) {
      logger.error('We could not find the user to update', {
        values: { userId, user },
      });
      return generateReturn(404, {
        message: 'Could not find user to update',
      });
    }

    const shouldUpdateAllowSms = typeof allowSms === 'boolean';
    /**
     * Essentially we don't want to overwrite the users phonenumber
     * If it's not included in the body
     * We want to clear a users phone number if `null` is passed in or a purposeful empty string
     */
    const shouldUpdatePhoneNumber = typeof phoneNumber !== undefined;
    const allowSmsVal = shouldUpdateAllowSms ? allowSms : user.allow_sms;
    const phoneNumberVal = shouldUpdatePhoneNumber
      ? phoneNumber
      : user.phone_number;

    const updateUserPhoneFieldsResp = await updateUserPhoneFields(
      userId,
      phoneNumberVal,
      allowSmsVal,
      dynamoClient
    );

    logger.info('Returning 200', {
      values: { phoneNumber, allowSms },
    });
    return generateReturn(200, {
      phoneNumber: updateUserPhoneFieldsResp.phone_number,
      allowSms: updateUserPhoneFieldsResp.allow_sms,
    });
  } catch (error) {
    logger.error('Failed to Redeem rewards', { values: { error } });
    return generateReturn(500, {
      message: 'Something went wrong trying to redeem rewards',
      error: error,
    });
  }
};
