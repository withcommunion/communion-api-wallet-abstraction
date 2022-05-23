import Avalanche from 'avalanche';
import { ethers } from 'ethers';

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
  toAddress: string
) => {
  const MAX_GAS_WILLING_TO_SPEND_GWEI = '45';
  const chainId = 43113;
  const nodeURL = 'https://api.avax-test.network/ext/bc/C/rpc';
  const HTTPSProvider = new ethers.providers.JsonRpcProvider(nodeURL);

  const fromAddress = fromWallet.address;

  // Minor speed improvement if I store and fetch this from the DB.
  const nonce = await HTTPSProvider.getTransactionCount(fromAddress);

  const { maxFeePerGasGwei, maxPriorityFeePerGasGwei } = await calcFeeData();

  if (maxFeePerGasGwei > MAX_GAS_WILLING_TO_SPEND_GWEI) {
    console.log(`Spending more than MAX_GWEI_GAS_WILLING_TO_SPEND`, {
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

  const baseTx = {
    // Type 2 transaction is for EIP1559 (https://eips.ethereum.org/EIPS/eip-1559)
    type: 2,
    nonce,
    toAddress,
    maxPriorityFeePerGas: maxPriorityFeePerGasInAvax,
    maxFeePerGas: maxFeePerGasInAvax,
    value: ethers.utils.parseEther(amount),
    chainId,
  };
  const estimatedGasCost = await HTTPSProvider.estimateGas(baseTx);

  const fullTx = {
    ...baseTx,
    gasLimit: estimatedGasCost,
  };

  console.log('This transaction should cost:', estimatedGasCost);

  const signedTx = await fromWallet.signTransaction(fullTx);
  const txHash = ethers.utils.keccak256(signedTx);

  console.log('Sending signed transaction', { signedTx, fullTx });
  const res = await (await HTTPSProvider.sendTransaction(signedTx)).wait();
  console.log(
    `View transaction with nonce ${nonce}: https://testnet.snowtrace.io/tx/${txHash}`
  );

  return {
    transaction: res,
    txHash,
    explorerUrl: `https://testnet.snowtrace.io/tx/${txHash}`,
  };
};