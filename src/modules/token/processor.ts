import { getDfnsClient } from '../dfns/client.js'
import { DfnsSigner } from '../dfns/signer.js'
import { getProvider, getNetworkConfig } from './networks.js'
import { deployERC20 } from './erc20.js'
import { deployERC721 } from './erc721.js'
import { deployERC1155 } from './erc1155.js'
import { tokenMessageSchema, type DeploymentResult } from '../../schemas/token.schema.js'
import { captureError, captureMessage } from '../../config/sentry.js'
import { logger } from '../../utils/logger.js'
import { newCorrelationId, sanitizePayload } from '../../utils/correlation.js'

export async function processTokenMessage(rawPayload: unknown): Promise<DeploymentResult> {
  const correlationId = newCorrelationId()

  // --- Validate input (OWASP A03: Injection prevention) ---
  const parsed = tokenMessageSchema.safeParse(rawPayload)
  if (!parsed.success) {
    const issues = parsed.error.flatten()
    logger.warn('Invalid token message received', { correlationId, issues })
    captureMessage('Invalid RabbitMQ payload', 'warning', { correlationId, issues })
    throw new Error(`Invalid token message: ${JSON.stringify(issues)}`)
  }

  const message = { ...parsed.data, correlationId: parsed.data.correlationId ?? correlationId }
  const safePayload = sanitizePayload(message as unknown as Record<string, unknown>)

  logger.info('Processing token deployment', safePayload)
  captureMessage('Token deployment started', 'info', safePayload)

  try {
    const dfnsClient = getDfnsClient()
    const { walletId } = getNetworkConfig(message.network)
    const provider = getProvider(message.network)
    const signer = new DfnsSigner(dfnsClient, walletId, provider)

    let result: DeploymentResult

    switch (message.type) {
      case 'ERC20':
        result = await deployERC20(message, signer, correlationId)
        break
      case 'ERC721':
        result = await deployERC721(message, signer, correlationId)
        break
      case 'ERC1155':
        result = await deployERC1155(message, signer, correlationId)
        break
    }

    const { explorerUrl } = getNetworkConfig(message.network)
    captureMessage('Token deployment succeeded', 'info', {
      correlationId,
      contractAddress: result.contractAddress,
      txHash: result.transactionHash,
      type: result.type,
      network: result.network,
      explorerContractUrl: `${explorerUrl}/address/${result.contractAddress}`,
      explorerTxUrl: `${explorerUrl}/tx/${result.transactionHash}`,
    })

    return result
  } catch (error) {
    logger.error('Token deployment failed', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      errorDetail: error instanceof Error && 'httpStatus' in error
        ? { httpStatus: (error as unknown as { httpStatus: number }).httpStatus, context: (error as unknown as { context: unknown }).context }
        : undefined,
    })
    captureError(error, { correlationId, payload: safePayload })
    throw error
  }
}
