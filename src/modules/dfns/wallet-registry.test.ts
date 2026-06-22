import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    DFNS_API_URL: 'https://api.dfns.ninja',
    DFNS_ORG_ID: 'org-test',
    DFNS_AUTH_TOKEN: 'test-token',
    DFNS_CRED_ID: 'test-cred',
    DFNS_PRIVATE_KEY: 'test-key',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}))

// Mock sentry
vi.mock('../../config/sentry.js', () => ({
  captureError: vi.fn(),
  captureMessage: vi.fn(),
  Sentry: { addBreadcrumb: vi.fn() },
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockListWallets = vi.fn()

// Mock DFNS client
vi.mock('./client.js', () => ({
  getDfnsClient: vi.fn(() => ({
    wallets: {
      listWallets: mockListWallets,
    },
  })),
}))

import {
  loadWalletRegistry,
  getWalletForNetwork,
  isValidNetwork,
  getValidNetworks,
} from './wallet-registry.js'

describe('wallet-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadWalletRegistry', () => {
    it('loads wallets and populates the registry', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [
          { id: 'wallet-001', address: '0xabc', network: 'EthereumSepolia' },
          { id: 'wallet-002', address: '0xdef', network: 'Polygon' },
        ],
        nextPageToken: undefined,
      })

      await loadWalletRegistry()

      expect(getWalletForNetwork('ethereumsepolia')).toEqual({
        walletId: 'wallet-001',
        address: '0xabc',
        dfnsNetwork: 'EthereumSepolia',
      })
      expect(getWalletForNetwork('polygon')).toEqual({
        walletId: 'wallet-002',
        address: '0xdef',
        dfnsNetwork: 'Polygon',
      })
    })

    it('skips wallets without an address (pending key generation)', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [
          { id: 'wallet-pending', address: undefined, network: 'EthereumSepolia' },
          { id: 'wallet-ready', address: '0x123', network: 'Polygon' },
        ],
        nextPageToken: undefined,
      })

      await loadWalletRegistry()

      expect(getWalletForNetwork('ethereumsepolia')).toBeUndefined()
      expect(getWalletForNetwork('polygon')).toBeDefined()
    })

    it('keeps the first wallet found per network (deduplication)', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [
          { id: 'wallet-first', address: '0xfirst', network: 'EthereumSepolia' },
          { id: 'wallet-second', address: '0xsecond', network: 'EthereumSepolia' },
        ],
        nextPageToken: undefined,
      })

      await loadWalletRegistry()

      const entry = getWalletForNetwork('ethereumsepolia')
      expect(entry?.walletId).toBe('wallet-first')
      expect(entry?.address).toBe('0xfirst')
    })

    it('handles pagination (fetches multiple pages)', async () => {
      mockListWallets
        .mockResolvedValueOnce({
          items: [{ id: 'wallet-p1', address: '0xp1', network: 'EthereumSepolia' }],
          nextPageToken: 'page2-token',
        })
        .mockResolvedValueOnce({
          items: [{ id: 'wallet-p2', address: '0xp2', network: 'Polygon' }],
          nextPageToken: undefined,
        })

      await loadWalletRegistry()

      expect(getWalletForNetwork('ethereumsepolia')?.walletId).toBe('wallet-p1')
      expect(getWalletForNetwork('polygon')?.walletId).toBe('wallet-p2')
      expect(mockListWallets).toHaveBeenCalledTimes(2)
    })

    it('clears registry before loading', async () => {
      // Load once with EthereumSepolia
      mockListWallets.mockResolvedValueOnce({
        items: [{ id: 'wallet-001', address: '0xabc', network: 'EthereumSepolia' }],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()
      expect(getWalletForNetwork('ethereumsepolia')).toBeDefined()

      // Load again with empty list
      mockListWallets.mockResolvedValueOnce({
        items: [],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()
      expect(getWalletForNetwork('ethereumsepolia')).toBeUndefined()
    })

    it('throws when DFNS API fails', async () => {
      mockListWallets.mockRejectedValueOnce(new Error('DFNS API error'))

      await expect(loadWalletRegistry()).rejects.toThrow('Failed to load DFNS wallet registry')
    })
  })

  describe('getWalletForNetwork', () => {
    it('is case-insensitive for network lookup', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [{ id: 'wallet-001', address: '0xabc', network: 'EthereumSepolia' }],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()

      expect(getWalletForNetwork('ETHEREUMSEPOLIA')).toBeDefined()
      expect(getWalletForNetwork('ethereumsepolia')).toBeDefined()
      expect(getWalletForNetwork('EthereumSepolia')).toBeDefined()
    })

    it('returns undefined for unknown network', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()

      expect(getWalletForNetwork('unknownnetwork')).toBeUndefined()
    })
  })

  describe('isValidNetwork', () => {
    it('returns true for registered network', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [{ id: 'w1', address: '0x1', network: 'Polygon' }],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()

      expect(isValidNetwork('polygon')).toBe(true)
      expect(isValidNetwork('POLYGON')).toBe(true)
    })

    it('returns false for unregistered network', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()

      expect(isValidNetwork('arbitrum')).toBe(false)
    })
  })

  describe('getValidNetworks', () => {
    it('returns all registered network keys', async () => {
      mockListWallets.mockResolvedValueOnce({
        items: [
          { id: 'w1', address: '0x1', network: 'EthereumSepolia' },
          { id: 'w2', address: '0x2', network: 'Polygon' },
        ],
        nextPageToken: undefined,
      })
      await loadWalletRegistry()

      const networks = getValidNetworks()
      expect(networks).toContain('ethereumsepolia')
      expect(networks).toContain('polygon')
      expect(networks.length).toBe(2)
    })
  })
})
