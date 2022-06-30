import type { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ethers } from 'ethers';

import { initDynamoClient, User, getUserById } from '../util/dynamo-util';
import { sendAvax } from '../util/avax-chain-util';
import logger from '../util/winston-logger-util';

// TODO - This is bad, lets fetch it from the organization
export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
// TODO - This value is used in multiple places - let's move to own folder
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

export const avaxTestNetworkNodeUrl =
  'https://api.avax-test.network/ext/bc/C/rpc';
const HTTPSProvider = new ethers.providers.JsonRpcProvider(
  avaxTestNetworkNodeUrl
);

const dynamoClient = initDynamoClient();

export async function getSeedAccountPrivateKey(): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(SEED_ACCOUNT_ID, dynamoClient);
  const seedPrivateKey = seedAccount.walletPrivateKeyWithLeadingHex;

  if (!seedAccount) {
    throw new Error('Seed account not found - that is really weird');
  }

  if (!seedPrivateKey) {
    throw new Error('Seed account has no private key');
  }

  return seedPrivateKey;
}

// TODO - this can be a util function as it is used in multiple places
export async function seedFundsForUser(
  seedWallet: ethers.Wallet,
  userCchainAddressToSeed: string
) {
  const res = await sendAvax(
    seedWallet,
    BASE_AMOUNT_TO_SEED_USER,
    userCchainAddressToSeed
  );

  return res;
}

function waitXMilliseconds(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

export const handler = async (
  event: DynamoDBStreamEvent,
  // eslint-disable-next-line
  context?: Context
) => {
  try {
    const requestId =
      context &&
      `${context.awsRequestId?.substring(
        0,
        3
      )}-${context.awsRequestId?.substring(32)}}}`;

    logger.defaultMeta = {
      _requestId: requestId,
    };

    logger.info('Incoming request event:', { values: { event } });
    logger.verbose('Incoming request context:', { values: { context } });

    // TODO - Move to helper function, this is verbose and essential
    const insertedUsers = event.Records.filter(
      (record) => record.eventName === 'INSERT'
    );

    // TODO - Move to helper function, this is verbose and essential
    const insertUserEvents = insertedUsers
      .map((record) => {
        if (!record || !record.dynamodb?.NewImage) {
          return undefined;
        }
        // @ts-expect-error NewImage may have undefined, unmarshall doesn't like that.  But it will handle it.
        return unmarshall(record.dynamodb.NewImage) as User;
      })
      .filter((user) => Boolean(user)) as User[];

    // TODO - Move to helper function, this is verbose and essential
    if (insertUserEvents.length === 0) {
      logger.info('No insert events, returning', { values: { event } });
      return event;
    }

    // Check if user has funds in their wallet
    // TODO - Move to helper function
    const newUsersToSeed = (
      await Promise.all(
        insertUserEvents.map(async (user) => {
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

    if (newUsersToSeed.length === 0) {
      logger.info('No users to seed, returning', {
        values: { newUsersToSeed },
      });
      return event;
    }

    logger.info('Seeding users', { values: { newUsersToSeed } });
    logger.verbose('Fetching seed wallet');

    const seedWalletPrivateKey = await getSeedAccountPrivateKey();
    const seedWallet = new ethers.Wallet(seedWalletPrivateKey, HTTPSProvider);

    logger.verbose('Received seed wallet');

    // TODO - Move to helper function
    const transactions = await Promise.all(
      newUsersToSeed.map(async (user) => {
        logger.verbose('Seeding user', { values: { user } });

        const transaction = await sendAvax(
          seedWallet,
          BASE_AMOUNT_TO_SEED_USER,
          user.walletAddressC,
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

    logger.verbose('Successfully seeded all users', {
      values: { transactions },
    });

    return event;
  } catch (error) {
    logger.error('Error in dynamoTriggers/new-image-seed-user.ts:', {
      values: { error },
    });
    throw error;
  }
};
