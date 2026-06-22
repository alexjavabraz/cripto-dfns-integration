import { describe, it, expect } from 'vitest'
import { newCorrelationId, sanitizePayload } from './correlation.js'

describe('newCorrelationId', () => {
  it('returns a string', () => {
    const id = newCorrelationId()
    expect(typeof id).toBe('string')
  })

  it('returns a UUID v4 format', () => {
    const id = newCorrelationId()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('returns a different value on each call', () => {
    const id1 = newCorrelationId()
    const id2 = newCorrelationId()
    expect(id1).not.toBe(id2)
  })
})

describe('sanitizePayload', () => {
  it('redacts sensitive keys', () => {
    const input = {
      privateKey: 'secret-private-key',
      authToken: 'bearer-token',
      password: 'p@ssw0rd',
      secret: 'top-secret',
      key: 'my-key',
    }
    const result = sanitizePayload(input)
    expect(result['privateKey']).toBe('[REDACTED]')
    expect(result['authToken']).toBe('[REDACTED]')
    expect(result['password']).toBe('[REDACTED]')
    expect(result['secret']).toBe('[REDACTED]')
    expect(result['key']).toBe('[REDACTED]')
  })

  it('preserves non-sensitive keys', () => {
    const input = {
      userId: 'user-123',
      network: 'ethereumsepolia',
      amount: 100,
      flag: true,
      nested: { foo: 'bar' },
    }
    const result = sanitizePayload(input)
    expect(result['userId']).toBe('user-123')
    expect(result['network']).toBe('ethereumsepolia')
    expect(result['amount']).toBe(100)
    expect(result['flag']).toBe(true)
    expect(result['nested']).toEqual({ foo: 'bar' })
  })

  it('handles a mixed payload with both sensitive and non-sensitive keys', () => {
    const input = {
      userId: 'user-123',
      privateKey: 'should-be-hidden',
      network: 'polygon',
    }
    const result = sanitizePayload(input)
    expect(result['userId']).toBe('user-123')
    expect(result['privateKey']).toBe('[REDACTED]')
    expect(result['network']).toBe('polygon')
  })

  it('handles an empty payload', () => {
    const result = sanitizePayload({})
    expect(result).toEqual({})
  })

  it('handles payload with undefined values', () => {
    const input: Record<string, unknown> = { userId: 'abc', someField: undefined }
    const result = sanitizePayload(input)
    expect(result['userId']).toBe('abc')
    expect(result['someField']).toBeUndefined()
  })
})
