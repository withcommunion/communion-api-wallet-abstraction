import type { APIGatewayProxyHandler } from 'aws-lambda';
import { generateReturn } from '../api-util';
import { ethers } from 'ethers';
// import log from 'lambda-log';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    let wallet;

    try {
      wallet = ethers.Wallet.createRandom();
    } catch (error) {
      console.log(error);
    }

    return generateReturn(200, {
      wallet_key: wallet?.privateKey,
    });
  } catch (error) {
    console.error('Failed to get wallet', {
      error,
    });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
      error: error,
    });
  }
};
