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
  phone_number?: string;
  allow_sms?: boolean;
  first_name: string;
  last_name: string;
  organization?: string;
  organizations: { orgId: string; role: string }[];
  role?: 'worker' | 'manager' | 'owner' | 'seeder' | string;
  walletPrivateKeyWithLeadingHex?: string;
  walletAddressC: string;
  walletAddressP: string;
  walletAddressX: string;
}

export interface UserWithPublicData extends User {
  walletPrivateKeyWithLeadingHex: undefined;
  email: undefined;
  phone_number: undefined;
}

export interface Self extends User {
  walletPrivateKeyWithLeadingHex: string;
}
export interface UserInTxn {
  first_name: string;
  last_name: string;
  id: string;
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

export async function addOrgToUser(
  userId: string,
  orgId: string,
  role: string,
  ddbClient: DynamoDBDocumentClient
): Promise<User> {
  /**
   * TODO: This fn will infinitely append to the list of organizations.
   * Maybe GET the user and see if they already have the org in JS
   */
  const params = new UpdateCommand({
    TableName: usersTable,
    Key: {
      id: userId,
    },
    ReturnValues: 'ALL_NEW',
    UpdateExpression: 'SET organizations = list_append(organizations, :orgId)',
    ConditionExpression: 'NOT contains (organizations, :orgIdStr)',
    ExpressionAttributeValues: {
      ':orgId': [{ orgId, role }],
      ':orgIdStr': orgId,
    },
  });

  const resp = await ddbClient.send(params);
  const user = resp.Attributes as User;

  return user;
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
  join_code: string;
  seeder: {
    walletAddressC: string;
    privateKeyWithLeadingHex: string;
  };
  avax_contract: {
    address: string;
    token_address: string;
    token_name: string;
    token_symbol: string;
  };
  members?: UserWithPublicData[];
}

export type OrgWithPublicData = Omit<
  OrgWithPrivateData,
  'seeder' | 'join_code'
>;

export type OrgWithManagerData = Omit<OrgWithPrivateData, 'seeder'>;

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
): Promise<OrgWithPrivateData> {
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
  const org = resp.Attributes as OrgWithPrivateData;

  return org;
}
