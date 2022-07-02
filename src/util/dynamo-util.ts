// Docs: https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb
// Examples: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandOutput,
  GetCommand,
  BatchGetCommand,
  UpdateCommand,
  UpdateCommandOutput,
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
  organizations: { orgId: string; role: string }[];
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
  user: User,
  ddbClient: DynamoDBDocumentClient
): Promise<PutCommandOutput> {
  const itemToInsert = new PutCommand({
    TableName: usersTable,
    Item: {
      ...user,
    },
  });
  const res = await ddbClient.send(itemToInsert);

  return res;
}

export async function getUserById(
  userId: string,
  ddbClient: DynamoDBDocumentClient
): Promise<User> {
  const itemToGet = new GetCommand({
    TableName: usersTable,
    Key: {
      id: userId,
    },
  });

  const res = await ddbClient.send(itemToGet);
  const user = res.Item as User;
  return user;
}

export async function batchGetUsersById(
  userIds: string[],
  ddbClient: DynamoDBDocumentClient
): Promise<User[]> {
  const batchItemsToGet = new BatchGetCommand({
    RequestItems: {
      [usersTable]: {
        Keys: userIds.map((userId) => ({ id: userId })),
      },
    },
  });

  const res = await ddbClient.send(batchItemsToGet);
  if (res.Responses && res.Responses[usersTable]) {
    return res.Responses[usersTable] as User[];
  } else {
    return [];
  }
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
export interface OrgRedeemables {
  name: string;
  amount: string;
  allowed_roles: Roles[];
}
export interface OrgWithPrivateData {
  id: string;
  actions: OrgAction[];
  redeemables: OrgRedeemables[];
  roles: Roles[];
  member_ids: string[];
  seeder: {
    address: string;
    privateKeyWithLeadingHex: string;
  };
  members?: UserWithPublicData[];
}

export type OrgWithPublicData = Omit<OrgWithPrivateData, 'seeder'>;

export async function getOrgById(
  orgId: string,
  ddbClient: DynamoDBDocumentClient
): Promise<OrgWithPrivateData | null> {
  const itemToGet = new GetCommand({
    TableName: orgsTable,
    Key: {
      id: orgId,
    },
  });

  const res = await ddbClient.send(itemToGet);

  if (!res || !res.Item) {
    return null;
  }

  const org = res.Item as OrgWithPrivateData;
  return org;
}

export async function addUserToOrg(
  userId: string,
  orgId: string,
  ddbClient: DynamoDBDocumentClient
): Promise<UpdateCommandOutput> {
  const params = new UpdateCommand({
    TableName: orgsTable,
    Key: {
      id: orgId,
    },
    ReturnValues: 'ALL_NEW',
    UpdateExpression: 'SET member_ids = list_append(member_ids, :userId)',
    ConditionExpression: 'NOT contains (member_ids, :userIdStr)',
    ExpressionAttributeValues: {
      ':userId': [userId],
      ':userIdStr': userId,
    },
  });

  const resp = await ddbClient.send(params);

  return resp;
}
