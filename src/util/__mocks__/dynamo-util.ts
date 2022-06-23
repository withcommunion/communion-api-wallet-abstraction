export const MOCK_USER_SELF = {
  id: 'local-mock-user-self',
  organization: 'test-org',
  role: 'worker',
  last_name: 'invoke-self',
  first_name: 'local-self',
  walletAddressC: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
  walletAddressP: 'P-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-self@gmail.com',
};

export const MOCK_USER_A = {
  id: 'local-invoke-mock-user-a',
  organization: 'test-org',
  role: 'worker',
  last_name: 'invoke-a',
  first_name: 'local-a',
  walletAddressC: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
  walletAddressP: 'P-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-user-a@gmail.com',
};

export const MOCK_USER_SEEDER = {
  id: 'local-invoke-mock-user-seeder',
  organization: 'test-org',
  role: 'seeder',
  last_name: 'invoke-seeder',
  first_name: 'local-seeder',
  walletAddressC: '0x4286d388A796457DBcd8Bcca957E58cCC31aF0bd',
  walletAddressP: 'P-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletAddressX: 'X-avax1l29qtzhasa8k7epcnpqxxatkxv67vwzn5ln0rd',
  walletPrivateKeyWithLeadingHex:
    '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  email: 'local-invoke-user-seeder@gmail.com',
};

export const MOCK_ORG = {
  id: 'jacks-pizza-1',
  actions: [
    {
      allowed_roles: ['worker', 'manager', 'owner'],
      amount: '0.05',
      name: 'Kindness',
    },
  ],
  member_ids: [MOCK_USER_SELF.id, MOCK_USER_A.id],
  roles: ['worker', 'manager', 'owner', 'seeder'],
  seeder: {
    privateKeyWithLeadingHex: '0xf9c...294c',
    walletAddressC: '0xfE96DA...965f',
  },
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

export const getOrgById = jest.fn(async () => MOCK_ORG);
