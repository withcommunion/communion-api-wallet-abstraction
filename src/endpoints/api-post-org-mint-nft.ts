import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { NFTStorage, File } from 'nft.storage';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Transaction as EthersTxn } from 'ethers';
import { generateReturn } from '../util/api-util';
import logger, {
  setDefaultLoggerMetaForApi,
} from '../util/winston-logger-util';
import {
  initDynamoClient,
  getUserById,
  getOrgById,
  OrgWithPrivateData,
  CommunionNft,
} from '../util/dynamo-util';

import {
  getEthersWallet,
  getJacksPizzaGovernanceContract,
} from '../util/avax-wallet-util';
import { Blob } from 'buffer';
import { Stream } from 'stream';

const dynamoClient = initDynamoClient();
const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: 'https://communion-nft.s3.amazonaws.com',
});

const nftStorage = new NFTStorage({ token: process.env.NFT_STORAGE_KEY || '' });

interface ExpectedPostBody {
  tokenId: string;
  toUserId: string;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
) => {
  try {
    setDefaultLoggerMetaForApi(event, logger);
    logger.info('incomingEvent', { values: { event } });
    logger.verbose('incomingEventAuth', {
      values: { authorizer: event.requestContext.authorizer },
    });

    const claims = event.requestContext.authorizer.jwt.claims;
    // For some reason it can go through in two seperate ways
    const userId =
      (claims.username as string) || (claims['cognito:username'] as string);

    const orgId = event.pathParameters?.orgId;
    if (!orgId) {
      return generateReturn(400, { message: 'orgId is required' });
    }

    let toUserId = '';
    let tokenId = '';
    try {
      const body = JSON.parse(event.body || '') as ExpectedPostBody;
      if (body.toUserId) {
        toUserId = body.toUserId;
      }
      if (body.tokenId) {
        tokenId = body.tokenId;
      }
    } catch (error) {
      logger.error('Failed to parse body', {
        values: { error, body: event.body },
      });
      return generateReturn(500, { message: 'Failed to parse body' });
    }

    if (!toUserId || !tokenId) {
      return generateReturn(400, {
        message: 'Properties toUserId and tokenId are required in the body',
      });
    }

    logger.info('Fetching org from db', { values: { orgId } });
    const org = await getOrgById(orgId, dynamoClient);
    logger.verbose('Retrieved org from db', { values: { org } });

    if (!org) {
      logger.info('Org not found', { values: { orgId } });
      return generateReturn(404, {
        message: 'org with given id does not exist',
        orgId,
      });
    }

    logger.info('Fetching user from db', { values: { userId } });
    const fromUser = await getUserById(userId, dynamoClient);
    logger.verbose('Retrieved user from db', { values: { fromUser } });
    if (!fromUser) {
      logger.info('From user not found', { values: { orgId } });
      return generateReturn(404, {
        message:
          'Requesting (Authd) user does not exist in User DB, this is weird.  Contact support.',
        fromUserId: userId,
      });
    }

    const isFromUserManager =
      fromUser.organizations.find((org) => org.orgId === orgId)?.role ===
      'manager';

    if (!isFromUserManager) {
      return generateReturn(403, {
        message:
          'Access denied: Only managers can mint NFTs for the organization.',
        isFromUserManager,
      });
    }

    logger.info('Fetching user from db', { values: { userId } });
    const toUser = await getUserById(toUserId, dynamoClient);
    logger.verbose('Retrieved user from db', { values: { toUser } });
    if (!fromUser) {
      logger.info('To user not found', { values: { orgId } });
      return generateReturn(404, {
        message: 'toUser with given id in body does not exist',
        toUserId,
      });
    }

    // * Fetch NFT from availabeNfts in org
    const nftToMint = org.available_nfts?.find((nft) => nft.id === tokenId);
    if (!nftToMint) {
      logger.info('NFT with given tokenId not found', { values: { tokenId } });
      return generateReturn(404, {
        message: 'NFT with given tokenId not found in the org',
        tokenId,
        availableNfts: org.available_nfts,
      });
    }

    const uri = (await uploadToNftStorageHelper(org, nftToMint)).url;
    const mintTxn = await mintNftHelper(org, nftToMint, toUserId, uri);
    // * Mint NFT to user
    // * Store in nft.storage
    // * Store in S3
    // * Store in Org
    // * Store in User

    return generateReturn(200, {
      success: true,
      mintTxn,
      uri,
    });
  } catch (error) {
    console.log(error);
    logger.error('Failed to mint nft', {
      values: { error },
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to mint the nft',
      error: error,
    });
  }
};

async function uploadToNftStorageHelper(
  org: OrgWithPrivateData,
  nftToMint: CommunionNft
) {
  /**
   * AWS V3 SDK sucks.
   * https://github.com/aws/aws-sdk-js-v3/issues/1877
   */
  const streamToBuffer = (stream: Stream): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      // @ts-expect-error it's okay
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      // @ts-expect-error it's okay
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  };

  const fileName = `${nftToMint.id}.jpg`;
  const imageData = await s3Client.send(
    new GetObjectCommand({
      Bucket: 'communion-nft',
      Key: `orgs/${org.id}/${fileName}`,
    })
  );

  const contentType = imageData.ContentType || 'image/jpeg';

  const imageBuffer = await streamToBuffer(imageData.Body as Stream);

  const imageBlob = new Blob([imageBuffer], { type: contentType });

  const uploadToken = await nftStorage.store({
    ...nftToMint.erc721Meta.properties,
    // eslint-disable-next-line
    image: new File([imageBlob], fileName, {
      type: contentType,
    }),
  });

  return uploadToken;
}

async function mintNftHelper(
  org: OrgWithPrivateData,
  nftToMint: CommunionNft,
  toUserWalletAddressC: string,
  uri: string
) {
  logger.info('Minting NFT', {
    values: {
      org,
      nftToMint,
      toUserWalletAddressC,
    },
  });
  const governanceContract = getOrgGovernanceContractHelper(org);

  // eslint-disable-next-line
  const transaction = // eslint-disable-next-line
    (await governanceContract.mintErc721(
      toUserWalletAddressC,
      uri
    )) as EthersTxn;

  return transaction;
}

function getOrgGovernanceContractHelper(org: OrgWithPrivateData) {
  try {
    const governanceContractAddress = org?.avax_contract?.address; // contract address with multisend fn: 0xbA3FF6a903869A9fb40d5cEE8EdF44AdD0932f8e
    if (!governanceContractAddress) {
      logger.error(
        'Failed to get governance contract address from org - it should have one',
        {
          values: { org },
        }
      );
      throw new Error('No governance contract address found');
    }

    const orgDevWallet = getEthersWallet(org.seeder.privateKeyWithLeadingHex);
    const governanceContract = getJacksPizzaGovernanceContract(
      governanceContractAddress,
      orgDevWallet
    );

    return governanceContract;
  } catch (error) {
    logger.error('Error fetching org governance contract', {
      values: { org, error },
    });
    throw error;
  }
}
