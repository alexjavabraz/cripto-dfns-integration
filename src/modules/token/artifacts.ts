/**
 * Loads compiled contract artifacts from the Hardhat artifacts directory.
 * Run `npm run compile:contracts` before starting the application.
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import type { InterfaceAbi } from 'ethers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export interface ContractArtifact {
  abi: InterfaceAbi
  bytecode: string
}

function loadArtifact(contractName: string): ContractArtifact {
  // Artifacts are at project root/artifacts/contracts/<Name>.sol/<Name>.json
  const artifactPath = path.resolve(
    __dirname,
    '../../../artifacts/contracts',
    `${contractName}.sol`,
    `${contractName}.json`,
  )

  const raw = require(artifactPath) as { abi: InterfaceAbi; bytecode: string }
  return { abi: raw.abi, bytecode: raw.bytecode }
}

export function getERC20Artifact(): ContractArtifact {
  return loadArtifact('ERC20Token')
}

export function getERC721Artifact(): ContractArtifact {
  return loadArtifact('ERC721Token')
}

export function getERC1155Artifact(): ContractArtifact {
  return loadArtifact('ERC1155Token')
}
