import type { APIGatewayProxyHandler } from 'aws-lambda';
import { generateReturn } from '../util/api-util';
import { getWalletPrivateKeyByUserId } from '../util/dynamo-util';
// import { generatePrivateEvmKey } from '../../util/avax-wallet-util';
// import log from 'lambda-log';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const privateKeyWithLeadingHex = await getWalletPrivateKeyByUserId();
    return generateReturn(200, {
      privateKeyWithLeadingHex,
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
