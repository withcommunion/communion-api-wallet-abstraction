/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../util/dynamo-util.ts');
jest.mock('../util/avax-chain-util.ts');
import { ethers } from 'ethers';
import type { DynamoDBStreamEvent } from 'aws-lambda';

import * as seedUtil from '../util/seed-util';

import { handler, checkIfUserHasFunds } from './new-image-seed-user';

const MOCK_USER_ADDRESS_C = '0xAae44dc10B9bB68205A158224D2207F8900ec841';
const MOCK_USER_ADDRESS_C_WITH_NO_FUNDS = ethers.Wallet.createRandom().address;
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
            S: 'jacks-pizza-pittsfield',
          },
          role: {
            S: 'worker',
          },
          walletAddressC: {
            S: MOCK_USER_ADDRESS_C_WITH_NO_FUNDS,
          },
          walletAddressP: {
            S: 'P-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
          },
          walletAddressX: {
            S: 'X-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
          },
          // Junk key, it's okay to be commited and public
          walletPrivateKeyWithLeadingHex: {
            S: '0x7d29827ad7f90ab4992ec980f006032b0cfebd466b50a9be30fe44de565bd83e',
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
            S: 'jacks-pizza-pittsfield',
          },
          role: {
            S: 'worker',
          },
          walletAddressC: {
            S: MOCK_USER_ADDRESS_C,
          },
          walletAddressP: {
            S: 'P-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
          },
          walletAddressX: {
            S: 'X-avax1wz5n43yfa4u308yz9ga8f3xmeflvaegg2fzkxe',
          },
          // Junk key, it's okay to be commited and public
          walletPrivateKeyWithLeadingHex: {
            S: '0x7d29827ad7f90ab4992ec980f006032b0cfebd466b50a9be30fe44de565bd83e',
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

/**
 * TODO: Need to mock timers - these tests are timing dependent and take too long
 * TODO: Need to mock the ethers library getBalance function as it's making a real network call
 */
describe.skip('new-image-seed-user', () => {
  const seedFundsForUserSpy = jest.spyOn(seedUtil, 'seedFundsForUser');
  seedFundsForUserSpy.mockImplementation(() =>
    Promise.resolve({
      transaction: {} as ethers.providers.TransactionResponse,
      txHash: '0x123',
      explorerUrl: 'https://etherscan.io/tx/0x123',
    })
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe('handler', () => {
    describe('Happy path', () => {
      it('Should call sendAvax for users with an "INSERT" event name and no funds on the account', async () => {
        await handler(MOCK_EVENT);

        /**
         * In our case, there is only 1 insert event
         */
        expect(seedFundsForUserSpy).toHaveBeenCalledTimes(1);
        expect(seedFundsForUserSpy).toHaveBeenCalledWith(
          MOCK_USER_ADDRESS_C_WITH_NO_FUNDS,
          expect.any(Object),
          true
        );
      }, 10000);
      it('Should not call sendAvax if there are no users with "INSERT" event name', async () => {
        const mockEventWithNoInsertEvents = {
          ...MOCK_EVENT,
          Records: [MOCK_EVENT.Records[1], MOCK_EVENT.Records[2]],
        };
        await handler(mockEventWithNoInsertEvents);
        expect(seedFundsForUserSpy).toHaveBeenCalledTimes(0);
      }, 10000);
    });
  });

  describe('checkIfUserHasFunds', () => {
    const freshWallet = ethers.Wallet.createRandom();

    it('Should return false on a wallet with no funds', async () => {
      expect(await checkIfUserHasFunds(freshWallet.address)).toBe(false);
    }, 10000);

    it('Should return true when a user has funds', async () => {
      /**
       * If this starts failing, it's likely the faucet address has changed
       * https://faucet.avax.network/
       * Send funds to a wallet, view txn on Snowtrace, get address of faucet
       */
      const avaxTestNetFaucetAddress =
        '0x2352d20fc81225c8ecd8f6faa1b37f24fed450c9';

      expect(await checkIfUserHasFunds(avaxTestNetFaucetAddress)).toBe(true);
    });
  });
});
