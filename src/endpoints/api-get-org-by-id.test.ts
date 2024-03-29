jest.mock('../util/dynamo-util.ts');
import {
  generateApiGatewayEvent,
  generateMockUser,
  generateMockOrg,
} from '../util/jest-mock-util';
import { handler } from './api-get-org-by-id';
import * as dynamoUtil from '../util/dynamo-util';
import { User } from '../util/dynamo-util';

const MOCK_USER_SELF = generateMockUser({ id: 'self' });
const MOCK_ORG = generateMockOrg({
  id: 'someOrg',
  member_ids: [MOCK_USER_SELF.id],
});
const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_SELF.id,
  orgId: MOCK_ORG.id,
});

const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
getOrgByIdSpy.mockImplementation(() => Promise.resolve(MOCK_ORG));

const getUserByIdSpy = jest.spyOn(dynamoUtil, 'getUserById');
getUserByIdSpy.mockImplementation(() => Promise.resolve(MOCK_USER_SELF));

const batchGetUsersByIdSpy = jest.spyOn(dynamoUtil, 'batchGetUsersById');
batchGetUsersByIdSpy.mockImplementation(() =>
  Promise.resolve([MOCK_USER_SELF])
);
describe('getOrgById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe.skip('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    it('Should return the correct org', async () => {
      const resp = await handler(MOCK_EVENT);
      const expectedOrg = MOCK_ORG;
      // @ts-expect-error this is ok
      delete expectedOrg.join_code;
      // @ts-expect-error this is ok
      delete expectedOrg.seeder;

      // eslint-disable-next-line
      const org = JSON.parse(resp.body);
      expect(getOrgByIdSpy).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
      expect(org).toEqual(expect.objectContaining({ ...MOCK_ORG }));
    });

    it('Should call getOrgById with the org in the path param', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgByIdSpy).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
    });

    it('Should call batchGetUsersById with all users returned from the org', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersByIdSpy).toHaveBeenCalledWith(
        MOCK_ORG.member_ids,
        {}
      );
    });

    it('Should not include the requesting user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).members as User[];

      expect(usersInBody).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SELF.id }),
        ])
      );
    });
  });
  describe('When the user is a manager', () => {
    it('Should include the join_code in the response', async () => {
      getUserByIdSpy.mockImplementationOnce(() =>
        Promise.resolve({
          ...MOCK_USER_SELF,
          organizations: [{ orgId: MOCK_ORG.id, role: 'manager' }],
        })
      );
      const resp = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const body = JSON.parse(resp.body);
      // eslint-disable-next-line
      expect(body.join_code).toBe(MOCK_ORG.join_code);
    });
  });

  describe.skip('Unhappy path', () => {
    it('Should return a 403 status code if the user is not a member of the org', async () => {
      const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
      getOrgByIdSpy.mockImplementationOnce(async () => ({
        ...MOCK_ORG,
        member_ids: ['not-a-member'],
      }));
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(403);
    });
    it('Should return a 404 status code if org doesnt exist in the DB', async () => {
      const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
      getOrgByIdSpy.mockImplementationOnce(async () => null);
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(404);
    });
  });
});
