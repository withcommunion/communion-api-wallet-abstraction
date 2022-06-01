/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
jest.mock('../util/avax-chain-util.ts');
import type { DynamoDBStreamEvent } from 'aws-lambda';

import { getUserById } from '../util/dynamo-util';
import { sendAvax } from '../util/avax-chain-util';
// import {} from '../util/avax-wallet-util';

import {
  handler,
  SEED_ACCOUNT_ID,
  BASE_AMOUNT_TO_SEED_USER,
} from './new-image-seed-user';

const MOCK_USER_ADDRESS_C = '0xAae44dc10B9bB68205A158224D2207F8900ec841';
const MOCK_EVENT: DynamoDBStreamEvent = {
  Records: [
    {
      awsRegion: 'us-east-1',
      dynamodb: {
        ApproximateCreationDateTime: 1654016868,
        Keys: {
          id: {
            S: 'local-cbdc4ec7-2a9e-4b3f-ae21-1b54813308d6',
          },
        },
        NewImage: {
          email: {
            S: 'bican63463@runchet.com',
          },
          first_name: {
            S: 'Joseph',
          },
          id: {
            S: 'dupe-cbdc4ec7-2a9e-4b3f-ae21-1b54813308d6',
          },
          last_name: {
            S: 'Campbell',
          },
          organization: {
            S: 'org-jacks-pizza-1',
          },
          role: {
            S: 'worker',
          },
          wallet: {
            M: {
              addressC: {
                S: MOCK_USER_ADDRESS_C,
              },
              addressP: {
                S: 'P-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
              },
              addressX: {
                S: 'X-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
              },
              // Junk key, it's okay to be commited and public
              privateKeyWithLeadingHex: {
                S: '0x7d29827ad7f90ab4992ec980f006032b0cfebd466b50a9be30fe44de565bd83e',
              },
            },
          },
        },
        SequenceNumber: '21584000000000007748657723',
        SizeBytes: 444,
        StreamViewType: 'NEW_IMAGE',
      },
      eventID: 'db8fb8a895766479712617afbb022156',
      eventName: 'INSERT',
      eventSource: 'aws:dynamodb',
      eventSourceARN:
        'arn:aws:dynamodb:us-east-1:143056416942:table/usersTable-dev/stream/2022-05-30T19:37:37.597',
      eventVersion: '1.1',
    },
    {
      dynamodb: {
        ApproximateCreationDateTime: 1654016868,
        Keys: {
          id: {
            S: 'remove-cbdc4ec7-2a9e-4b3f-ae21-1b54813308d6',
          },
        },
      },
      eventID: 'db8fb8a895766479712617afbb022156',
      eventName: 'REMOVE',
    },
    {
      dynamodb: {
        ApproximateCreationDateTime: 1654016868,
        Keys: {
          id: {
            S: 'modify-cbdc4ec7-2a9e-4b3f-ae21-1b54813308d6',
          },
        },
      },
      eventID: 'db8fb8a895766479712617afbb022156',
      eventName: 'MODIFY',
    },
  ],
};

describe('new-image-seed-user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Happy path', () => {
    it('Should fetch the seedAccount by calling "getUserById"', async () => {
      await handler(MOCK_EVENT);
      expect(getUserById).toHaveBeenCalledWith(
        expect.any(Object),
        SEED_ACCOUNT_ID
      );
    });

    it('Should call sendAvax for users with an "INSERT" event name', async () => {
      await handler(MOCK_EVENT);

      /**
       * In our case, there is only 1 insert event
       */
      expect(sendAvax).toHaveBeenCalledTimes(1);
      expect(sendAvax).toBeCalledWith(
        expect.any(Object),
        BASE_AMOUNT_TO_SEED_USER,
        MOCK_USER_ADDRESS_C,
        true
      );
    });
    it('Should not call sendAvax if there are no users with "INSERT" event name', async () => {
      const mockEventWithNoInsertEvents = {
        ...MOCK_EVENT,
        Records: [MOCK_EVENT.Records[1], MOCK_EVENT.Records[2]],
      };
      await handler(mockEventWithNoInsertEvents);
      expect(sendAvax).toHaveBeenCalledTimes(0);
    });
  });
});
