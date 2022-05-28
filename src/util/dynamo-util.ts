// Docs: https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandOutput,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const stage = process.env.STAGE || 'dev';

export const usersTable = `usersTable-${stage}`;
export const REGION = 'us-east-1';

export function initDynamoClient(region: string = REGION) {
  const ddbClient = new DynamoDBClient({ region });

  const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: false,
    convertClassInstanceToMap: false,
  };

  const unmarshallOptions = {
    wrapNumbers: false,
  };

  const translateConfig = { marshallOptions, unmarshallOptions };
  const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);
  return ddbDocClient;
}

export interface BaseUserWallet {
  privateKeyWithLeadingHex?: string;
  addressC: string;
  addressP: string;
  addressX: string;
}

export interface User {
  id: string;
  email?: string;
  first_name: string;
  last_name: string;
  organization: string;
  role: 'worker' | 'manager' | 'owner' | 'seeder' | string;
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
  userId: string
): Promise<User> {
  const itemToGet = new GetCommand({
    TableName: usersTable,
    Key: {
      id: userId,
    },
  });

  let res;
  try {
    res = await ddbClient.send(itemToGet);
  } catch (error) {
    console.error('Failed to dynamo-util.getUserById', error);
    throw error;
  }

  if (!res || !res.Item) {
    throw new Error(`User not found! [userId:${userId}]`);
  }

  const { Item } = res;
  return {
    id: Item.id as string,
    email: Item.email as string,
    first_name: Item.first_name as string,
    last_name: Item.last_name as string,
    organization: Item.organization as string,
    wallet: Item.wallet as BaseUserWallet,
  } as User;
}

export async function getUsersInOrganization(
  orgId: string,
  dynamoClient: DynamoDBDocumentClient
) {
  const scanParams = {
    TableName: usersTable,
    FilterExpression: 'organization = :organization',
    ExpressionAttributeValues: {
      ':organization': orgId,
    },
  };

  let res;
  try {
    res = await dynamoClient.send(new ScanCommand(scanParams));
  } catch (error) {
    console.error('Failed to dynamo-util.getUsersInOrganization', error);
    throw error;
  }

  if (!res || !res.Items) {
    throw new Error(`No users found in organization! [orgId:${orgId}]`);
  }

  const users = res.Items as User[];
  return users;
}
