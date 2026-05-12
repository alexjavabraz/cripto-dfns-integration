import { ethers } from 'ethers'
import { getERC20Artifact } from './artifacts.js'
import type { DfnsSigner } from '../dfns/signer.js'
import type { DeploymentResult, TokenMessage } from '../../schemas/token.schema.js'
import { logger } from '../../utils/logger.js'

type ERC20Message = Extract<TokenMessage, { type: 'ERC20' }>

export async function deployERC20(
  message: ERC20Message,
  signer: DfnsSigner,
  correlationId: string,
): Promise<DeploymentResult> {
  const { abi, bytecode } = getERC20Artifact()
  const factory = new ethers.ContractFactory(abi, bytecode, signer)

  logger.info('Deploying ERC-20 contract', {
    correlationId,
    name: message.name,
    symbol: message.symbol,
    supply: message.supply,
    decimals: message.decimals,
    owner: message.ownerAddress,
    network: message.network,
  })

  // Constructor: (name, symbol, decimals, initialSupply, owner)
  // Supply is kept as string throughout the pipeline to preserve precision beyond
  // Number.MAX_SAFE_INTEGER — convert to BigInt here for ABI encoding.
  const contract = await factory.deploy(
    message.name,
    message.symbol,
    message.decimals,
    BigInt(message.supply),
    message.ownerAddress,
  )

  const deployTx = contract.deploymentTransaction()
  if (!deployTx) throw new Error('ERC-20 deployment transaction not found')

  logger.info('Waiting for ERC-20 deployment confirmation', {
    correlationId,
    txHash: deployTx.hash,
  })

  await contract.waitForDeployment()
  const contractAddress = await contract.getAddress()
  const receipt = await deployTx.wait()
  if (!receipt) throw new Error('ERC-20 deployment receipt not found')

  logger.info('ERC-20 deployed successfully', {
    correlationId,
    contractAddress,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
  })

  return {
    correlationId,
    type: 'ERC20',
    network: message.network,
    contractAddress,
    transactionHash: deployTx.hash,
    deployedAt: new Date().toISOString(),
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.gasPrice.toString(),
    deployerAddress: receipt.from,
  }
}
