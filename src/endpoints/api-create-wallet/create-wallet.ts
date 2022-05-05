import type { APIGatewayProxyHandler } from 'aws-lambda';

import { generateReturn } from '../..//util/api-util';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    return generateReturn(200, {
      wallet_key: 'asdf123',
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
