import { describe, it, expect } from 'vitest'
import { balanceRequestSchema } from './balance.schema.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

const validRequest = {
  event: 'token.balance.requested',
  idempotencyKey: 'idem-balance-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: { address: validAddress },
  wallet: { address: validAddress },
  metadata: { requester: 'bff-service', correlationId: 'corr-001' },
}

describe('balanceRequestSchema', () => {
  it('accepts a valid balance request', () => {
    const result = balanceRequestSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  it('requires event literal', () => {
    const result = balanceRequestSchema.safeParse({ ...validRequest, event: 'other.event' })
    expect(result.success).toBe(false)
  })

  it('requires idempotencyKey', () => {
    const { idempotencyKey, ...rest } = validRequest
    const result = balanceRequestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('requires timestamp as datetime', () => {
    const result = balanceRequestSchema.safeParse({ ...validRequest, timestamp: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('requires valid token.address', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      token: { address: 'invalid' },
    })
    expect(result.success).toBe(false)
  })

  it('requires valid wallet.address', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      wallet: { address: 'not-an-address' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional token.tokenId (for ERC-1155)', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      token: { address: validAddress, tokenId: '42' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.token.tokenId).toBe('42')
    }
  })

  it('requires network.name to be non-empty', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      network: { name: '', chainId: 1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative chainId', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      network: { name: 'test', chainId: -1 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts chainId = 0', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      network: { name: 'test', chainId: 0 },
    })
    expect(result.success).toBe(true)
  })

  it('requires metadata.requester', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      metadata: { correlationId: 'corr-001' },
    })
    expect(result.success).toBe(false)
  })

  it('requires metadata.correlationId', () => {
    const result = balanceRequestSchema.safeParse({
      ...validRequest,
      metadata: { requester: 'bff' },
    })
    expect(result.success).toBe(false)
  })
})
