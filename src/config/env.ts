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

  // RPC endpoints per network (optional — public fallback RPCs are used when absent)
  RPC_ETHEREUM: z.string().url().optional(),
  RPC_POLYGON: z.string().url().optional(),
  RPC_ARBITRUM: z.string().url().optional(),

  // DFNS wallet IDs are now loaded dynamically from the DFNS wallet registry at startup.
  // These env vars are kept for backward compatibility but are no longer required.
  DFNS_WALLET_ETHEREUM: z.string().min(1).optional(),
  DFNS_WALLET_POLYGON: z.string().min(1).optional(),
  DFNS_WALLET_ARBITRUM: z.string().min(1).optional(),

  // RabbitMQ
  RABBITMQ_URL: z.string().url(),
  RABBITMQ_QUEUE: z.string().default('token.create'),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).default(1),
  // Exchange where BFF publishes (dfns-integration binds its listen queue here)
  EXCHANGE_REQUEST_TOKEN_CREATION: z.string().default('bff_publish_token_creation_request'),
  // Queue where dfns-integration listens for token creation requests
  QUEUE_REQUEST_TOKEN_CREATION: z.string().default('dfns_listen_token_creation_request'),
  // Exchange where dfns-integration publishes results (BFF listens here)
  EXCHANGE_RESPONSE_TOKEN_CREATED: z.string().default('dfns_publish_token_creation_response'),
  RABBITMQ_ERROR_EXCHANGE: z.string().default('token_creation_error'),

  // Balance query
  QUEUE_GET_BALANCE: z.string().default('queue_get_balance'),
  EXCHANGE_BALANCE_RESPONSE: z.string().default('balance_response'),

  // Token event operations (mint, burn, pause, unpause)
  TOKEN_EVENT: z.string().default('token_event'),
  QUEUE_TOKEN_EVENT: z.string().default('token_event.queue'),
  EXCHANGE_TOKEN_EVENT_RESPONSE: z.string().default('token_event_response'),

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
