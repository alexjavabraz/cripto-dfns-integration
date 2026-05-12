import { z } from 'zod'
import { TokenType } from './token.schema.js'

const ethereumAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

export const creationRequestMessageSchema = z.object({
  event: z.literal('token.creation.requested'),
  idempotencyKey: z.string().min(1),
  timestamp: z.string().datetime(),
  network: z.object({
    name: z.string().min(1),
    chainId: z.number().int().min(0),
  }),
  token: z.object({
    standard: TokenType,
    name: z.string().min(1).max(64).optional(),
    symbol: z.string().min(1).max(11).optional(),
    ownerAddress: ethereumAddress,
  }),
  params: z.object({
    erc20: z
      .object({
        decimals: z.number().int().min(0).max(18).default(18),
        supply: z.number().positive(),
      })
      .optional(),
    erc721: z
      .object({
        baseUri: z.string().url().max(2048).optional(),
      })
      .optional(),
    erc1155: z
      .object({
        uri: z.string().url().max(2048),
      })
      .optional(),
  }),
  metadata: z.object({
    requester: z.string().min(1),
    correlationId: z.string().min(1),
  }),
})

export type CreationRequestMessage = z.infer<typeof creationRequestMessageSchema>

export const creationSuccessEventSchema = z.object({
  event: z.literal('token.creation.succeeded'),
  idempotencyKey: z.string(),
  timestamp: z.string(),
  network: z.object({ name: z.string(), chainId: z.number() }),
  token: z.object({
    standard: z.string(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    contractAddress: z.string(),
  }),
  deployment: z.object({
    contractAddress: z.string(),
    transactionHash: z.string(),
    blockNumber: z.number(),
    deployerAddress: z.string(),
    gasUsed: z.string(),
    effectiveGasPrice: z.string(),
  }),
  explorer: z.object({
    transactionUrl: z.string(),
    contractUrl: z.string(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    processedBy: z.string(),
    durationMs: z.number(),
  }),
})

export type CreationSuccessEvent = z.infer<typeof creationSuccessEventSchema>

export const creationErrorEventSchema = z.object({
  event: z.literal('token.creation.failed'),
  idempotencyKey: z.string(),
  timestamp: z.string(),
  network: z.object({ name: z.string(), chainId: z.number() }),
  token: z.object({
    standard: z.string(),
    name: z.string().optional(),
    symbol: z.string().optional(),
  }),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.string().optional(),
    retryable: z.boolean(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    processedBy: z.string(),
    durationMs: z.number(),
  }),
})

export type CreationErrorEvent = z.infer<typeof creationErrorEventSchema>
