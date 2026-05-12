import { z } from 'zod'

export const accountCreateSchema = z.object({
  event: z.literal('account.create.requested'),
  idempotencyKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  network: z.string().default('EthereumSepolia'),
})

export type AccountCreate = z.infer<typeof accountCreateSchema>

export interface AccountCreateSuccessResponse {
  event: 'account.create.succeeded'
  userId: string
  idempotencyKey: string
  wallet: { id: string; network: string; address: string }
  timestamp: string
  metadata: { processedBy: string; durationMs: number }
}

export interface AccountCreateErrorResponse {
  event: 'account.create.failed'
  userId: string
  idempotencyKey: string
  error: { code: string; message: string }
  timestamp: string
  metadata: { processedBy: string; durationMs: number }
}
