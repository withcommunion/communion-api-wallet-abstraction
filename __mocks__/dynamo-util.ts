export const awsSdkPromiseResponse = jest
  .fn()
  .mockReturnValue(Promise.resolve(true));

export const insertUser = jest
  .fn()
  .mockImplementation(() => ({ promise: awsSdkPromiseResponse }));
