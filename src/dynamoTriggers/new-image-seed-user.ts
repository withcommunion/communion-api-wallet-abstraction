import type { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { setTimeout } from 'timers/promises';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ethers } from 'ethers';

import { initDynamoClient, User, getUserById } from '../util/dynamo-util';
import { sendAvax } from '../util/avax-chain-util';
import logger from '../util/winston-logger-util';

export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

export const avaxTestNetworkNodeUrl =
  'https://api.avax-test.network/ext/bc/C/rpc';
const HTTPSProvider = new ethers.providers.JsonRpcProvider(
  avaxTestNetworkNodeUrl
);

const dynamoClient = initDynamoClient();

export async function getSeedAccountPrivateKey(): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(dynamoClient, SEED_ACCOUNT_ID);
  const seedPrivateKey = seedAccount.wallet.privateKeyWithLeadingHex;

  if (!seedPrivateKey) {
    throw new Error('Seed account has no private key');
  }

  return seedPrivateKey;
}

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

  let retryUserBalance;
  if (initialUserBalance.isZero()) {
    logger.info(
      'initialUserBalance is zero, waiting 5 seconds to check balance again'
    );
    await setTimeout(5000);

    retryUserBalance = await HTTPSProvider.getBalance(usersCChainAddress);
    logger.verbose('Waited 5 seconds and got balance');

    return !retryUserBalance.isZero();
  }

  return false;
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

    const insertedUsers = event.Records.filter(
      (record) => record.eventName === 'INSERT'
    );

    const potentialNewUsersToSeed = insertedUsers
      .map((record) => {
        if (!record || !record.dynamodb?.NewImage) {
          return undefined;
        }
        // @ts-expect-error NewImage may have undefined, unmarshall doesn't like that.  But it will handle it.
        return unmarshall(record.dynamodb.NewImage) as User;
      })
      .filter((user) => Boolean(user)) as User[];

    if (potentialNewUsersToSeed.length === 0) {
      logger.info('No new users to seed, returning', { values: { event } });
      return event;
    }

    // Check if user has funds in their wallet
    const newUsersToSeed = (
      await Promise.all(
        potentialNewUsersToSeed.map(async (user) => {
          const userHasFunds = Boolean(
            await checkIfUserHasFunds(user.wallet.addressC)
          );

          if (userHasFunds) {
            return undefined;
          }

          return user;
        })
      )
    ).filter((user) => Boolean(user)) as User[];

    logger.info('Seeding users', { values: { potentialNewUsersToSeed } });

    logger.verbose('Fetching seed wallet');
    const seedWalletPrivateKey = await getSeedAccountPrivateKey();
    const seedWallet = new ethers.Wallet(seedWalletPrivateKey, HTTPSProvider);
    logger.verbose('Received seed wallet');

    const transactions = await Promise.all(
      newUsersToSeed.map(async (user) => {
        logger.verbose('Seeding user', { values: { user } });

        const transaction = await sendAvax(
          seedWallet,
          BASE_AMOUNT_TO_SEED_USER,
          user.wallet.addressC,
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
