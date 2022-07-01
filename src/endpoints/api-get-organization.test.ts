jest.mock('../util/dynamo-util.ts');
import { handler } from './api-get-organization';
import { generateApiGatewayEvent } from '../util/jest-mock-util';
import {
  MOCK_USER_SELF,
  MOCK_USER_SEEDER,
} from '../util/__mocks__/dynamo-util';
import { getUserById, getUsersInOrganization, User } from '../util/dynamo-util';

const MOCK_EVENT = generateApiGatewayEvent({
  userId: MOCK_USER_SELF.id,
  orgId: MOCK_USER_SELF.organization,
});

describe('getWalletByUserId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy path', () => {
    it('Should return a 200 status code', async () => {
      const resp = await handler(MOCK_EVENT);
      expect(resp.statusCode).toBe(200);
    });

    it('Should call getUserById with the requester id', async () => {
      await handler(MOCK_EVENT);
      expect(getUserById).toHaveBeenCalledWith(`${MOCK_USER_SELF.id}`, {});
    });
    it('Should call getOrganization with the organization that was passed in', async () => {
      await handler(MOCK_EVENT);
      expect(getUsersInOrganization).toHaveBeenCalledWith(
        MOCK_EVENT.pathParameters?.orgId,
        {}
      );
    });

    it('Should not include the requesting user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).users as User[];

      expect(usersInBody).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SELF.id }),
        ])
      );
    });

    it('Should not include the requesting user in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).users as User[];

      expect(usersInBody).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SELF.id }),
        ])
      );
    });
    it('Should not include users with role of seeder in the response', async () => {
      const res = await handler(MOCK_EVENT);
      // eslint-disable-next-line
      const usersInBody = JSON.parse(res.body).users as User[];

      expect(usersInBody).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ id: MOCK_USER_SEEDER.id }),
        ])
      );
    });
  });

  describe('Unhappy path', () => {
    describe('If the user is not in the org that is being requested', () => {
      it('Should return a 403 status code', async () => {
        const res = await handler({
          ...MOCK_EVENT,
          pathParameters: { orgId: 'not-test-org' },
        });

        expect(res.statusCode).toBe(403);
      });
    });
  });
});
