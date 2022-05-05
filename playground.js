const {
  MnemonicWallet,
  SingletonWallet,
  setNetwork,
  TestnetConfig,
} = require('@avalabs/avalanche-wallet-sdk');
const Avalanche = require('avalanche').Avalanche;
const { ethers } = require('ethers');

function createMnemonicWallet() {
  const myPhrase =
    'swim grain alcohol mango code extra add quality reform chalk report thank seed olive aunt sunset click fault fresh stairs video cross slim pear';

  const avaxWallet = new MnemonicWallet(myPhrase);
  const privateKey = avaxWallet.getEvmPrivateKeyHex();
  const ethersWallet = new ethers.Wallet(privateKey);
  console.log(avaxWallet.getAddressC());
  console.log(ethersWallet.address);
}

function generatePrivateKey() {
  const ethersWallet = ethers.Wallet.createRandom();
  const ethersWalletPrivateKey = ethersWallet.privateKey.split('0x')[1];
  console.log(ethersWalletPrivateKey);

  return ethersWalletPrivateKey;
}

function createSingletonWallet(evmPrivateKey) {
  const avaxWallet = SingletonWallet.fromEvmKey(evmPrivateKey);
  return avaxWallet;
}

async function getBalance(address) {
  const balance = await HTTPSProvider.getBalance(address);
  return balance;
}

// Function to estimate max fee and max priority fee
const calcFeeData = async (
  maxFeePerGas = undefined,
  maxPriorityFeePerGas = undefined
) => {
  const baseFee = parseInt(await cchain.getBaseFee(), 16) / 1e9;
  maxPriorityFeePerGas =
    maxPriorityFeePerGas == undefined
      ? parseInt(await cchain.getMaxPriorityFeePerGas(), 16) / 1e9
      : maxPriorityFeePerGas;
  maxFeePerGas =
    maxFeePerGas == undefined ? baseFee + maxPriorityFeePerGas : maxFeePerGas;

  if (maxFeePerGas < maxPriorityFeePerGas) {
    throw 'Error: Max fee per gas cannot be less than max priority fee per gas';
  }

  return {
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
  };
};

const sendAvax = async (
  wallet,
  amount,
  to,
  maxFeePerGas = undefined,
  maxPriorityFeePerGas = undefined,
  nonce = undefined
) => {
  if (nonce == undefined) {
    nonce = await HTTPSProvider.getTransactionCount(wallet.address);
  }

  // If the max fee or max priority fee is not provided, then it will automatically calculate using CChain APIs
  ({ maxFeePerGas, maxPriorityFeePerGas } = await calcFeeData(
    maxFeePerGas,
    maxPriorityFeePerGas
  ));

  maxFeePerGas = ethers.utils.parseUnits(maxFeePerGas, 'gwei');
  maxPriorityFeePerGas = ethers.utils.parseUnits(maxPriorityFeePerGas, 'gwei');

  // Type 2 transaction is for EIP1559
  const tx = {
    type: 2,
    nonce,
    to,
    maxPriorityFeePerGas,
    maxFeePerGas,
    value: ethers.utils.parseEther(amount),
    chainId,
  };

  tx.gasLimit = await HTTPSProvider.estimateGas(tx);

  const signedTx = await wallet.signTransaction(tx);
  const txHash = ethers.utils.keccak256(signedTx);

  console.log('Sending signed transaction');

  // Sending a signed transaction and waiting for its inclusion
  await (await HTTPSProvider.sendTransaction(signedTx)).wait();

  console.log(
    `View transaction with nonce ${nonce}: https://testnet.snowtrace.io/tx/${txHash}`
  );
};

const nodeURL = 'https://api.avax-test.network/ext/bc/C/rpc';
const HTTPSProvider = new ethers.providers.JsonRpcProvider(nodeURL);
const chainId = 43113;
const avalanche = new Avalanche(
  'api.avax-test.network',
  undefined,
  'https',
  chainId
);
const cchain = avalanche.CChain();
// Set to Fuji Testnet
setNetwork(TestnetConfig);

const privateKey =
  '342d126ecba77ef9aa5fe9f28c1fb4443f7a5eb22315f7533a6b03a65d8bfd0a';

const avaxWallet = createSingletonWallet(privateKey);
const ethersWallet1 = new ethers.Wallet(`0x${privateKey}`);
console.log(avaxWallet.getAddressC());
console.log(avaxWallet.getAddressX());
console.log(avaxWallet.getAddressP());

getBalance(avaxWallet.getAddressC()).then((res) => {
  console.log(res);
});

const privateKey2 =
  'e15f282c99f069fe67e6f5afc27a737a88dcde1b23d6fb1f3f6d76986159f68a';
const avaxWallet2 = createSingletonWallet(privateKey2);
const ethersWallet2 = new ethers.Wallet(`0x${privateKey2}`);
console.log(avaxWallet2.getAddressC());
console.log(ethersWallet2.address);
sendAvax(ethersWallet1, '0.1', ethersWallet2.address)
  .then((res) => {
    console.log(res);
  })
  .catch((error) => {
    console.log(error);
  });
