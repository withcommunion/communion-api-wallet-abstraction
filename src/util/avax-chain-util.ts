import Avalanche from 'avalanche';
import { ethers } from 'ethers';
import axios from 'axios';

import { isProd } from '../util/env-util';
import logger from '../util/winston-logger-util';

export const prodAvaxUrl = 'api.avalanche.network';
export const fujiTestAvaxUrl = 'api.avax-test.network';
export const prodAvaxRpcUrl = 'https://api.avax.network/ext/bc/C/rpc';
export const fujiTestAvaxRpcUrl = 'https://api.avax-test.network/ext/bc/C/rpc';

export const HTTPSProvider = new ethers.providers.JsonRpcProvider(
  isProd ? prodAvaxRpcUrl : fujiTestAvaxRpcUrl
);

const chainId = 43113;
const avalanche = new Avalanche(
  isProd ? prodAvaxUrl : fujiTestAvaxUrl,
  undefined,
  'https',
  chainId
);
const cchain = avalanche.CChain();

/**
 * Base code taken from https://docs.avax.network/quickstart/sending-transactions-with-dynamic-fees-using-javascript/#function-for-estimating-max-fee-and-max-priority-fee
 * Info on maxFeePerGas and maxPriorityFeePerGas: https://docs.alchemy.com/alchemy/guides/eip-1559/maxpriorityfeepergas-vs-maxfeepergas
 *
 * Terms:
 * baseFee: set by network to perform transaction.  Gets burned and does not go to miner.
 * maxPriorityFeePerGas: This is the "tip" that goes to the miner.
 *  The higher the tip, the more likely the transaction will be included in a block.
 * maxFeePerGas: This is the total amount of gas used in the transaction.  Tip + Bare minimum set by network
 * Gwei and nAvax are the same thing
 */
export const calcFeeData = async () => {
  const baseFee = parseInt(await cchain.getBaseFee(), 16) / 1e9;
  const maxPriorityFeePerGas =
    parseInt(await cchain.getMaxPriorityFeePerGas(), 16) / 1e9;

  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  if (maxFeePerGas < maxPriorityFeePerGas) {
    throw new Error(
      'Max fee per gas cannot be less than max priority fee per gas'
    );
  }

  const maxFees = {
    maxFeePerGasGwei: maxFeePerGas.toString(),
    maxPriorityFeePerGasGwei: maxPriorityFeePerGas.toString(),
  };

  return maxFees;
};

export const sendAvax = async (
  fromWallet: ethers.Wallet,
  amount: string,
  toAddress: string,
  waitForTxnToFinish = false
) => {
  const MAX_GAS_WILLING_TO_SPEND_GWEI = '45';
  const chainId = 43113;
  const fromAddress = fromWallet.address;

  const nonce = await HTTPSProvider.getTransactionCount(fromAddress);

  const { maxFeePerGasGwei, maxPriorityFeePerGasGwei } = await calcFeeData();

  if (maxFeePerGasGwei > MAX_GAS_WILLING_TO_SPEND_GWEI) {
    logger.error(`Spending more than MAX_GWEI_GAS_WILLING_TO_SPEND`, {
      MAX_GAS_WILLING_TO_SPEND_GWEI,
      maxFeePerGasGwei,
    });
    throw new Error(`Spending more than MAX_GWEI_GAS_WILLING_TO_SPEND`);
  }

  const maxFeePerGasInAvax = ethers.utils.parseUnits(maxFeePerGasGwei, 'gwei');
  const maxPriorityFeePerGasInAvax = ethers.utils.parseUnits(
    maxPriorityFeePerGasGwei,
    'gwei'
  );

  const baseTx: ethers.providers.TransactionRequest = {
    // Type 2 transaction is for EIP1559 (https://eips.ethereum.org/EIPS/eip-1559)
    type: 2,
    nonce,
    to: toAddress,
    maxPriorityFeePerGas: maxPriorityFeePerGasInAvax,
    maxFeePerGas: maxFeePerGasInAvax,
    value: ethers.utils.parseEther(amount),
    chainId,
  };
  const estimatedGasCost = await HTTPSProvider.estimateGas(baseTx);

  const fullTx: ethers.providers.TransactionRequest = {
    ...baseTx,
    gasLimit: estimatedGasCost,
  };

  logger.verbose('This transaction should cost:', {
    values: { estimatedGasCost },
  });

  const signedTxn = await fromWallet.signTransaction(fullTx);
  const txnHash = ethers.utils.keccak256(signedTxn);
  const explorerUrl = isProd
    ? `https://snowtrace.io/tx/${txnHash}`
    : `https://testnet.snowtrace.io/tx/${txnHash}`;

  logger.info('Sending signed transaction', {
    values: {
      signedTxn,
      fullTx,
      txnHash,
      explorerUrl,
      nonce,
    },
  });

  const res = waitForTxnToFinish
    ? await (await HTTPSProvider.sendTransaction(signedTxn)).wait()
    : await HTTPSProvider.sendTransaction(signedTxn);

  return {
    transaction: res,
    txHash: txnHash,
    explorerUrl,
  };
};

export interface HistoricalTxn {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  to: string;
  contractAddress: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

export async function getAddressTxHistory(
  userAddress: string,
  contractAddress: string
) {
  interface TxListResponse {
    message: string;
    result: HistoricalTxn[];
    status: string;
  }
  const snowtraceApiUrl = isProd
    ? 'https://api.snowtrace.io/api'
    : 'https://api-testnet.snowtrace.io/api';

  const rawHistoryResp = await axios.get<TxListResponse>(snowtraceApiUrl, {
    params: {
      module: 'account',
      action: 'tokentx',
      address: userAddress,
      conrtactaddress: contractAddress,
      startblock: 1,
      endblock: 99999999,
      sort: 'desc',
    },
  });

  return rawHistoryResp.data.result;
}
