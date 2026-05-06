import { z } from 'zod'

export const TokenType = z.enum(['ERC20', 'ERC721', 'ERC1155'])
export type TokenType = z.infer<typeof TokenType>

export const Network = z.enum(['ethereum', 'polygon', 'arbitrum'])
export type Network = z.infer<typeof Network>

const ethereumAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

const tokenUri = z
  .string()
  .url()
  .max(2048)
  .optional()

// ERC-20 specific fields
const erc20Fields = z.object({
  name: z.string().min(1).max(64),
  symbol: z.string().min(1).max(11).toUpperCase(),
  decimals: z.number().int().min(0).max(18).default(18),
  supply: z.number().positive().int().max(Number.MAX_SAFE_INTEGER),
  ownerAddress: ethereumAddress,
})

// ERC-721 specific fields
const erc721Fields = z.object({
  name: z.string().min(1).max(64),
  symbol: z.string().min(1).max(11).toUpperCase(),
  ownerAddress: ethereumAddress,
  metadata: z.object({ uri: tokenUri }).optional(),
})

// ERC-1155 specific fields
const erc1155Fields = z.object({
  ownerAddress: ethereumAddress,
  metadata: z.object({ uri: z.string().url().max(2048) }),
})

const baseFields = z.object({
  idempotencyKey: z.string().min(1),
  timestamp: z.string().datetime(),
  network: Network,
  correlationId: z.string().uuid().optional(),
})

// Discriminated union based on token type
export const tokenMessageSchema = z.discriminatedUnion('type', [
  baseFields.extend({ type: z.literal('ERC20') }).merge(erc20Fields),
  baseFields.extend({ type: z.literal('ERC721') }).merge(erc721Fields),
  baseFields.extend({ type: z.literal('ERC1155') }).merge(erc1155Fields),
])

export type TokenMessage = z.infer<typeof tokenMessageSchema>

export interface DeploymentResult {
  correlationId: string
  type: TokenType
  network: Network
  contractAddress: string
  transactionHash: string
  deployedAt: string
  blockNumber: number
  gasUsed: string
  effectiveGasPrice: string
  deployerAddress: string
}
