// Docs: https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandOutput,
} from '@aws-sdk/lib-dynamodb';

export async function getWalletPrivateKeyByUserId() {
  //TODO Actually hit the DB.  This key is super temporary, it's okay to commit
  return '0x342d126ecba77ef9aa5fe9f28c1fb4443f7a5eb22315f7533a6b03a65d8bfd0a';
}

const stage = process.env.STAGE || 'dev';

export const usersTable = `userTable-${stage}`;
export const REGION = 'us-east-1';

export function initDynamoClient(region: string = REGION) {
  const ddbClient = new DynamoDBClient({ region });

  const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
  };

  const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
  };

  const translateConfig = { marshallOptions, unmarshallOptions };

  const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);
  return ddbDocClient;
}

export interface BaseUserWallet {
  privateKeyWithLeadingHex: string;
  addressC: string;
  addressP: string;
  addressX: string;
}

export interface User {
  urn: string;
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  organization: string;
  wallet: BaseUserWallet;
}

// TODO: This will overwrite existing values.  Find proper args to not update existing values.
export async function insertUser(
  ddbClient: DynamoDBDocumentClient,
  user: User
): Promise<PutCommandOutput> {
  try {
    const itemToInsert = new PutCommand({
      TableName: usersTable,
      Item: {
        ...user,
      },
    });
    const res = await ddbClient.send(itemToInsert);

    return res;
  } catch (error) {
    console.error('Error in dynamo-util.insertUser', error);
    throw error;
  }
}
