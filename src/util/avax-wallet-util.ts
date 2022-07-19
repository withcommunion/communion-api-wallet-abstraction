import { SingletonWallet } from '@avalabs/avalanche-wallet-sdk';
import { ethers, Wallet } from 'ethers';
import { abi as JacksPizzaAbi } from '../contractAbi/jacksPizza/JacksPizzaOrg.json';

// TODO: Deal with prod and dev
export const avaxTestNetworkNodeUrl =
  'https://api.avax-test.network/ext/bc/C/rpc';

export const ethersAvaxProvider = new ethers.providers.JsonRpcProvider(
  avaxTestNetworkNodeUrl
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
  const evmKeyWithoutLeadingHex = hasLeadingHex
    ? evmPrivateKey.split('0x')[1]
    : evmPrivateKey;

  const avaxWallet = SingletonWallet.fromEvmKey(evmKeyWithoutLeadingHex);
  const ethersWallet = new ethers.Wallet(evmKeyWithLeadingHex);

  return { avaxWallet, ethersWallet };
}

export function getEthersWallet(
  privateKeyWithLeadingHex: string
): ethers.Wallet {
  return new ethers.Wallet(privateKeyWithLeadingHex, ethersAvaxProvider);
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
