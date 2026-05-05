/**
 * DfnsSigner - ethers v6 AbstractSigner backed by a DFNS wallet.
 *
 * DFNS handles signing internally; it signs + broadcasts the transaction.
 * We use `broadcastTransaction` with kind "Eip1559" and poll for the txHash.
 *
 * Reference: https://docs.dfns.co/dfns-docs/api-docs/wallets/broadcast-transaction
 */
import { AbstractSigner, ethers } from 'ethers'
import type { DfnsApiClient } from '@dfns/sdk'
import { logger } from '../../utils/logger.js'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120_000

export class DfnsSigner extends AbstractSigner {
  private readonly dfnsClient: DfnsApiClient
  private readonly walletId: string
  private cachedAddress: string | null = null

  constructor(dfnsClient: DfnsApiClient, walletId: string, provider: ethers.Provider) {
    super(provider)
    this.dfnsClient = dfnsClient
    this.walletId = walletId
  }

  override async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress

    const wallet = await this.dfnsClient.wallets.getWallet({ walletId: this.walletId })

    if (!wallet.address) {
      throw new Error(`DFNS wallet ${this.walletId} has no address`)
    }

    this.cachedAddress = wallet.address
    return wallet.address
  }

  override async signMessage(_message: string | Uint8Array): Promise<string> {
    throw new Error('DfnsSigner: use DFNS generateSignature API for message signing')
  }

  override async signTransaction(_tx: ethers.TransactionRequest): Promise<string> {
    throw new Error('DfnsSigner: transactions are signed and broadcast atomically via DFNS')
  }

  override async signTypedData(
    _domain: ethers.TypedDataDomain,
    _types: Record<string, ethers.TypedDataField[]>,
    _value: Record<string, unknown>,
  ): Promise<string> {
    throw new Error('DfnsSigner: typed data signing not supported via this signer')
  }

  override async sendTransaction(
    tx: ethers.TransactionRequest,
  ): Promise<ethers.TransactionResponse> {
    if (!this.provider) throw new Error('DfnsSigner: provider not set')

    const provider = this.provider
    const from = await this.getAddress()

    const nonce = tx.nonce != null ? Number(tx.nonce) : await provider.getTransactionCount(from, 'pending')

    const estimatedGas = tx.gasLimit != null
      ? BigInt(tx.gasLimit.toString())
      : (await provider.estimateGas({ ...tx, from }).then((g) => (g * 12n) / 10n))

    const feeData = await provider.getFeeData()
    const maxFeePerGas: bigint =
      tx.maxFeePerGas != null
        ? BigInt(tx.maxFeePerGas.toString())
        : (feeData.maxFeePerGas ?? BigInt(0))
    const maxPriorityFeePerGas: bigint =
      tx.maxPriorityFeePerGas != null
        ? BigInt(tx.maxPriorityFeePerGas.toString())
        : (feeData.maxPriorityFeePerGas ?? BigInt(0))

    logger.info('Broadcasting Eip1559 transaction via DFNS', {
      walletId: this.walletId,
      to: typeof tx.to === 'string' ? tx.to : 'contract-creation',
    })

    // Use kind "Eip1559" — matches DFNS BroadcastTransactionBody
    const broadcast = await this.dfnsClient.wallets.broadcastTransaction({
      walletId: this.walletId,
      body: {
        kind: 'Eip1559',
        to: typeof tx.to === 'string' ? tx.to : undefined,
        data: tx.data?.toString() ?? '0x',
        value: ethers.toBeHex(tx.value != null ? BigInt(tx.value.toString()) : BigInt(0)),
        nonce,
        gasLimit: ethers.toBeHex(estimatedGas),
        maxFeePerGas: ethers.toBeHex(maxFeePerGas),
        maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
      },
    })

    logger.info('DFNS broadcast initiated', {
      dfnsTransactionId: broadcast.id,
      status: broadcast.status,
    })

    // Poll for txHash — DFNS returns "Pending" immediately
    const txHash = await this.pollForTxHash(broadcast.id)

    logger.info('DFNS transaction broadcasted on-chain', { txHash })

    const txResponse = await provider.getTransaction(txHash)
    if (!txResponse) {
      throw new Error(`Transaction ${txHash} not found on provider after DFNS broadcast`)
    }

    return txResponse
  }

  private async pollForTxHash(dfnsTxId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)

      const result = await this.dfnsClient.wallets.getTransaction({
        walletId: this.walletId,
        transactionId: dfnsTxId,
      })

      if (result.txHash) {
        return result.txHash
      }

      if (result.status === 'Failed' || result.status === 'Rejected') {
        throw new Error(
          `DFNS transaction ${dfnsTxId} ${result.status}: ${result.reason ?? 'unknown reason'}`,
        )
      }

      logger.debug('Waiting for DFNS transaction to broadcast', {
        dfnsTxId,
        status: result.status,
      })
    }

    throw new Error(`Timed out waiting for DFNS transaction ${dfnsTxId} to be broadcast`)
  }

  connect(provider: ethers.Provider): DfnsSigner {
    return new DfnsSigner(this.dfnsClient, this.walletId, provider)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
