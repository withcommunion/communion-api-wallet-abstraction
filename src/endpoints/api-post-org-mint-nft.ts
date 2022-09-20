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
  getCommunionTestGovernanceContractWitNft,
} from '../util/avax-wallet-util';
import { Blob } from 'buffer';
import { Stream } from 'stream';

const dynamoClient = initDynamoClient();
const s3Client = new S3Client({
  region: 'us-east-1',
});

const nftStorage = new NFTStorage({
  token: process.env.NFT_STORAGE_API_KEY || '',
});

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
    if (!toUser) {
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

    // const uri = (await uploadToNftStorageHelper(org, nftToMint)).url;
    const uri = `https://communion-nft.s3.amazonaws.com/orgs/${org.id}/${nftToMint.id}.json`;
    const mintTxn = await mintNftHelper(
      org,
      nftToMint,
      toUser.walletAddressC,
      uri
    );
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

/**
 * TODO: Get this to work.
 * Fuck this whole thing.
 * Works locally, but not in lambda.
 * WAY too many hours spent on this.
 * Using S3 for now.
 */
// @ts-expect-error whatever
// eslint-disable-next-line
async function uploadToNftStorageHelper(
  org: OrgWithPrivateData,
  nftToMint: CommunionNft
) {
  logger.info('Uploading to nft.storage', {
    values: { nftToMint, orgId: org.id },
  });

  try {
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

    const imageData = await s3Client.send(
      new GetObjectCommand({
        Bucket: 'communion-nft',
        Key: `orgs/${org.id}/${nftToMint.id}`,
      })
    );

    // const contentType = imageData.ContentType || 'image/jpeg';

    const imageBuffer = await streamToBuffer(imageData.Body as Stream);

    const imageBlob = new Blob([imageBuffer], { type: imageData.ContentType });

    const uploadToken = await nftStorage.store({
      ...nftToMint.erc721Meta.properties,
      // eslint-disable-next-line
      image: new File([imageBlob], nftToMint.id + Math.random(), {
        type: imageData.ContentType,
      }),
    });
    logger.info('Uploaded to nft.storage', { values: { uploadToken } });

    return uploadToken;
  } catch (error) {
    logger.error('Failed to upload to nft.storage', {
      values: { error, nftToMint, orgId: org.id },
    });
    throw error;
  }
}

async function mintNftHelper(
  org: OrgWithPrivateData,
  nftToMint: CommunionNft,
  toUserWalletAddressC: string,
  uri: string
) {
  logger.info('Minting NFT', {
    values: {
      nftToMint,
      orgId: org.id,
      toUserWalletAddressC,
    },
  });
  const governanceContract = getOrgGovernanceContractHelper(org);

  try {
    const transaction = // eslint-disable-next-line
      (await governanceContract.mintErc721(
        toUserWalletAddressC,
        uri
      )) as EthersTxn;

    logger.verbose('Minted NFT', {
      values: { transaction, hash: transaction.hash },
    });

    return transaction;
  } catch (error) {
    logger.error('Failed to mint NFT', {
      values: {
        error,
        nftToMint,
        orgId: org.id,
        toUserWalletAddressC,
      },
    });
    throw error;
  }
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
    const governanceContract = getCommunionTestGovernanceContractWitNft(
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
