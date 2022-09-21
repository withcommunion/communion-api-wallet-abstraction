jest.mock('../util/dynamo-util.ts');
// import { handler } from './api-post-join-org-by-id';
// import * as dynamoUtil from '../util/dynamo-util';
// import * as avaxWalletUtil from '../util/avax-wallet-util';
// import { generateApiGatewayEvent } from '../util/jest-mock-util';
// import { MOCK_USER_SELF, MOCK_ORG } from '../util/__mocks__/dynamo-util';

/**
const MOCK_USER_NOT_IN_ORG = {
  ...MOCK_USER_SELF,
  organizations: [],
};

const MOCK_BODY_PARAMS = JSON.stringify({
  joinCode: 'asdf',
});
const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_NOT_IN_ORG.id,
  orgId: MOCK_ORG.id,
  body: MOCK_BODY_PARAMS,
});

const getEthersWalletSpy = jest.spyOn(avaxWalletUtil, 'getEthersWallet');
// @ts-expect-error it's okay
getEthersWalletSpy.mockImplementation(() => {
  return {};
});
const getJacksPizzaGovernanceContractSpy = jest.spyOn(
  avaxWalletUtil,
  'getJacksPizzaGovernanceContract'
);

// eslint-disable-next-line
const MOCK_HASH = '0x12345325252';
const addEmployeeSpy = jest.fn(() => ({ hash: MOCK_HASH }));
// @ts-expect-error it's okay
getJacksPizzaGovernanceContractSpy.mockImplementation(() => {
  return {
    addEmployee: addEmployeeSpy,
  };
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
getUserByIdSpy.mockImplementation(() => Promise.resolve(MOCK_USER_NOT_IN_ORG));

const addUserToOrgSpy = jest.spyOn(dynamoUtil, 'addUserToOrg');
const addOrgToUserSpy = jest.spyOn(dynamoUtil, 'addOrgToUser');
 */

/**
 * TODO: Fill this in, this endpoint is critical
 */
describe.skip('api-post-org-mint-nft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  // eslint-disable-next-line
  describe('Happy path', () => {});

  // eslint-disable-next-line
  describe('Unhappy path', () => {});
});
