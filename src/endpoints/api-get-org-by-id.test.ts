jest.mock('../util/dynamo-util.ts');
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import { handler } from './api-get-org-by-id';
import {
  MOCK_ORG,
  //   MOCK_USER_A,
  MOCK_USER_SELF,
} from '../util/__mocks__/dynamo-util';
import * as dynamoUtil from '../util/dynamo-util';
import { User, getOrgById, batchGetUsersById } from '../util/dynamo-util';

const MOCK_EVENT = generateApiGatewayEvent({ userId: MOCK_USER_SELF.id });

describe('getOrgById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    it('Should return the correct org', async () => {
      const resp = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const org = JSON.parse(resp.body);
      const expectedOrg = MOCK_ORG;
      // @ts-expect-error This is ok
      delete expectedOrg.seeder;

      expect(getOrgById).toHaveBeenCalledWith('jacks-pizza-1', {});
      expect(org).toEqual(expect.objectContaining(MOCK_ORG));
    });

    it('Should call getOrgById with the org in the path param', async () => {
      await handler(MOCK_EVENT);
      expect(getOrgById).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
    });

    it('Should call batchGetUsersById with all users returned from the org', async () => {
      await handler(MOCK_EVENT);
      expect(batchGetUsersById).toHaveBeenCalledWith(MOCK_ORG.member_ids, {});
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

  describe('Unhappy path', () => {
    it('Should return a 403 status code if the user is not a member of the org', async () => {
      const getOrgByIdSpy = jest.spyOn(dynamoUtil, 'getOrgById');
      // @ts-expect-error This is ok
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
