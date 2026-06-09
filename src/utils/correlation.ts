import { v4 as uuidv4 } from 'uuid'

export function newCorrelationId(): string {
  return uuidv4()
}

export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set(['privateKey', 'authToken', 'password', 'secret', 'key'])
  return Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[REDACTED]' : v]),
  )
}
