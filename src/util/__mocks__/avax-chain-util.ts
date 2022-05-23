export const sendAvax = jest
  .fn()
  .mockImplementation(async () => ({
    transaction: {},
    txHash: '0x0123',
    explorerUrl: 'https://testnest.snowtrace.io/asdf',
  }));
