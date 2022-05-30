import type { DynamoDBStreamEvent } from 'aws-lambda';
import logger from '../util/winston-logger-util';

export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

export const handler = async (
  event: DynamoDBStreamEvent,
  // eslint-disable-next-line
  context: any
) => {
  try {
    logger.defaultMeta = {
      _requestId: `nothing for now`,
    };

    logger.info('Incoming request event:', { values: { event } });
    // eslint-disable-next-line
    logger.verbose('Incoming request context:', { values: { context } });

    return event;
  } catch (error) {
    logger.error('Error in dynamoTriggers/new-image-seed-user.ts:', {
      values: { error },
    });
    throw error;
  }
};
