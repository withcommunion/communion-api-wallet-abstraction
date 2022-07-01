import type { DynamoDBStreamEvent, Context, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ethers } from 'ethers';

import { initDynamoClient, User } from '../util/dynamo-util';
import logger from '../util/winston-logger-util';
import { seedFundsForUser } from '../util/seed-util';

export const avaxTestNetworkNodeUrl =
  'https://api.avax-test.network/ext/bc/C/rpc';
const HTTPSProvider = new ethers.providers.JsonRpcProvider(
  avaxTestNetworkNodeUrl
);

const dynamoClient = initDynamoClient();

function waitXMilliseconds(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function setDefaultLoggerMeta(context?: Context) {
  const requestId =
    context &&
    `${context.awsRequestId?.substring(0, 3)}-${context.awsRequestId?.substring(
      32
    )}}}`;

  logger.defaultMeta = {
    _requestId: requestId,
  };
}

function getInsertedUsersFromEventHelper(records: DynamoDBRecord[]) {
  const insertEvents = records.filter(
    (record) => record.eventName === 'INSERT'
  );

  const insertedUsers = insertEvents
    .map((record) => {
      if (!record || !record.dynamodb?.NewImage) {
        return undefined;
      }
      // @ts-expect-error NewImage may have undefined, unmarshall doesn't like that.  But it will handle it.
      return unmarshall(record.dynamodb.NewImage) as User;
    })
    .filter((user) => Boolean(user)) as User[];

  return insertedUsers;
}

export async function checkIfUserHasFunds(
  usersCChainAddress: string
): Promise<boolean> {
  const initialUserBalance = await HTTPSProvider.getBalance(usersCChainAddress);
  logger.info('Initial user balance', { values: { initialUserBalance } });

  if (!initialUserBalance.isZero()) {
    logger.verbose('User has funds', {
      values: { initialUserBalance, usersCChainAddress },
    });
    return true;
  }

  logger.info(
    'initialUserBalance is zero, waiting 5 seconds to check balance again'
  );

  await waitXMilliseconds(5000);

  const retryUserBalance = await HTTPSProvider.getBalance(usersCChainAddress);
  logger.verbose('Waited 5 seconds and got balance', {
    values: { retryUserBalance },
  });

  const userHasFunds = !retryUserBalance.isZero();

  logger.verbose(`Returning if user has funds: ${userHasFunds.toString()}`, {
    values: { userHasFunds },
  });

  return userHasFunds;
}

async function filterForUsersThatNeedSeeding(usersToSeed: User[]) {
  const newUsersToSeed = (
    await Promise.all(
      usersToSeed.map(async (user) => {
        const userHasFunds = Boolean(
          await checkIfUserHasFunds(user.walletAddressC)
        );

        if (userHasFunds) {
          return undefined;
        }

        return user;
      })
    )
  ).filter((user) => Boolean(user)) as User[];

  return newUsersToSeed;
}

async function seedUsersHelper(usersToSeed: User[]) {
  logger.verbose('Seeding users', { values: { usersToSeed } });

  const transactions = await Promise.all(
    usersToSeed.map(async (user) => {
      logger.verbose('Seeding user', { values: { user } });

      const transaction = await seedFundsForUser(
        user.walletAddressC,
        dynamoClient,
        true
      );

      logger.info('Seeded user', {
        values: {
          user,
          transaction,
        },
      });

      return { user, transaction };
    })
  );
  logger.info('Successfully seeded all users', {
    values: { transactions },
  });
  return transactions;
}

export const handler = async (
  event: DynamoDBStreamEvent,
  // eslint-disable-next-line
  context?: Context
) => {
  try {
    setDefaultLoggerMeta(context);
    logger.info('Incoming request event:', { values: { event } });
    logger.verbose('Incoming request context:', { values: { context } });

    const newlyInsertedUsers = getInsertedUsersFromEventHelper(event.Records);

    if (newlyInsertedUsers.length === 0) {
      logger.info('No insert events, returning', { values: { event } });
      return event;
    }

    const newUsersToSeed = await filterForUsersThatNeedSeeding(
      newlyInsertedUsers
    );

    if (newUsersToSeed.length === 0) {
      logger.info('No users to seed, returning', {
        values: { newUsersToSeed },
      });
      return event;
    }

    await seedUsersHelper(newUsersToSeed);

    return event;
  } catch (error) {
    logger.error('Error in dynamoTriggers/new-image-seed-user.ts:', {
      values: { error },
    });
    throw error;
  }
};
