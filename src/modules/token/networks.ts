import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import type { Network } from '../../schemas/token.schema.js'

export interface NetworkConfig {
  rpcUrl: string
  walletId: string
  dfnsNetworkId: string
  chainId: number
  explorerUrl: string
}

const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  ethereum: {
    rpcUrl: env.RPC_ETHEREUM,
    walletId: env.DFNS_WALLET_ETHEREUM,
    dfnsNetworkId: 'EthereumSepolia',
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  polygon: {
    rpcUrl: env.RPC_POLYGON,
    walletId: env.DFNS_WALLET_POLYGON,
    dfnsNetworkId: 'Polygon',
    chainId: 137,
    explorerUrl: 'https://polygonscan.com',
  },
  arbitrum: {
    rpcUrl: env.RPC_ARBITRUM,
    walletId: env.DFNS_WALLET_ARBITRUM,
    dfnsNetworkId: 'ArbitrumOne',
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
  },
}

const _providerCache = new Map<Network, ethers.JsonRpcProvider>()

export function getNetworkConfig(network: Network): NetworkConfig {
  const config = NETWORK_CONFIGS[network]
  if (!config) throw new Error(`Unsupported network: ${network}`)
  return config
}

export function getProvider(network: Network): ethers.JsonRpcProvider {
  const cached = _providerCache.get(network)
  if (cached) return cached

  const { rpcUrl, chainId } = getNetworkConfig(network)
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
    staticNetwork: true,
  })
  _providerCache.set(network, provider)
  return provider
}
