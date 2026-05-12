import { z } from 'zod'

const ethereumAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

export const balanceRequestSchema = z.object({
  event: z.literal('token.balance.requested'),
  idempotencyKey: z.string().min(1),
  timestamp: z.string().datetime(),
  network: z.object({
    name: z.string().min(1),
    chainId: z.number().int().min(0),
  }),
  token: z.object({
    address: ethereumAddress,
    // Required for ERC-1155 (balanceOf requires token ID)
    tokenId: z.string().optional(),
  }),
  wallet: z.object({
    address: ethereumAddress,
  }),
  metadata: z.object({
    requester: z.string().min(1),
    correlationId: z.string().min(1),
  }),
})

export type BalanceRequest = z.infer<typeof balanceRequestSchema>

export interface BalanceResponse {
  event: 'token.balance.responded'
  idempotencyKey: string
  timestamp: string
  network: { name: string; chainId: number }
  token: { address: string; name: string; symbol: string; decimals: number }
  wallet: { address: string }
  balance: { raw: string; formatted: string }
  metadata: { correlationId: string; processedBy: string; durationMs: number }
}

export interface BalanceErrorResponse {
  event: 'token.balance.failed'
  idempotencyKey: string
  timestamp: string
  network: { name: string; chainId: number }
  error: { code: string; message: string }
  metadata: { correlationId: string; processedBy: string; durationMs: number }
}
