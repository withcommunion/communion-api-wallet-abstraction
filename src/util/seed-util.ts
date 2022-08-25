import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { ethers } from 'ethers';
import { sendAvax } from './avax-chain-util';
import { getUserById } from './dynamo-util';

// TODO - this is bad, lets fetch it from the organization
export const SEED_ACCOUNT_ID = '8f1e9bac-6969-4907-94f9-6187ec382976';
export const BASE_AMOUNT_TO_SEED_USER = '0.01';

export async function getSeedAccountPrivateKey(
  dynamoClient: DynamoDBDocumentClient
): Promise<string> {
  // TODO: We likely want to fetch this from environment or similar
  const seedAccount = await getUserById(SEED_ACCOUNT_ID, dynamoClient);
  if (!seedAccount) {
    throw new Error('Seed account not found - that is really weird');
  }
  const seedPrivateKey = seedAccount.walletPrivateKeyWithLeadingHex;

  if (!seedPrivateKey) {
    throw new Error('Seed account has no private key');
  }

  return seedPrivateKey;
}

export async function seedFundsForUser(
  userCchainAddressToSeed: string,
  dynamoClient: DynamoDBDocumentClient,
  waitForTxnToFinish = false
) {
  const seedPrivateKey = await getSeedAccountPrivateKey(dynamoClient);
  const seedWallet = new ethers.Wallet(seedPrivateKey);

  const res = await sendAvax(
    seedWallet,
    BASE_AMOUNT_TO_SEED_USER,
    userCchainAddressToSeed,
    waitForTxnToFinish
  );

  return res;
}
