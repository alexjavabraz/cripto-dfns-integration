import { describe, it, expect } from 'vitest'
import { accountCreateSchema } from './account-create.schema.js'

const validRequest = {
  event: 'account.create.requested',
  idempotencyKey: 'idem-account-001',
  requestedAt: '2024-01-01T00:00:00.000Z',
  userId: 'user-abc-123',
  network: 'EthereumSepolia',
}

describe('accountCreateSchema', () => {
  it('accepts a valid account create request', () => {
    const result = accountCreateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  it('requires event literal', () => {
    const result = accountCreateSchema.safeParse({ ...validRequest, event: 'other.event' })
    expect(result.success).toBe(false)
  })

  it('requires idempotencyKey to be non-empty', () => {
    const result = accountCreateSchema.safeParse({ ...validRequest, idempotencyKey: '' })
    expect(result.success).toBe(false)
  })

  it('requires requestedAt as datetime', () => {
    const result = accountCreateSchema.safeParse({ ...validRequest, requestedAt: 'invalid-date' })
    expect(result.success).toBe(false)
  })

  it('requires userId', () => {
    const { userId: _userId, ...rest } = validRequest
    const result = accountCreateSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('requires userId to be non-empty', () => {
    const result = accountCreateSchema.safeParse({ ...validRequest, userId: '' })
    expect(result.success).toBe(false)
  })

  it('defaults network to EthereumSepolia', () => {
    const { network: _network, ...rest } = validRequest
    const result = accountCreateSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.network).toBe('EthereumSepolia')
    }
  })

  it('accepts custom network', () => {
    const result = accountCreateSchema.safeParse({ ...validRequest, network: 'Polygon' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.network).toBe('Polygon')
    }
  })

  it('returns parsed data with correct types', () => {
    const result = accountCreateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.event).toBe('account.create.requested')
      expect(result.data.userId).toBe('user-abc-123')
      expect(result.data.idempotencyKey).toBe('idem-account-001')
    }
  })
})
