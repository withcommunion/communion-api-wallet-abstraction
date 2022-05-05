import { SingletonWallet } from '@avalabs/avalanche-wallet-sdk';
import { ethers } from 'ethers';

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
