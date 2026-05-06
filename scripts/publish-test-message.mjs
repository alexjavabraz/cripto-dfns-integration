#!/usr/bin/env node
/**
 * Publishes a test token deployment message to RabbitMQ.
 *
 * Usage:
 *   node scripts/publish-test-message.mjs [type] [network]
 *
 * Examples:
 *   node scripts/publish-test-message.mjs
 *   node scripts/publish-test-message.mjs ERC721 polygon
 *   node scripts/publish-test-message.mjs ERC1155 arbitrum
 *
 * Env vars read from .env file (RABBITMQ_URL, RABBITMQ_QUEUE).
 */

import amqplib from 'amqplib'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

// --- Load .env manually (no dotenv dependency needed here) ---
function loadEnv() {
  const env = {}
  try {
    const lines = readFileSync('.env', 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
  } catch {
    // fall through — use process.env
  }
  return { ...process.env, ...env }
}

const env = loadEnv()
const RABBITMQ_URL = env.RABBITMQ_URL || 'amqp://localhost'
const QUEUE = env.RABBITMQ_QUEUE || 'token.create'

// --- Message templates ---
const OWNER = '0x6d5dad0641990e5902723647c7ec33eb4020e7c7'

const type = (process.argv[2] || 'ERC20').toUpperCase()
const network = (process.argv[3] || 'ethereum').toLowerCase()

const messages = {
  ERC20: {
    type: 'ERC20',
    network,
    correlationId: randomUUID(),
    name: 'Test Token',
    symbol: 'TST',
    decimals: 18,
    supply: 1_000_000,
    ownerAddress: OWNER,
  },
  ERC721: {
    type: 'ERC721',
    network,
    correlationId: randomUUID(),
    name: 'Test NFT',
    symbol: 'TNFT',
    ownerAddress: OWNER,
    metadata: { uri: 'https://example.com/metadata/{id}.json' },
  },
  ERC1155: {
    type: 'ERC1155',
    network,
    correlationId: randomUUID(),
    ownerAddress: OWNER,
    metadata: { uri: 'https://example.com/metadata/{id}.json' },
  },
}

const message = messages[type]
if (!message) {
  console.error(`Unknown type: ${type}. Use ERC20, ERC721 or ERC1155.`)
  process.exit(1)
}

console.log(`\nPublishing to queue: ${QUEUE}`)
console.log(`Payload:\n${JSON.stringify(message, null, 2)}\n`)

const conn = await amqplib.connect(RABBITMQ_URL)
const channel = await conn.createChannel()

channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)), {
  persistent: true,
  contentType: 'application/json',
})

console.log('Message published successfully.')
await channel.close()
await conn.close()
