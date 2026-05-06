import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // DFNS
  DFNS_API_URL: z.string().url(),
  DFNS_ORG_ID: z.string().min(1),
  DFNS_AUTH_TOKEN: z.string().min(1),
  DFNS_CRED_ID: z.string().min(1),
  DFNS_PRIVATE_KEY: z.string().min(1),

  // RPC endpoints per network
  RPC_ETHEREUM: z.string().url(),
  RPC_POLYGON: z.string().url(),
  RPC_ARBITRUM: z.string().url(),

  // DFNS wallet IDs per network (pre-created wallets to deploy from)
  DFNS_WALLET_ETHEREUM: z.string().min(1),
  DFNS_WALLET_POLYGON: z.string().min(1),
  DFNS_WALLET_ARBITRUM: z.string().min(1),

  // RabbitMQ
  RABBITMQ_URL: z.string().url(),
  RABBITMQ_QUEUE: z.string().default('token.create'),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).default(1),
  RABBITMQ_CREATION_QUEUE: z.string().default('token_creation_request'),
  RABBITMQ_CREATED_EXCHANGE: z.string().default('token_created'),
  RABBITMQ_ERROR_EXCHANGE: z.string().default('token_creation_error'),

  // Sentry
  SENTRY_DSN: z.string().url(),

  // Smoke test (optional — set SMOKE_TEST=true to run an end-to-end test on startup)
  SMOKE_TEST: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  TEST_OWNER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'TEST_OWNER_ADDRESS must be a valid Ethereum address')
    .optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors
  const missing = Object.entries(errors)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n')
  throw new Error(`Invalid environment configuration:\n${missing}`)
}

export const env = parsed.data
export type Env = typeof env
