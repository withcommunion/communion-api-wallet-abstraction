import Avalanche from 'avalanche';
import { ethers } from 'ethers';
import axios from 'axios';

import logger from '../util/winston-logger-util';

const chainId = 43113;
const avalanche = new Avalanche(
  'api.avax-test.network',
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

// TODO: Support prod and dev environment
export const sendAvax = async (
  fromWallet: ethers.Wallet,
  amount: string,
  toAddress: string,
  waitForTxnToFinish = false
) => {
  const MAX_GAS_WILLING_TO_SPEND_GWEI = '45';
  const chainId = 43113;
  const nodeURL = 'https://api.avax-test.network/ext/bc/C/rpc';
  const HTTPSProvider = new ethers.providers.JsonRpcProvider(nodeURL);

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

  const signedTx = await fromWallet.signTransaction(fullTx);
  const txHash = ethers.utils.keccak256(signedTx);
  const explorerUrl = `https://testnet.snowtrace.io/tx/${txHash}`;

  logger.info('Sending signed transaction', {
    values: {
      signedTx,
      fullTx,
      txHash,
      explorerUrl,
      nonce,
    },
  });

  const res = waitForTxnToFinish
    ? await (await HTTPSProvider.sendTransaction(signedTx)).wait()
    : await HTTPSProvider.sendTransaction(signedTx);

  return {
    transaction: res,
    txHash,
    explorerUrl,
  };
};

export interface HistoricalTxn {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
}
export async function getAddressTxHistory(address: string) {
  interface TxListResponse {
    message: string;
    result: HistoricalTxn[];
    status: string;
  }
  const rawHistoryResp = await axios.get<TxListResponse>(
    // TODO: Support dev and prod environment
    'https://api-testnet.snowtrace.io/api',
    {
      params: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: 1,
        endblock: 99999999,
        sort: 'desc',
      },
    }
  );

  return rawHistoryResp.data.result;
}
