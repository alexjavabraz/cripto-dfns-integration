import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../config/env.js', () => ({
  env: {
    RPC_ETHEREUM: undefined,
    RPC_POLYGON: undefined,
    RPC_ARBITRUM: undefined,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}))

const { mockGetWalletForNetwork, mockProvider } = vi.hoisted(() => ({
  mockGetWalletForNetwork: vi.fn(),
  mockProvider: { _isProvider: true },
}))

vi.mock('../dfns/wallet-registry.js', () => ({
  getWalletForNetwork: mockGetWalletForNetwork,
}))

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(() => mockProvider),
  },
}))

import { getNetworkConfig, getProvider } from './networks.js'

describe('getNetworkConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns config for ethereumsepolia', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-001',
      address: '0xabc',
      dfnsNetwork: 'EthereumSepolia',
    })
    const config = getNetworkConfig('ethereumsepolia')
    expect(config.chainId).toBe(11155111)
    expect(config.explorerUrl).toBe('https://sepolia.etherscan.io')
    expect(config.walletId).toBe('wallet-001')
    expect(config.walletAddress).toBe('0xabc')
    expect(config.dfnsNetworkId).toBe('EthereumSepolia')
    expect(config.rpcUrl).toBe('https://ethereum-sepolia-rpc.publicnode.com')
  })

  it('returns config for ethereum mainnet', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-eth',
      address: '0xdef',
      dfnsNetwork: 'Ethereum',
    })
    const config = getNetworkConfig('ethereum')
    expect(config.chainId).toBe(1)
    expect(config.explorerUrl).toBe('https://etherscan.io')
  })

  it('returns config for polygon', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-poly',
      address: '0xpoly',
      dfnsNetwork: 'Polygon',
    })
    const config = getNetworkConfig('polygon')
    expect(config.chainId).toBe(137)
    expect(config.explorerUrl).toBe('https://polygonscan.com')
  })

  it('returns config for arbitrumone', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-arb',
      address: '0xarb',
      dfnsNetwork: 'ArbitrumOne',
    })
    const config = getNetworkConfig('arbitrumone')
    expect(config.chainId).toBe(42161)
    expect(config.explorerUrl).toBe('https://arbiscan.io')
  })

  it('returns config for base', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-base',
      address: '0xbase',
      dfnsNetwork: 'Base',
    })
    const config = getNetworkConfig('base')
    expect(config.chainId).toBe(8453)
    expect(config.explorerUrl).toBe('https://basescan.org')
  })

  it('returns config for basesepolia', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-basesep',
      address: '0xbasesep',
      dfnsNetwork: 'BaseSepolia',
    })
    const config = getNetworkConfig('basesepolia')
    expect(config.chainId).toBe(84532)
  })

  it('returns config for optimism', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-opt',
      address: '0xopt',
      dfnsNetwork: 'Optimism',
    })
    const config = getNetworkConfig('optimism')
    expect(config.chainId).toBe(10)
  })

  it('returns config for polygonamoy', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-amoy',
      address: '0xamoy',
      dfnsNetwork: 'PolygonAmoy',
    })
    const config = getNetworkConfig('polygonamoy')
    expect(config.chainId).toBe(80002)
  })

  it('throws when no wallet is registered for the network', () => {
    mockGetWalletForNetwork.mockReturnValueOnce(undefined)
    expect(() => getNetworkConfig('unknownnetwork')).toThrow(
      'No DFNS wallet registered for network: unknownnetwork',
    )
  })

  it('throws when network metadata is not configured', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-custom',
      address: '0xcustom',
      dfnsNetwork: 'CustomNetwork',
    })
    expect(() => getNetworkConfig('customnetwork')).toThrow(
      'No RPC/chainId metadata configured for network: customnetwork',
    )
  })

  it('is case-insensitive for the network name', () => {
    mockGetWalletForNetwork.mockReturnValueOnce({
      walletId: 'wallet-001',
      address: '0xabc',
      dfnsNetwork: 'EthereumSepolia',
    })
    const config = getNetworkConfig('EthereumSepolia')
    expect(config.chainId).toBe(11155111)
  })
})

describe('getProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and returns a provider for a given network', () => {
    mockGetWalletForNetwork.mockReturnValue({
      walletId: 'wallet-001',
      address: '0xabc',
      dfnsNetwork: 'EthereumSepolia',
    })
    const provider = getProvider('ethereumsepolia')
    expect(provider).toBe(mockProvider)
  })

  it('caches the provider for the same network', () => {
    mockGetWalletForNetwork.mockReturnValue({
      walletId: 'wallet-001',
      address: '0xabc',
      dfnsNetwork: 'EthereumSepolia',
    })
    const p1 = getProvider('polygonamoy')
    const p2 = getProvider('polygonamoy')
    expect(p1).toBe(p2)
  })
})
