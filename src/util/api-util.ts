export interface returnObject {
  statusCode: number;
  body: string;
  headers: {
    'Access-Control-Allow-Origin': '*';
    'Access-Control-Allow-Credentials': boolean;
  };
}

export function generateReturn(
  statusCode: number,
  body: Record<string, unknown>
): returnObject {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
  };
}
