import { describe, it, expect } from 'vitest'
import { tokenTransferSchema } from './token-transfer.schema.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

const validTransfer = {
  event: 'token.transfer.requested',
  idempotencyKey: 'idem-transfer-001',
  requestedAt: '2024-01-01T00:00:00.000Z',
  requester: {
    userId: 'user-001',
    email: 'user@example.com',
    ip: '127.0.0.1',
  },
  network: 'ethereumsepolia',
  token: {
    contractAddress: validAddress,
    decimals: 18,
  },
  transfer: {
    toAddress: validAddress,
    amount: '10.5',
  },
  metadata: {
    correlationId: 'corr-001',
  },
}

describe('tokenTransferSchema', () => {
  it('accepts a valid transfer message', () => {
    const result = tokenTransferSchema.safeParse(validTransfer)
    expect(result.success).toBe(true)
  })

  it('requires event literal', () => {
    const result = tokenTransferSchema.safeParse({ ...validTransfer, event: 'other.event' })
    expect(result.success).toBe(false)
  })

  it('requires idempotencyKey', () => {
    const { idempotencyKey: _idempotencyKey, ...rest } = validTransfer
    const result = tokenTransferSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('requires requestedAt as datetime', () => {
    const result = tokenTransferSchema.safeParse({ ...validTransfer, requestedAt: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('requires requester.userId', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      requester: { email: 'x@x.com' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts requester without optional email/ip', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      requester: { userId: 'user-001' },
    })
    expect(result.success).toBe(true)
  })

  it('requires valid token.contractAddress', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      token: { contractAddress: 'not-an-address', decimals: 18 },
    })
    expect(result.success).toBe(false)
  })

  it('defaults token.decimals to 18', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      token: { contractAddress: validAddress },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.token.decimals).toBe(18)
    }
  })

  it('requires valid transfer.toAddress', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      transfer: { toAddress: 'not-an-address', amount: '10' },
    })
    expect(result.success).toBe(false)
  })

  it('requires transfer.amount', () => {
    const result = tokenTransferSchema.safeParse({
      ...validTransfer,
      transfer: { toAddress: validAddress, amount: '' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts without optional metadata', () => {
    const { metadata: _metadata, ...rest } = validTransfer
    const result = tokenTransferSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })

  it('requires network to be non-empty string', () => {
    const result = tokenTransferSchema.safeParse({ ...validTransfer, network: '' })
    expect(result.success).toBe(false)
  })
})
