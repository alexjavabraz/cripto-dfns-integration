import { ethers } from 'ethers'
import { getERC1155Artifact } from './artifacts.js'
import type { DfnsSigner } from '../dfns/signer.js'
import type { DeploymentResult, TokenMessage } from '../../schemas/token.schema.js'
import { logger } from '../../utils/logger.js'

type ERC1155Message = Extract<TokenMessage, { type: 'ERC1155' }>

export async function deployERC1155(
  message: ERC1155Message,
  signer: DfnsSigner,
  correlationId: string,
): Promise<DeploymentResult> {
  const { abi, bytecode } = getERC1155Artifact()
  const factory = new ethers.ContractFactory(abi, bytecode, signer)
  const uri = message.metadata.uri

  logger.info('Deploying ERC-1155 contract', {
    correlationId,
    uri,
    owner: message.ownerAddress,
    network: message.network,
  })

  // Constructor: (uri, owner)
  const contract = await factory.deploy(uri, message.ownerAddress)

  const deployTx = contract.deploymentTransaction()
  if (!deployTx) throw new Error('ERC-1155 deployment transaction not found')

  logger.info('Waiting for ERC-1155 deployment confirmation', {
    correlationId,
    txHash: deployTx.hash,
  })

  await contract.waitForDeployment()
  const contractAddress = await contract.getAddress()
  const receipt = await deployTx.wait()
  if (!receipt) throw new Error('ERC-1155 deployment receipt not found')

  logger.info('ERC-1155 deployed successfully', {
    correlationId,
    contractAddress,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
  })

  return {
    correlationId,
    type: 'ERC1155',
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
