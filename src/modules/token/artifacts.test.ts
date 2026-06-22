import { describe, it, expect } from 'vitest'
import { getERC20Artifact, getERC721Artifact, getERC1155Artifact } from './artifacts.js'

describe('getERC20Artifact', () => {
  it('returns an artifact with abi and bytecode', () => {
    const artifact = getERC20Artifact()
    expect(artifact).toBeDefined()
    expect(Array.isArray(artifact.abi)).toBe(true)
    expect(artifact.abi.length).toBeGreaterThan(0)
    expect(typeof artifact.bytecode).toBe('string')
    expect(artifact.bytecode.length).toBeGreaterThan(0)
  })

  it('returns consistent results on repeated calls', () => {
    const a1 = getERC20Artifact()
    const a2 = getERC20Artifact()
    expect(a1.abi).toEqual(a2.abi)
    expect(a1.bytecode).toBe(a2.bytecode)
  })
})

describe('getERC721Artifact', () => {
  it('returns an artifact with abi and bytecode', () => {
    const artifact = getERC721Artifact()
    expect(artifact).toBeDefined()
    expect(Array.isArray(artifact.abi)).toBe(true)
    expect(artifact.abi.length).toBeGreaterThan(0)
    expect(typeof artifact.bytecode).toBe('string')
    expect(artifact.bytecode.length).toBeGreaterThan(0)
  })
})

describe('getERC1155Artifact', () => {
  it('returns an artifact with abi and bytecode', () => {
    const artifact = getERC1155Artifact()
    expect(artifact).toBeDefined()
    expect(Array.isArray(artifact.abi)).toBe(true)
    expect(artifact.abi.length).toBeGreaterThan(0)
    expect(typeof artifact.bytecode).toBe('string')
    expect(artifact.bytecode.length).toBeGreaterThan(0)
  })
})
