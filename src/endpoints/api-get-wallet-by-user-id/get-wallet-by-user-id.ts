import type { APIGatewayProxyHandler } from 'aws-lambda';
import { generateReturn } from '../api-util';
// import log from 'lambda-log';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    return generateReturn(200, {
      wallet_key: 'asdf1234',
    });
  } catch (error) {
    // log.error('Failed to get wallet', {
    //   error,
    // });
    return generateReturn(500, {
      message: 'Something went wrong trying to get the wallet',
    });
  }
};
