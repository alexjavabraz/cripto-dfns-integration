import { ethers } from 'ethers'
import { getProvider } from './networks.js'
import type { Network } from '../../schemas/token.schema.js' // Network is now a string alias

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]

export interface TokenBalance {
  name: string
  symbol: string
  decimals: number
  raw: string       // wei as decimal string
  formatted: string // human-readable (e.g. "1.5")
}

export async function getERC20Balance(
  network: Network,
  tokenAddress: string,
  walletAddress: string,
): Promise<TokenBalance> {
  const provider = getProvider(network)
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

  const [name, symbol, decimals, raw] = await Promise.all([
    contract.getFunction('name')() as Promise<string>,
    contract.getFunction('symbol')() as Promise<string>,
    contract.getFunction('decimals')() as Promise<bigint>,
    contract.getFunction('balanceOf')(walletAddress) as Promise<bigint>,
  ])

  const decimalsNum = Number(decimals)
  return {
    name,
    symbol,
    decimals: decimalsNum,
    raw: raw.toString(),
    formatted: ethers.formatUnits(raw, decimalsNum),
  }
}
