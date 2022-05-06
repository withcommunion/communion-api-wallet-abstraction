import type { APIGatewayProxyHandler } from 'aws-lambda';
import { generateReturn } from '../api-util';
// @ts-expect-error missing lambda-log types
import log from 'lambda-log';
import { ethers } from 'ethers';
import crypto from 'crypto';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    // eslint-disable-next-line
    log.info(crypto.randomBytes(32).toString('hex'));
    const wallet = ethers.Wallet.createRandom();
    // eslint-disable-next-line
    log.info(wallet);
    return generateReturn(200, {
      wallet_key: wallet.privateKey,
    });
  } catch (error) {
    // eslint-disable-next-line
    log.error('Failed to get wallet!', {
      error,
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
    });
  }
};
