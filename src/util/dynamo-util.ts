// Docs: https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandOutput,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

const stage = process.env.STAGE || 'dev';

export const usersTable = `userTable-${stage}`;
export const REGION = 'us-east-1';

export function initDynamoClient(region: string = REGION) {
  const ddbClient = new DynamoDBClient({ region });

  const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false,
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false,
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false,
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

export async function getUserById(
  ddbClient: DynamoDBDocumentClient,
  userUrn: string
): Promise<User> {
  const itemToGet = new GetCommand({
    TableName: usersTable,
    Key: {
      urn: userUrn,
    },
  });

  const res = await ddbClient.send(itemToGet);

  if (!res.Item) {
    throw new Error('User not found!');
  }

  const { Item } = res;
  return {
    urn: Item.urn as string,
    id: Item.id as string,
    email: Item.email as string,
    first_name: Item.first_name as string,
    last_name: Item.last_name as string,
    organization: Item.organization as string,
    wallet: Item.wallet as BaseUserWallet,
  };
}
