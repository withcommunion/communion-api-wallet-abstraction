// Docs: https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb
// Examples: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandOutput,
  GetCommand,
  ScanCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';

const stage = process.env.STAGE || 'dev';

export const usersTable = `usersTable-${stage}`;
export const orgsTable = `orgsTable-${stage}`;
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

export interface User {
  id: string;
  email?: string;
  first_name: string;
  last_name: string;
  organization: string;
  role: 'worker' | 'manager' | 'owner' | 'seeder' | string;
  walletPrivateKeyWithLeadingHex?: string;
  walletAddressC: string;
  walletAddressP: string;
  walletAddressX: string;
}

export interface UserWithPublicData extends User {
  walletPrivateKeyWithLeadingHex: undefined;
  email: undefined;
}

export interface Self extends User {
  walletPrivateKeyWithLeadingHex: string;
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

  const user = res.Item as User;
  return user;
}

export async function batchGetUsersById(
  userIds: string[],
  ddbClient: DynamoDBDocumentClient
): Promise<User[]> {
  const batchItemsToGet = new BatchGetCommand({
    RequestItems: {
      [orgsTable]: {
        Keys: userIds.map((userId) => ({ id: { N: userId } })),
        ProjectionExpression: 'ATTRIBUTE_NAME',
      },
    },
  });

  let res;
  try {
    res = await ddbClient.send(batchItemsToGet);
    console.log(res);
  } catch (error) {
    console.error('Failed to dynamo-util.getUserById', error);
    throw error;
  }

  if (!res || !res.Responses) {
    throw new Error(`Users not found! [userIds:${userIds.toString()}]`);
  }

  const users = res.Responses;
  console.log(users);
  // @ts-expect-error Just for now
  return users;
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

export interface OrgAction {
  name: string;
  amount: string;
  allowed_roles: string[];
}
export enum Roles {
  worker = 'worker',
  manager = 'manager',
  owner = 'owner',
  seeder = 'seeder',
}
export interface OrgWithPrivateData {
  id: string;
  actions: OrgAction[];
  roles: Roles[];
  member_ids: string[];
  seeder: {
    address: string;
    privateKeyWithLeadingHex: string;
  };
}

export type OrgWithPublicData = Omit<OrgWithPrivateData, 'seeder'>;

export async function getOrgById(
  orgId: string,
  ddbClient: DynamoDBDocumentClient
): Promise<OrgWithPrivateData> {
  const itemToGet = new GetCommand({
    TableName: orgsTable,
    Key: {
      id: orgId,
    },
  });

  let res;
  try {
    res = await ddbClient.send(itemToGet);
  } catch (error) {
    console.error('Failed to dynamo-util.getOrgById', error);
    throw error;
  }

  if (!res || !res.Item) {
    throw new Error(`Org not found! [orgId:${orgId}]`);
  }

  const org = res.Item as OrgWithPrivateData;
  return org;
}
