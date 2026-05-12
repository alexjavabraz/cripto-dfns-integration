import { z } from 'zod'

const ethereumAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

// Operation-specific params
const mintParams = z.object({
  to: ethereumAddress,
  amount: z.string().min(1).optional(),   // wei string — required for ERC20/ERC1155, ignored for ERC721
  tokenId: z.string().optional(),          // required for ERC1155
  data: z.string().default('0x'),          // extra data for ERC1155
})

const burnParams = z.object({
  from: ethereumAddress,
  amount: z.string().min(1).optional(),   // wei string — required for ERC20/ERC1155
  tokenId: z.string().optional(),          // required for ERC721/ERC1155
})

export const tokenEventSchema = z.object({
  event: z.literal('token.event.requested'),
  idempotencyKey: z.string().min(1),
  timestamp: z.string().datetime(),
  network: z.object({
    name: z.string().min(1),
    chainId: z.number().int().min(0),
  }),
  token: z.object({
    address: ethereumAddress,
    standard: z.enum(['ERC20', 'ERC721', 'ERC1155']),
  }),
  operation: z.discriminatedUnion('type', [
    z.object({ type: z.literal('mint'),    params: mintParams }),
    z.object({ type: z.literal('burn'),    params: burnParams }),
    z.object({ type: z.literal('pause') }),
    z.object({ type: z.literal('unpause') }),
  ]),
  metadata: z.object({
    requester: z.string().min(1),
    correlationId: z.string().min(1),
  }),
})

export type TokenEvent = z.infer<typeof tokenEventSchema>

export interface TokenEventResponse {
  event: 'token.event.succeeded'
  idempotencyKey: string
  timestamp: string
  network: { name: string; chainId: number }
  token: { address: string; standard: string }
  operation: { type: string }
  result: { txHash: string; blockNumber: number; gasUsed: string }
  explorer: { transactionUrl: string }
  metadata: { correlationId: string; processedBy: string; durationMs: number }
}

export interface TokenEventErrorResponse {
  event: 'token.event.failed'
  idempotencyKey: string
  timestamp: string
  network: { name: string; chainId: number }
  token: { address: string; standard: string }
  operation: { type: string }
  error: { code: string; message: string }
  metadata: { correlationId: string; processedBy: string; durationMs: number }
}
