import { ethers, Wallet } from 'ethers';
// TODO: We'll likely want to store these in Dynamo or S3 or similar
import { abi as JacksPizzaAbi } from '../contractAbi/jacksPizza/JacksPizzaOrg.json';

import { isProd } from '../util/env-util';
export const prodAvaxRpcUrl = 'https://api.avax.network/ext/bc/C/rpc';
export const fujiTestAvaxRpcUrl = 'https://api.avax-test.network/ext/bc/C/rpc';

export const HTTPSAvaxProvider = new ethers.providers.JsonRpcProvider(
  isProd ? prodAvaxRpcUrl : fujiTestAvaxRpcUrl
);

export function generatePrivateEvmKey(): {
  evmKeyWithLeadingHex: string;
  evmKeyWithoutLeadingHex: string;
} {
  const ethersWallet = ethers.Wallet.createRandom();
  const ethersWalletPrivateKey = ethersWallet.privateKey;

  return {
    evmKeyWithLeadingHex: ethersWalletPrivateKey,
    evmKeyWithoutLeadingHex: ethersWallet.privateKey.split('0x')[1],
  };
}

export function createSingletonWallet(
  evmPrivateKey: string,
  hasLeadingHex = true
) {
  const evmKeyWithLeadingHex = hasLeadingHex
    ? evmPrivateKey
    : `0x${evmPrivateKey}`;

  const ethersWallet = new ethers.Wallet(evmKeyWithLeadingHex);

  return { ethersWallet };
}

export function getEthersWallet(
  privateKeyWithLeadingHex: string
): ethers.Wallet {
  return new ethers.Wallet(privateKeyWithLeadingHex, HTTPSAvaxProvider);
}

export function getJacksPizzaGovernanceContract(
  contractAddress: string,
  signerWallet: Wallet
) {
  const contract = new ethers.Contract(
    contractAddress,
    JacksPizzaAbi,
    signerWallet
  );

  return contract;
}
