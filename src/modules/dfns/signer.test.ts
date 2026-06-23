import { describe, it, expect, vi } from 'vitest'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
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

import { DfnsSigner } from './signer.js'

const walletId = 'wallet-test-001'
const walletAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
const fakeTxHash = '0x' + 'b'.repeat(64)

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    getTransactionCount: vi.fn().mockResolvedValue(42),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    getFeeData: vi.fn().mockResolvedValue({
      maxFeePerGas: 10000000000n,
      maxPriorityFeePerGas: 1000000000n,
    }),
    getTransaction: vi.fn().mockResolvedValue({
      hash: fakeTxHash,
      wait: vi.fn().mockResolvedValue({ hash: fakeTxHash, blockNumber: 100 }),
    }),
    ...overrides,
  }
}

function makeDfnsClient(overrides: Record<string, unknown> = {}) {
  return {
    wallets: {
      getWallet: vi.fn().mockResolvedValue({ id: walletId, address: walletAddress }),
      broadcastTransaction: vi
        .fn()
        .mockResolvedValue({ id: 'dfns-tx-001', status: 'Pending' }),
      getTransaction: vi.fn().mockResolvedValue({ txHash: fakeTxHash, status: 'Broadcasted' }),
      ...(overrides['wallets'] as Record<string, unknown> | undefined),
    },
    ...overrides,
  }
}

describe('DfnsSigner', () => {
  describe('getAddress', () => {
    it('returns wallet address from DFNS API', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      const address = await signer.getAddress()
      expect(address).toBe(walletAddress)
    })

    it('caches the address after first fetch', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      await signer.getAddress()
      await signer.getAddress()

      expect(dfnsClient.wallets.getWallet).toHaveBeenCalledTimes(1)
    })

    it('throws when wallet has no address', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      dfnsClient.wallets.getWallet = vi.fn().mockResolvedValue({ id: walletId, address: null })

      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)
      await expect(signer.getAddress()).rejects.toThrow(
        `DFNS wallet ${walletId} has no address`,
      )
    })
  })

  describe('signMessage / signTransaction / signTypedData', () => {
    it('throws not-supported for signMessage', async () => {
      const signer = new DfnsSigner(makeDfnsClient() as never, walletId, makeProvider() as never)
      await expect(signer.signMessage('hello')).rejects.toThrow('DfnsSigner')
    })

    it('throws not-supported for signTransaction', async () => {
      const signer = new DfnsSigner(makeDfnsClient() as never, walletId, makeProvider() as never)
      await expect(signer.signTransaction({})).rejects.toThrow('DfnsSigner')
    })

    it('throws not-supported for signTypedData', async () => {
      const signer = new DfnsSigner(makeDfnsClient() as never, walletId, makeProvider() as never)
      await expect(signer.signTypedData({}, {}, {})).rejects.toThrow('DfnsSigner')
    })
  })

  describe('connect', () => {
    it('returns a new DfnsSigner with the new provider', () => {
      const provider1 = makeProvider()
      const provider2 = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider1 as never)
      const connected = signer.connect(provider2 as never)

      expect(connected).toBeInstanceOf(DfnsSigner)
      expect(connected).not.toBe(signer)
    })
  })

  describe('sendTransaction', () => {
    it('broadcasts a transaction via DFNS and returns transaction response', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      const tx = {
        to: '0xrecipient1234567890abcdef1234567890abcdef',
        value: 1000000000000000n,
        data: '0x',
      }

      const response = await signer.sendTransaction(tx)
      expect(response).toBeDefined()
      expect(dfnsClient.wallets.broadcastTransaction).toHaveBeenCalledOnce()
      const broadcastBody = dfnsClient.wallets.broadcastTransaction.mock.calls[0]![0]
      expect(broadcastBody.walletId).toBe(walletId)
      expect(broadcastBody.body.kind).toBe('Eip1559')
    })

    it('throws when provider is not set', async () => {
      // DfnsSigner is an AbstractSigner, provider comes from constructor
      // We test the guard by creating with a provider then somehow unsetting it
      // The AbstractSigner class should always have a provider via super(provider)
      // but the guard exists in code — we test it by overriding the property
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, makeProvider() as never)
      // Force provider to null to trigger the guard
      Object.defineProperty(signer, 'provider', { get: () => null })

      await expect(signer.sendTransaction({ to: '0x0' })).rejects.toThrow(
        'DfnsSigner: provider not set',
      )
    })

    it('uses provided nonce instead of fetching', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      await signer.sendTransaction({ to: '0xabc', nonce: 99 })

      expect(provider.getTransactionCount).not.toHaveBeenCalled()
      const broadcastCall = dfnsClient.wallets.broadcastTransaction.mock.calls[0]![0]
      expect(broadcastCall.body.nonce).toBe(99)
    })

    it('uses provided gasLimit instead of estimating', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      await signer.sendTransaction({ to: '0xabc', gasLimit: 50000n })

      expect(provider.estimateGas).not.toHaveBeenCalled()
    })

    it('polls until txHash is available', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      // First poll returns Pending, second returns txHash
      dfnsClient.wallets.getTransaction = vi
        .fn()
        .mockResolvedValueOnce({ txHash: null, status: 'Pending' })
        .mockResolvedValueOnce({ txHash: fakeTxHash, status: 'Broadcasted' })

      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)
      vi.useFakeTimers()

      const txPromise = signer.sendTransaction({ to: '0xabc' })
      // Advance timers to allow polling
      await vi.runAllTimersAsync()
      const response = await txPromise
      expect(response).toBeDefined()
      vi.useRealTimers()
    })

    it('throws when DFNS transaction is Failed', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      dfnsClient.wallets.getTransaction = vi
        .fn()
        .mockResolvedValue({ txHash: null, status: 'Failed', reason: 'out of gas' })

      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)
      vi.useFakeTimers()

      const txPromise = signer.sendTransaction({ to: '0xabc' })
      await vi.runAllTimersAsync()
      await expect(txPromise).rejects.toThrow('Failed')
      vi.useRealTimers()
    })

    it('throws when DFNS transaction is Rejected', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      dfnsClient.wallets.getTransaction = vi
        .fn()
        .mockResolvedValue({ txHash: null, status: 'Rejected', reason: 'policy rejected' })

      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)
      vi.useFakeTimers()

      const txPromise = signer.sendTransaction({ to: '0xabc' })
      await vi.runAllTimersAsync()
      await expect(txPromise).rejects.toThrow('Rejected')
      vi.useRealTimers()
    })

    it('throws when transaction not found on provider after broadcast', async () => {
      const provider = makeProvider()
      provider.getTransaction = vi.fn().mockResolvedValue(null)

      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)
      vi.useFakeTimers()

      const txPromise = signer.sendTransaction({ to: '0xabc' })
      await vi.runAllTimersAsync()
      await expect(txPromise).rejects.toThrow('not found on provider')
      vi.useRealTimers()
    })

    it('handles contract creation (no to address)', async () => {
      const provider = makeProvider()
      const dfnsClient = makeDfnsClient()
      const signer = new DfnsSigner(dfnsClient as never, walletId, provider as never)

      vi.useFakeTimers()
      const txPromise = signer.sendTransaction({ data: '0x6080' }) // no 'to'
      await vi.runAllTimersAsync()
      await txPromise

      const broadcastCall = dfnsClient.wallets.broadcastTransaction.mock.calls[0]![0]
      expect(broadcastCall.body.to).toBeUndefined()
      vi.useRealTimers()
    })
  })
})
