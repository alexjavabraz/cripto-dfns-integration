/**
 * Gas funding — sends native ETH from the mother wallet to a newly created wallet.
 * This is best-effort: errors are logged and captured by Sentry but never re-thrown.
 */
import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import { getDfnsClient } from '../dfns/client.js'
import { DfnsSigner } from '../dfns/signer.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'

// Maps DFNS network ID (lowercase) to the mother wallet ID and RPC info.
// Add entries here when new networks get their own mother wallets.
function getGasWalletId(network: string): string | undefined {
  const key = network.toLowerCase()
  if (key === 'ethereumsepolia' || key === 'ethereum') return env.DFNS_WALLET_ETHEREUM
  if (key === 'polygon' || key === 'polygonamoy') return env.DFNS_WALLET_POLYGON
  if (key === 'arbitrumone' || key === 'arbitrum') return env.DFNS_WALLET_ARBITRUM
  return undefined
}

function getRpcUrl(network: string): string {
  const key = network.toLowerCase()
  if (key === 'ethereumsepolia' || key === 'ethereum') {
    return env.RPC_ETHEREUM ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  }
  if (key === 'polygon' || key === 'polygonamoy') {
    return env.RPC_POLYGON ?? 'https://polygon-rpc.com'
  }
  if (key === 'arbitrumone' || key === 'arbitrum') {
    return env.RPC_ARBITRUM ?? 'https://arb1.arbitrum.io/rpc'
  }
  return 'https://ethereum-sepolia-rpc.publicnode.com'
}

export async function sendGasToNewWallet(toAddress: string, network: string): Promise<void> {
  const walletId = getGasWalletId(network)
  if (!walletId) {
    logger.warn('No gas fund wallet configured for network — skipping gas funding', { network })
    return
  }

  const amount = env.GAS_FUND_AMOUNT_ETH

  try {
    const provider = new ethers.JsonRpcProvider(getRpcUrl(network))
    const signer = new DfnsSigner(getDfnsClient(), walletId, provider)
    const amountWei = ethers.parseEther(amount)

    logger.info('Sending gas ETH to new wallet', {
      fromWalletId: walletId,
      to: toAddress,
      amountEth: amount,
      network,
    })

    const tx = await signer.sendTransaction({ to: toAddress, value: amountWei })
    const receipt = await tx.wait()

    logger.info('Gas fund transfer completed', {
      txHash: receipt?.hash,
      to: toAddress,
      amountEth: amount,
      network,
    })
  } catch (err) {
    logger.error('Failed to send gas to new wallet — continuing without gas funding', {
      to: toAddress,
      network,
      error: err instanceof Error ? err.message : String(err),
    })
    captureError(err, { context: 'gas-fund:send', toAddress, network })
  }
}
