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
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const stage = process.env.STAGE || 'dev';

export const usersTable = `usersTable-${stage}`;
export const orgsTable = `orgsTable-${stage}`;
export const txnsTable = `transactionsTable-${stage}`;
export const REGION = 'us-east-1';

export function initDynamoClient(region: string = REGION) {
  const ddbClient = new DynamoDBClient({ region });

  const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: true,
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
  owned_nfts?: MintedNftDetails[];
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

export async function updateUserPhoneFields(
  userId: string,
  phoneNumber: string | undefined,
  allowSms: boolean | undefined,
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
    UpdateExpression: 'SET phone_number = :phoneNumber, allow_sms = :allowSms',
    ExpressionAttributeValues: {
      ':phoneNumber': phoneNumber,
      ':allowSms': allowSms,
    },
  });

  const resp = await ddbClient.send(params);
  const user = resp.Attributes as User;

  return user;
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

export async function addMintedNftToUser(
  user: User,
  mintedNft: MintedNftDetails,
  ddbClient: DynamoDBDocumentClient
): Promise<User> {
  /**
   * Without this check, an error will be thrown
   * if the property doesn't already exist on the user
   */
  const updateExpression = user.owned_nfts
    ? 'SET #ownedNftsProperty = list_append(#ownedNftsProperty, :mintedNft)'
    : 'SET #ownedNftsProperty = :mintedNft';

  const params = new UpdateCommand({
    TableName: usersTable,
    Key: {
      id: user.id,
    },
    ReturnValues: 'ALL_NEW',
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: { '#ownedNftsProperty': 'owned_nfts' },
    ExpressionAttributeValues: {
      ':mintedNft': [mintedNft],
    },
  });

  const resp = await ddbClient.send(params);
  const updatedUser = resp.Attributes as User;

  return updatedUser;
}

export async function getUserById(
  userId: string,
  ddbClient: DynamoDBDocumentClient
): Promise<User | undefined> {
  const itemToGet = new GetCommand({
    TableName: usersTable,
    Key: {
      id: userId,
    },
  });

  const res = await ddbClient.send(itemToGet);
  const user = res.Item as User;
  if (!user) {
    return undefined;
  }

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

export interface CommunionNft {
  id: string;
  contractAddress?: string;
  mintedTokenId?: string;
  erc721Meta: {
    title: string;
    properties: {
      name: string;
      description: string;
      image: string;
      attributes: {
        display_type: number;
        trait_type: string;
        value: number;
      }[];
    };
  };
}

export interface MintedNftDetails {
  communionNftId: string;
  ownerUserId: string;
  mintedNftId: number;
  mintedNftUri: string;
  orgId: string;
  txnHash: string;
  contractAddress: string;
  createdAt: number;
}

export interface OrgWithPrivateData {
  id: string;
  available_nfts?: CommunionNft[];
  minted_nfts?: MintedNftDetails[];
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

export async function batchGetOrgsById(
  orgIds: string[],
  ddbClient: DynamoDBDocumentClient
): Promise<OrgWithPrivateData[]> {
  const batchItemsToGet = new BatchGetCommand({
    RequestItems: {
      [orgsTable]: {
        Keys: orgIds.map((orgId) => ({ id: orgId })),
      },
    },
  });

  const res = await ddbClient.send(batchItemsToGet);
  if (res.Responses && res.Responses[orgsTable]) {
    return res.Responses[orgsTable] as OrgWithPrivateData[];
  } else {
    return [];
  }
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

export async function addMintedNftToOrg(
  org: OrgWithPrivateData,
  mintedNft: MintedNftDetails,
  ddbClient: DynamoDBDocumentClient
): Promise<OrgWithPrivateData> {
  const updateExpression = org.minted_nfts
    ? 'SET #mintedNfts = list_append(#mintedNfts, :nft)'
    : 'SET #mintedNfts = :nft';

  const params = new UpdateCommand({
    TableName: orgsTable,
    Key: {
      id: org.id,
    },
    ReturnValues: 'ALL_NEW',
    UpdateExpression: updateExpression,
    // UpdateExpression: 'SET #mintedNfts = list_append(#mintedNfts, :nftId)',
    // UpdateExpression:
    //   'SET #mintedNfts = list_append(if_not_exists(#mintedNfts, :nftId), :nftId)',
    // UpdateExpression: 'SET #mintedNfts = :nftId',
    ExpressionAttributeNames: { '#mintedNfts': 'minted_nfts' },
    ExpressionAttributeValues: {
      ':nft': [mintedNft],
    },
  });

  const resp = await ddbClient.send(params);
  const user = resp.Attributes as OrgWithPrivateData;

  return user;
}

export type TransactionType = 'erc20Transfer' | 'redemption' | 'nftMint';
export interface Transaction {
  org_id: string;
  to_user_id_txn_hash_urn: string;
  from_user_to_user_txn_hash_urn: string;
  to_user_id: string;
  from_user_id: string;
  amount: number;
  tx_hash: string;
  created_at: number;
  message?: string;
  type: TransactionType;
  modifier?: 'bankHeist';
}

export async function insertTransaction(
  txn: Transaction,
  ddbClient: DynamoDBDocumentClient
): Promise<PutCommandOutput> {
  /**
   * TODO: As we scale - change to BatchInsert
   * I would do this now, but it maxes out on 25 items in batch - will need to loop anyway
   * For now PutCommand is easier but less efficient
   * */
  const itemToInsert = new PutCommand({
    TableName: txnsTable,
    Item: {
      ...txn,
    },
  });

  const res = await ddbClient.send(itemToInsert);
  return res;
}

export async function getUserReceivedTxsInOrg(
  orgId: string,
  toUserId: string,
  ddbClient: DynamoDBDocumentClient
) {
  const params = new QueryCommand({
    TableName: txnsTable,
    KeyConditionExpression:
      'org_id = :orgId AND begins_with (to_user_id_txn_hash_urn, :toUserId)',
    ExpressionAttributeValues: {
      ':orgId': orgId,
      ':toUserId': toUserId,
    },
  });

  const res = await ddbClient.send(params);
  return res.Items as Transaction[];
}

export async function getUserSentTxsInOrg(
  orgId: string,
  fromUserId: string,
  ddbClient: DynamoDBDocumentClient
) {
  const params = new QueryCommand({
    TableName: txnsTable,
    IndexName: 'fromToUserIndex',
    KeyConditionExpression:
      'org_id = :orgId AND begins_with (from_user_to_user_txn_hash_urn, :fromUserId)',
    ExpressionAttributeValues: {
      ':orgId': orgId,
      ':fromUserId': fromUserId,
    },
  });

  const res = await ddbClient.send(params);
  return res.Items as Transaction[];
}

export async function getAllUsersTxsInOrg(
  orgId: string,
  userId: string,
  ddbClient: DynamoDBDocumentClient
) {
  const params = new QueryCommand({
    TableName: txnsTable,
    ExpressionAttributeValues: {
      ':orgId': orgId,
      ':userId': userId,
    },
    KeyConditionExpression: 'org_id = :orgId',
    FilterExpression: 'from_user_id = :userId OR to_user_id = :userId',
  });

  const res = await ddbClient.send(params);
  return res.Items as Transaction[];
}
