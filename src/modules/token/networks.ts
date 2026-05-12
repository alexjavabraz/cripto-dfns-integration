import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import { getWalletForNetwork } from '../dfns/wallet-registry.js'

export interface NetworkConfig {
  rpcUrl: string
  walletId: string
  walletAddress: string
  dfnsNetworkId: string
  chainId: number
  explorerUrl: string
}

// Static metadata keyed by DFNS network ID (lowercase).
// Provides chainId, explorerUrl and fallback public RPC for known networks.
// Networks not listed here still work as long as a matching wallet exists in DFNS
// and an RPC can be resolved — they will have chainId=0 and empty explorerUrl.
const NETWORK_METADATA: Record<string, { chainId: number; explorerUrl: string; rpcUrl: string }> = {
  ethereumsepolia: {
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: env.RPC_ETHEREUM || 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  ethereum: {
    chainId: 1,
    explorerUrl: 'https://etherscan.io',
    rpcUrl: env.RPC_ETHEREUM || 'https://eth.llamarpc.com',
  },
  polygon: {
    chainId: 137,
    explorerUrl: 'https://polygonscan.com',
    rpcUrl: env.RPC_POLYGON || 'https://polygon-rpc.com',
  },
  polygonamoy: {
    chainId: 80002,
    explorerUrl: 'https://amoy.polygonscan.com',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
  },
  arbitrumone: {
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
  },
  arbitrum: {
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
  },
  optimism: {
    chainId: 10,
    explorerUrl: 'https://optimistic.etherscan.io',
    rpcUrl: 'https://mainnet.optimism.io',
  },
  optimistsepolia: {
    chainId: 11155420,
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    rpcUrl: 'https://sepolia.optimism.io',
  },
  base: {
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
    rpcUrl: 'https://mainnet.base.org',
  },
  basesepolia: {
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org',
    rpcUrl: 'https://sepolia.base.org',
  },
}

const _providerCache = new Map<string, ethers.JsonRpcProvider>()

export function getNetworkConfig(network: string): NetworkConfig {
  const wallet = getWalletForNetwork(network)
  if (!wallet) throw new Error(`No DFNS wallet registered for network: ${network}`)

  const key = network.toLowerCase()
  const meta = NETWORK_METADATA[key]

  if (!meta) {
    throw new Error(
      `No RPC/chainId metadata configured for network: ${network}. ` +
      `Add an entry to NETWORK_METADATA in networks.ts.`,
    )
  }

  return {
    rpcUrl: meta.rpcUrl,
    walletId: wallet.walletId,
    walletAddress: wallet.address,
    dfnsNetworkId: wallet.dfnsNetwork,
    chainId: meta.chainId,
    explorerUrl: meta.explorerUrl,
  }
}

export function getProvider(network: string): ethers.JsonRpcProvider {
  const key = network.toLowerCase()
  const cached = _providerCache.get(key)
  if (cached) return cached

  const { rpcUrl, chainId } = getNetworkConfig(network)
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
  _providerCache.set(key, provider)
  return provider
}
