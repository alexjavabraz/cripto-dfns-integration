import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'

// We test the schema validation logic directly without importing env.ts
// (env.ts runs safeParse at module load time against process.env)
// Instead we recreate the schema here and test it with controlled inputs.

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DFNS_API_URL: z.string().url(),
  DFNS_ORG_ID: z.string().min(1),
  DFNS_AUTH_TOKEN: z.string().min(1),
  DFNS_CRED_ID: z.string().min(1),
  DFNS_PRIVATE_KEY: z.string().min(1),
  RPC_ETHEREUM: z.string().url().optional(),
  RPC_POLYGON: z.string().url().optional(),
  RPC_ARBITRUM: z.string().url().optional(),
  DFNS_WALLET_ETHEREUM: z.string().min(1).optional(),
  DFNS_WALLET_POLYGON: z.string().min(1).optional(),
  DFNS_WALLET_ARBITRUM: z.string().min(1).optional(),
  RABBITMQ_URL: z.string().url(),
  RABBITMQ_QUEUE: z.string().default('token.create'),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).default(1),
  EXCHANGE_REQUEST_TOKEN_CREATION: z.string().default('bff_publish_token_creation_request'),
  QUEUE_REQUEST_TOKEN_CREATION: z.string().default('dfns_listen_token_creation_request'),
  EXCHANGE_RESPONSE_TOKEN_CREATED: z.string().default('dfns_publish_token_creation_response'),
  RABBITMQ_ERROR_EXCHANGE: z.string().default('token_creation_error'),
  QUEUE_GET_BALANCE: z.string().default('queue_get_balance'),
  EXCHANGE_BALANCE_RESPONSE: z.string().default('balance_response'),
  TOKEN_EVENT: z.string().default('token_event'),
  QUEUE_TOKEN_EVENT: z.string().default('token_event.queue'),
  EXCHANGE_TOKEN_EVENT_RESPONSE: z.string().default('token_event_response'),
  EXCHANGE_TOKEN_TRANSFER_REQUEST: z.string().default('bff_publish_token_transfer_request'),
  QUEUE_TOKEN_TRANSFER_REQUEST: z.string().default('dfns_listen_token_transfer_request'),
  EXCHANGE_TOKEN_TRANSFER_RESPONSE: z.string().default('dfns_publish_token_transfer_response'),
  EXCHANGE_ACCOUNT_CREATE_REQUEST: z.string().default('bff_publish_account_create_request'),
  QUEUE_ACCOUNT_CREATE_REQUEST: z.string().default('dfns_listen_account_create_request'),
  EXCHANGE_ACCOUNT_CREATE_RESPONSE: z.string().default('dfns_publish_account_create_response'),
  EXCHANGE_USER_TRANSFER_REQUEST: z.string().default('bff_publish_user_transfer_request'),
  QUEUE_USER_TRANSFER_REQUEST: z.string().default('dfns_listen_user_transfer_request'),
  EXCHANGE_USER_TRANSFER_RESPONSE: z.string().default('dfns_publish_user_transfer_response'),
  GAS_FUND_AMOUNT_ETH: z.string().default('0.001'),
  SENTRY_DSN: z.string().url(),
  SMOKE_TEST: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  TEST_OWNER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'TEST_OWNER_ADDRESS must be a valid Ethereum address')
    .optional(),
})

const validBase = {
  DFNS_API_URL: 'https://api.dfns.ninja',
  DFNS_ORG_ID: 'org-123',
  DFNS_AUTH_TOKEN: 'token-abc',
  DFNS_CRED_ID: 'cred-xyz',
  DFNS_PRIVATE_KEY: 'pk-secret',
  RABBITMQ_URL: 'amqp://localhost:5672',
  SENTRY_DSN: 'https://abc@sentry.io/123',
}

describe('env schema validation', () => {
  describe('required fields', () => {
    it('accepts a minimal valid config', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
    })

    it('rejects missing DFNS_API_URL', () => {
      const { DFNS_API_URL, ...rest } = validBase
      const result = envSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('rejects invalid DFNS_API_URL (not a URL)', () => {
      const result = envSchema.safeParse({ ...validBase, DFNS_API_URL: 'not-a-url' })
      expect(result.success).toBe(false)
    })

    it('rejects missing RABBITMQ_URL', () => {
      const { RABBITMQ_URL, ...rest } = validBase
      const result = envSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('rejects invalid RABBITMQ_URL (not a URL)', () => {
      const result = envSchema.safeParse({ ...validBase, RABBITMQ_URL: 'not-a-url' })
      expect(result.success).toBe(false)
    })

    it('rejects missing SENTRY_DSN', () => {
      const { SENTRY_DSN, ...rest } = validBase
      const result = envSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('rejects empty DFNS_ORG_ID', () => {
      const result = envSchema.safeParse({ ...validBase, DFNS_ORG_ID: '' })
      expect(result.success).toBe(false)
    })

    it('rejects empty DFNS_AUTH_TOKEN', () => {
      const result = envSchema.safeParse({ ...validBase, DFNS_AUTH_TOKEN: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('default values', () => {
    it('defaults NODE_ENV to development', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development')
      }
    })

    it('defaults PORT to 3000', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.PORT).toBe(3000)
      }
    })

    it('defaults LOG_LEVEL to info', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('info')
      }
    })

    it('defaults RABBITMQ_QUEUE to token.create', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.RABBITMQ_QUEUE).toBe('token.create')
      }
    })

    it('defaults RABBITMQ_PREFETCH to 1', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.RABBITMQ_PREFETCH).toBe(1)
      }
    })

    it('defaults GAS_FUND_AMOUNT_ETH to 0.001', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.GAS_FUND_AMOUNT_ETH).toBe('0.001')
      }
    })

    it('defaults SMOKE_TEST to false when absent', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.SMOKE_TEST).toBe(false)
      }
    })

    it('coerces SMOKE_TEST="true" to boolean true', () => {
      const result = envSchema.safeParse({ ...validBase, SMOKE_TEST: 'true' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.SMOKE_TEST).toBe(true)
      }
    })

    it('coerces SMOKE_TEST="false" to boolean false', () => {
      const result = envSchema.safeParse({ ...validBase, SMOKE_TEST: 'false' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.SMOKE_TEST).toBe(false)
      }
    })
  })

  describe('PORT coercion and validation', () => {
    it('coerces PORT string to number', () => {
      const result = envSchema.safeParse({ ...validBase, PORT: '8080' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.PORT).toBe(8080)
      }
    })

    it('rejects PORT 0', () => {
      const result = envSchema.safeParse({ ...validBase, PORT: '0' })
      expect(result.success).toBe(false)
    })

    it('rejects PORT 65536', () => {
      const result = envSchema.safeParse({ ...validBase, PORT: '65536' })
      expect(result.success).toBe(false)
    })

    it('accepts PORT 65535', () => {
      const result = envSchema.safeParse({ ...validBase, PORT: '65535' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.PORT).toBe(65535)
      }
    })
  })

  describe('NODE_ENV enum', () => {
    it('accepts development', () => {
      const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'development' })
      expect(result.success).toBe(true)
    })

    it('accepts production', () => {
      const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'production' })
      expect(result.success).toBe(true)
    })

    it('accepts test', () => {
      const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'test' })
      expect(result.success).toBe(true)
    })

    it('rejects staging', () => {
      const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'staging' })
      expect(result.success).toBe(false)
    })
  })

  describe('LOG_LEVEL enum', () => {
    const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
    for (const level of levels) {
      it(`accepts ${level}`, () => {
        const result = envSchema.safeParse({ ...validBase, LOG_LEVEL: level })
        expect(result.success).toBe(true)
      })
    }

    it('rejects unknown level', () => {
      const result = envSchema.safeParse({ ...validBase, LOG_LEVEL: 'verbose' })
      expect(result.success).toBe(false)
    })
  })

  describe('optional fields', () => {
    it('accepts valid RPC_ETHEREUM URL', () => {
      const result = envSchema.safeParse({
        ...validBase,
        RPC_ETHEREUM: 'https://eth.llamarpc.com',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid RPC_ETHEREUM (not a URL)', () => {
      const result = envSchema.safeParse({ ...validBase, RPC_ETHEREUM: 'not-a-url' })
      expect(result.success).toBe(false)
    })

    it('accepts valid TEST_OWNER_ADDRESS', () => {
      const result = envSchema.safeParse({
        ...validBase,
        TEST_OWNER_ADDRESS: '0xabcdef1234567890abcdef1234567890abcdef12',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid TEST_OWNER_ADDRESS', () => {
      const result = envSchema.safeParse({ ...validBase, TEST_OWNER_ADDRESS: 'not-an-address' })
      expect(result.success).toBe(false)
    })

    it('allows omitting optional DFNS_WALLET_ETHEREUM', () => {
      const result = envSchema.safeParse(validBase)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.DFNS_WALLET_ETHEREUM).toBeUndefined()
      }
    })
  })
})
