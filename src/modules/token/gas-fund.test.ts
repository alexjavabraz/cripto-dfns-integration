import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    DFNS_WALLET_ETHEREUM: 'wallet-eth-001',
    DFNS_WALLET_POLYGON: 'wallet-poly-001',
    DFNS_WALLET_ARBITRUM: undefined,
    RPC_ETHEREUM: undefined,
    RPC_POLYGON: undefined,
    RPC_ARBITRUM: undefined,
    GAS_FUND_AMOUNT_ETH: '0.001',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}))

// Mock sentry
vi.mock('../../config/sentry.js', () => ({
  captureError: vi.fn(),
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

const mockSendTransaction = vi.fn()
const mockWait = vi.fn()

vi.mock('../dfns/signer.js', () => ({
  DfnsSigner: vi.fn().mockImplementation(() => ({
    sendTransaction: mockSendTransaction,
  })),
}))

vi.mock('../dfns/client.js', () => ({
  getDfnsClient: vi.fn(() => ({})),
}))

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(() => ({})),
    parseEther: vi.fn((amount: string) => BigInt(Math.round(parseFloat(amount) * 1e18))),
  },
}))

import { sendGasToNewWallet } from './gas-fund.js'
import { logger } from '../../utils/logger.js'

describe('sendGasToNewWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWait.mockResolvedValue({ hash: '0xabcdef', blockNumber: 1000 })
    mockSendTransaction.mockResolvedValue({ wait: mockWait })
  })

  it('sends gas for ethereum network', async () => {
    await sendGasToNewWallet('0xrecipient123', 'ethereumsepolia')
    expect(mockSendTransaction).toHaveBeenCalledOnce()
    const tx = mockSendTransaction.mock.calls[0]![0]
    expect(tx.to).toBe('0xrecipient123')
    expect(tx.value).toBeDefined()
  })

  it('sends gas for ethereum mainnet', async () => {
    await sendGasToNewWallet('0xrecipient456', 'ethereum')
    expect(mockSendTransaction).toHaveBeenCalledOnce()
  })

  it('sends gas for polygon network', async () => {
    await sendGasToNewWallet('0xrecipient789', 'polygon')
    expect(mockSendTransaction).toHaveBeenCalledOnce()
  })

  it('sends gas for polygonamoy network', async () => {
    await sendGasToNewWallet('0xrecipientAmoy', 'polygonamoy')
    expect(mockSendTransaction).toHaveBeenCalledOnce()
  })

  it('skips and warns when no gas wallet configured for network', async () => {
    // arbitrum has undefined wallet (DFNS_WALLET_ARBITRUM is undefined in mock env)
    await sendGasToNewWallet('0xrecipientArb', 'arbitrumone')
    expect(mockSendTransaction).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No gas fund wallet configured'),
      expect.objectContaining({ network: 'arbitrumone' }),
    )
  })

  it('skips for unknown network', async () => {
    await sendGasToNewWallet('0xrecipient', 'unknownnetwork')
    expect(mockSendTransaction).not.toHaveBeenCalled()
  })

  it('does NOT throw when sendTransaction fails (best-effort)', async () => {
    mockSendTransaction.mockRejectedValueOnce(new Error('Gas estimation failed'))
    // Should resolve without throwing
    await expect(sendGasToNewWallet('0xrecipient', 'ethereumsepolia')).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does NOT throw when tx.wait fails (best-effort)', async () => {
    mockWait.mockRejectedValueOnce(new Error('Transaction timed out'))
    await expect(sendGasToNewWallet('0xrecipient', 'polygon')).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })

  it('is case-insensitive for network names', async () => {
    await sendGasToNewWallet('0xrecipient', 'ETHEREUMSEPOLIA')
    expect(mockSendTransaction).toHaveBeenCalledOnce()
  })
})
