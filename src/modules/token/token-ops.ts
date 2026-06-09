/**
 * Token admin operations — mint, burn, pause, unpause.
 *
 * Executed via the DFNS wallet (which must be the contract owner).
 * If the contract does not implement the called function, the tx will revert.
 *
 * Supported per standard (based on deployed contracts):
 *   ERC20  : mint(address,uint256)  burn(address,uint256)  pause()  unpause()
 *   ERC721 : mint(address)          burn(uint256)           pause()  unpause()
 *   ERC1155: mint(address,uint256,uint256,bytes)  burn(address,uint256,uint256)  pause()  unpause()
 */
import { ethers } from 'ethers'
import { getDfnsClient } from '../dfns/client.js'
import { DfnsSigner } from '../dfns/signer.js'
import { getProvider, getNetworkConfig } from './networks.js'
import type { TokenEvent } from '../../schemas/token-event.schema.js'

const ERC20_ABI = [
  'function mint(address to, uint256 amount)',
  'function burn(address from, uint256 amount)',
  'function pause()',
  'function unpause()',
]

const ERC721_ABI = [
  'function mint(address to) returns (uint256)',
  'function burn(uint256 tokenId)',
  'function pause()',
  'function unpause()',
]

const ERC1155_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes data)',
  'function burn(address from, uint256 id, uint256 amount)',
  'function pause()',
  'function unpause()',
]

const ABI_BY_STANDARD: Record<string, string[]> = {
  ERC20: ERC20_ABI,
  ERC721: ERC721_ABI,
  ERC1155: ERC1155_ABI,
}

export interface TokenOpResult {
  txHash: string
  blockNumber: number
  gasUsed: string
}

export async function executeTokenOperation(event: TokenEvent): Promise<TokenOpResult> {
  const { network, token, operation } = event
  const abi = ABI_BY_STANDARD[token.standard]
  if (!abi) throw new Error(`Unsupported token standard: ${token.standard}`)

  const { walletId } = getNetworkConfig(network.name)
  const provider = getProvider(network.name)
  const signer = new DfnsSigner(getDfnsClient(), walletId, provider)
  const contract = new ethers.Contract(token.address, abi, signer)

  let tx: ethers.TransactionResponse

  switch (operation.type) {
    case 'mint': {
      const { to, amount, tokenId, data } = operation.params
      if (token.standard === 'ERC721') {
        tx = await (contract.getFunction('mint')(to) as Promise<ethers.TransactionResponse>)
      } else if (token.standard === 'ERC1155') {
        if (!tokenId || !amount) throw new Error('mint on ERC1155 requires tokenId and amount')
        tx = await (contract.getFunction('mint')(
          to,
          BigInt(tokenId),
          BigInt(amount),
          data ?? '0x',
        ) as Promise<ethers.TransactionResponse>)
      } else {
        if (!amount) throw new Error('mint on ERC20 requires amount')
        tx = await (contract.getFunction('mint')(
          to,
          BigInt(amount),
        ) as Promise<ethers.TransactionResponse>)
      }
      break
    }
    case 'burn': {
      const { from, amount, tokenId } = operation.params
      if (token.standard === 'ERC721') {
        if (!tokenId) throw new Error('burn on ERC721 requires tokenId')
        tx = await (contract.getFunction('burn')(
          BigInt(tokenId),
        ) as Promise<ethers.TransactionResponse>)
      } else if (token.standard === 'ERC1155') {
        if (!tokenId || !amount) throw new Error('burn on ERC1155 requires tokenId and amount')
        tx = await (contract.getFunction('burn')(
          from,
          BigInt(tokenId),
          BigInt(amount),
        ) as Promise<ethers.TransactionResponse>)
      } else {
        if (!amount) throw new Error('burn on ERC20 requires amount')
        tx = await (contract.getFunction('burn')(
          from,
          BigInt(amount),
        ) as Promise<ethers.TransactionResponse>)
      }
      break
    }
    case 'pause':
      tx = await (contract.getFunction('pause')() as Promise<ethers.TransactionResponse>)
      break
    case 'unpause':
      tx = await (contract.getFunction('unpause')() as Promise<ethers.TransactionResponse>)
      break
  }

  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt unavailable after confirmation')

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  }
}
