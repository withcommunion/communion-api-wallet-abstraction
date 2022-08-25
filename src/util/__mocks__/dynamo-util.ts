export const MOCK_ORG_ID = 'jacks-pizza-1';
export const MOCK_SELF_ID = 'local-mock-user-self';
export const MOCK_USER_A_ID = 'local-invoke-mock-user-a';

export const MOCK_ORG = {
  id: MOCK_ORG_ID,
  actions: [
    {
      allowed_roles: ['worker', 'manager', 'owner'],
      amount: '0.05',
      name: 'Kindness',
    },
  ],
  redeemables: [
    {
      allowed_roles: ['worker', 'manager', 'owner'],
      amount: '10',
      name: 'Slice of Pizza',
    },
    {
      allowed_roles: ['worker', 'manager', 'owner'],
      amount: '150',
      name: '1 Day PTO',
    },
  ],
  join_code: '',
  member_ids: [MOCK_SELF_ID, MOCK_USER_A_ID],
  roles: ['worker', 'manager', 'owner', 'seeder'],
  seeder: {
    privateKeyWithLeadingHex: '0xf9c...294c',
    walletAddressC: '0xfE96DA...965f',
  },
  avax_contract: {
    address: '0x0000000000000000000000000000000000000000',
    token_address: '0x0000000000000000000000000000000000000000',
    token_name: 'Jacks Pizza Employee Token',
    token_symbol: 'JPET',
  },
};

export const MOCK_USER_SELF = {
  id: MOCK_SELF_ID,
  organization: 'test-org',
  organizations: [{ orgId: MOCK_ORG.id }],
  role: 'worker',
  last_name: 'invoke-self',
  first_name: 'local-self',
  walletAddressC: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
  walletAddressP: 'P-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-self@gmail.com',
  phone_number: '987654321',
  allow_sms: true,
};

export const MOCK_USER_A = {
  id: MOCK_USER_A_ID,
  organization: 'test-org',
  organizations: [{ orgId: MOCK_ORG.id }],
  role: 'worker',
  last_name: 'invoke-a',
  first_name: 'local-a',
  walletAddressC: '0x0000d388A796457DBcd8Bcca957E58cCC31al0bd',
  walletAddressP: 'P-avax0000qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax0000qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0x00006515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-user-a@gmail.com',
  phone_number: '123456789',
  allow_sms: true,
};

export const MOCK_USER_SEEDER = {
  id: 'local-invoke-mock-user-seeder',
  organization: 'test-org',
  role: 'seeder',
  last_name: 'invoke-seeder',
  first_name: 'local-seeder',
  walletAddressC: '0x1111d388A796457DBcd8Bcca957E58cCC31aF0bd',
  walletAddressP: 'P-avax11111qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax11111qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0x11106515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-user-seeder@gmail.com',
};

export const MOCK_TRANSACTION = {
  org_id: 'communion-test-org',
  to_user_id_txn_hash_urn:
    '18d9c3c8-0b5a-4115-b481-c9d55ca1df2d:0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
  amount: 7,
  created_at: 1661454745,
  from_user_id: '6281d918-df36-48bf-b8a4-3ee1f2b8305e',
  from_user_to_user_txn_hash_urn:
    '6281d918-df36-48bf-b8a4-3ee1f2b8305e:18d9c3c8-0b5a-4115-b481-c9d55ca1df2d:0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
  to_user_id: '18d9c3c8-0b5a-4115-b481-c9d55ca1df2d',
  tx_hash: '0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
};

export const awsSdkPromiseResponse = jest
  .fn()
  .mockReturnValue(Promise.resolve(true));

export const initDynamoClient = jest.fn().mockImplementation(() => {
  return {};
});

export const insertUser = jest
  .fn()
  .mockImplementation(async () => ({ SomeValue: 'This just happened' }));

export const getUserById = jest
  .fn()
  .mockImplementation(async () => MOCK_USER_SELF);

export const getUsersInOrganization = jest
  .fn()
  .mockImplementation(async () => [
    MOCK_USER_SELF,
    MOCK_USER_A,
    MOCK_USER_SEEDER,
  ]);

export const batchGetUsersById = jest.fn(async () => [
  MOCK_USER_SELF,
  MOCK_USER_A,
]);

export const MOCK_TX_A = {
  org_id: 'communion-test-org',
  to_user_id_txn_hash_urn:
    '18d9c3c8-0b5a-4115-b481-c9d55ca1df2d:0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
  amount: 7,
  created_at: 1661454745,
  from_user_id: MOCK_SELF_ID,
  from_user_to_user_txn_hash_urn:
    '6281d918-df36-48bf-b8a4-3ee1f2b8305e:18d9c3c8-0b5a-4115-b481-c9d55ca1df2d:0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
  to_user_id: MOCK_SELF_ID,
  tx_hash: '0x037972475373ff609701eb07232d51dd661b0c42914e4c371b0d7156fecb5873',
};

export const MOCK_TX_B = {
  org_id: 'communion-test-org',
  to_user_id_txn_hash_urn:
    '6281d918-df36-48bf-b8a4-3ee1f2b8305e:0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
  amount: 2,
  created_at: 1661457691,
  from_user_id: MOCK_SELF_ID,
  from_user_to_user_txn_hash_urn:
    '563ca6ea-53e0-42d9-932d-cf284fa2583f:6281d918-df36-48bf-b8a4-3ee1f2b8305e:0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
  to_user_id: MOCK_SELF_ID,
  tx_hash: '0x54600226bc20315802c4e179d82c53f2542dd2ec0a57b194bb7811bd6ee10fc6',
};

export const batchGetOrgsById = jest.fn(async () => [MOCK_ORG]);

export const getOrgById = jest.fn(async () => MOCK_ORG);
export const addUserToOrg = jest.fn(async () => MOCK_USER_SELF);
export const addOrgToUser = jest.fn(async () => MOCK_ORG);
export const insertTransaction = jest.fn(async () => MOCK_TRANSACTION);
export const getUserSentTxsInOrg = jest.fn(async () => [MOCK_TX_A]);
export const getUserReceivedTxsInOrg = jest.fn(async () => [MOCK_TX_B]);
