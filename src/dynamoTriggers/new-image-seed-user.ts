import type { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';

// import { initDynamoClient } from '../util/dynamo-util';

import logger from '../util/winston-logger-util';

export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

// const dynamoClient = initDynamoClient();

export const handler = async (
  event: DynamoDBStreamEvent,
  // eslint-disable-next-line
  context: Context
) => {
  try {
    const requestId = `${context.awsRequestId?.substring(
      0,
      8
    )}...${context.awsRequestId?.substring(30)}}}`;

    logger.defaultMeta = {
      _requestId: requestId,
    };

    logger.info('Incoming request event:', { values: { event } });
    logger.verbose('Incoming request context:', { values: { context } });

    const newUsers = event.Records.map((record) => {
      if (record && record.dynamodb) {
        return marshall(record.dynamodb.NewImage);
      }
    }).filter((user) => Boolean(user));

    console.log(newUsers);

    return event;
  } catch (error) {
    logger.error('Error in dynamoTriggers/new-image-seed-user.ts:', {
      values: { error },
    });
    throw error;
  }
};
