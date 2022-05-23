export const awsSdkPromiseResponse = jest
  .fn()
  .mockReturnValue(Promise.resolve(true));

export const insertUser = jest
  .fn()
  .mockImplementation(async () => ({ SomeValue: 'This just happened' }));

export const getUserById = jest.fn().mockImplementation(async () => ({
  wallet: {
    privateKeyWithLeadingHex:
      // This key is a burner - it's okay to be committed
      '0xa3a06515345e15ef210c71533d2b17bbae01c02397fc4d57fd0d9203082f82cb',
  },
}));

export const initDynamoClient = jest.fn().mockImplementation(() => {
  return {};
});
