import { getDfnsClient } from './client.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'

export interface WalletEntry {
  walletId: string
  address: string
  dfnsNetwork: string // exact DFNS network ID (e.g. 'EthereumSepolia')
}

// key = dfnsNetwork.toLowerCase()
const _registry = new Map<string, WalletEntry>()

export async function loadWalletRegistry(): Promise<void> {
  const client = getDfnsClient()
  _registry.clear()

  try {
    let nextPageToken: string | undefined
    let page = 0

    do {
      const result = await client.wallets.listWallets({
        query: { limit: 100, ...(nextPageToken ? { paginationToken: nextPageToken } : {}) },
      })

      for (const wallet of result.items) {
        if (!wallet.address) continue // skip wallets pending key generation
        const key = wallet.network.toLowerCase()
        if (!_registry.has(key)) {
          // keep the first wallet found per network
          _registry.set(key, {
            walletId: wallet.id,
            address: wallet.address,
            dfnsNetwork: wallet.network,
          })
        }
      }

      nextPageToken = result.nextPageToken
      page++
    } while (nextPageToken && page < 10) // safety cap

    logger.info('DFNS wallet registry loaded', {
      networks: [..._registry.keys()],
      count: _registry.size,
    })
  } catch (err) {
    captureError(err, { context: 'wallet-registry:load' })
    throw new Error(
      `Failed to load DFNS wallet registry: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export function getWalletForNetwork(network: string): WalletEntry | undefined {
  return _registry.get(network.toLowerCase())
}

export function isValidNetwork(network: string): boolean {
  return _registry.has(network.toLowerCase())
}

export function getValidNetworks(): string[] {
  return [..._registry.keys()]
}
