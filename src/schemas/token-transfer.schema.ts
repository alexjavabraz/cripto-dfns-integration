import { z } from 'zod'

const ethereumAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

export const tokenTransferSchema = z.object({
  event: z.literal('token.transfer.requested'),
  idempotencyKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  requester: z.object({
    userId: z.string().min(1),
    email: z.string().optional(),
    ip: z.string().optional(),
  }),
  network: z.string().min(1),
  token: z.object({
    contractAddress: ethereumAddress,
    decimals: z.number().int().min(0).default(18),
  }),
  transfer: z.object({
    toAddress: ethereumAddress,
    amount: z.string().min(1), // display amount, e.g. "10.5"
  }),
  metadata: z.object({
    correlationId: z.string().optional(),
  }).optional(),
})

export type TokenTransfer = z.infer<typeof tokenTransferSchema>

export interface TokenTransferSuccessResponse {
  event: 'token.transfer.succeeded'
  idempotencyKey: string
  timestamp: string
  network: string
  requester: { userId: string; email?: string; ip?: string }
  token: { contractAddress: string; decimals: number }
  transfer: { toAddress: string; amount: string }
  result: { txHash: string; blockNumber: number; gasUsed: string }
  metadata: { correlationId?: string; processedBy: string; durationMs: number }
}

export interface TokenTransferErrorResponse {
  event: 'token.transfer.failed'
  idempotencyKey: string
  timestamp: string
  network: string
  requester: { userId: string; email?: string; ip?: string }
  token: { contractAddress: string; decimals: number }
  transfer: { toAddress: string; amount: string }
  error: { code: string; message: string }
  metadata: { correlationId?: string; processedBy: string; durationMs: number }
}
