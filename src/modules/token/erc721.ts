import { ethers } from 'ethers'
import { getERC721Artifact } from './artifacts.js'
import type { DfnsSigner } from '../dfns/signer.js'
import type { DeploymentResult, TokenMessage } from '../../schemas/token.schema.js'
import { logger } from '../../utils/logger.js'

type ERC721Message = Extract<TokenMessage, { type: 'ERC721' }>

export async function deployERC721(
  message: ERC721Message,
  signer: DfnsSigner,
  correlationId: string,
): Promise<DeploymentResult> {
  const { abi, bytecode } = getERC721Artifact()
  const factory = new ethers.ContractFactory(abi, bytecode, signer)
  const baseURI = message.metadata?.uri ?? ''

  logger.info('Deploying ERC-721 contract', {
    correlationId,
    name: message.name,
    symbol: message.symbol,
    baseURI,
    owner: message.ownerAddress,
    network: message.network,
  })

  // Constructor: (name, symbol, baseURI, owner)
  const contract = await factory.deploy(
    message.name,
    message.symbol,
    baseURI,
    message.ownerAddress,
  )

  const deployTx = contract.deploymentTransaction()
  if (!deployTx) throw new Error('ERC-721 deployment transaction not found')

  logger.info('Waiting for ERC-721 deployment confirmation', {
    correlationId,
    txHash: deployTx.hash,
  })

  await contract.waitForDeployment()
  const contractAddress = await contract.getAddress()
  const receipt = await deployTx.wait()
  if (!receipt) throw new Error('ERC-721 deployment receipt not found')

  logger.info('ERC-721 deployed successfully', {
    correlationId,
    contractAddress,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
  })

  return {
    correlationId,
    type: 'ERC721',
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
