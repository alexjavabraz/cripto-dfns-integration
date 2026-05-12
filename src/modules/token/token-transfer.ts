/**
 * ERC-20 token transfer operation.
 *
 * Executes transfer(address to, uint256 amount) via the DFNS wallet.
 * The DFNS wallet must own or have operator rights on the contract (or simply
 * hold enough tokens) to perform the transfer.
 */
import { ethers } from 'ethers'
import { getDfnsClient } from '../dfns/client.js'
import { DfnsSigner } from '../dfns/signer.js'
import { getProvider, getNetworkConfig } from './networks.js'
import type { TokenTransfer } from '../../schemas/token-transfer.schema.js'

const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
]

export interface TokenTransferResult {
  txHash: string
  blockNumber: number
  gasUsed: string
}

export async function executeTokenTransfer(event: TokenTransfer): Promise<TokenTransferResult> {
  const { network, token, transfer } = event
  const { walletId } = getNetworkConfig(network)
  const provider = getProvider(network)
  const signer = new DfnsSigner(getDfnsClient(), walletId, provider)
  const contract = new ethers.Contract(token.contractAddress, ERC20_TRANSFER_ABI, signer)

  const amountWei = ethers.parseUnits(transfer.amount, token.decimals)
  const tx = await (
    contract.getFunction('transfer')(transfer.toAddress, amountWei) as Promise<ethers.TransactionResponse>
  )

  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt unavailable after confirmation')

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  }
}
