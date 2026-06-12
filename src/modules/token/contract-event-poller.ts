import { ethers } from 'ethers'
import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'

const TRANSFER_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)']

const RPC_MAP: Record<string, string> = {
  ethereumsepolia: env.ETHEREUM_SEPOLIA_RPC,
  ethereum:        'https://eth.llamarpc.com',
  polygon:         'https://polygon-rpc.com',
  polygonamoy:     'https://rpc-amoy.polygon.technology',
  arbitrum:        'https://arb1.arbitrum.io/rpc',
  base:            'https://mainnet.base.org',
  bsc:             'https://bsc-dataseed.binance.org',
}

interface WatchedContract {
  network: string
  contractAddress: string
  rpcUrl: string
}

function parseWatchedContracts(): WatchedContract[] {
  if (!env.WATCHED_CONTRACTS) return []
  return env.WATCHED_CONTRACTS
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .flatMap((s): WatchedContract[] => {
      const colonIdx = s.indexOf(':')
      if (colonIdx === -1) return []
      const network = s.slice(0, colonIdx).toLowerCase()
      const contractAddress = s.slice(colonIdx + 1).toLowerCase()
      const rpcUrl = RPC_MAP[network]
      if (!rpcUrl || !/^0x[0-9a-f]{40}$/.test(contractAddress)) return []
      return [{ network, contractAddress, rpcUrl }]
    })
}

function startPollerForContract(channel: amqplib.Channel, wc: WatchedContract): void {
  const provider = new ethers.JsonRpcProvider(wc.rpcUrl)
  const contract = new ethers.Contract(wc.contractAddress, TRANSFER_ABI, provider)
  let lastBlock: number | null = null

  const poll = async (): Promise<void> => {
    try {
      const current = await provider.getBlockNumber()
      if (lastBlock === null) {
        // First poll: record position only, don't replay old events
        lastBlock = current
        logger.info(
          { event: 'poller.initialized', network: wc.network, contractAddress: wc.contractAddress, startBlock: current },
          'Contract event poller initialized',
        )
        return
      }
      if (current <= lastBlock) return

      const fromBlock = lastBlock + 1
      // Process at most 50 blocks per tick to avoid large eth_getLogs responses
      const toBlock = Math.min(current, lastBlock + 50)
      lastBlock = toBlock

      const filter = contract.filters['Transfer']?.()
      if (!filter) return
      const events = await contract.queryFilter(filter, fromBlock, toBlock)

      for (const raw of events) {
        if (!('transactionHash' in raw) || !('args' in raw) || !raw.args) continue
        const e = raw as ethers.EventLog
        const payload = {
          event:           'external.transfer',
          txHash:          e.transactionHash,
          blockNumber:     e.blockNumber,
          contractAddress: wc.contractAddress,
          network:         wc.network,
          from:            (e.args[0] as string).toLowerCase(),
          to:              (e.args[1] as string).toLowerCase(),
          amountRaw:       (e.args[2] as bigint).toString(),
        }
        channel.publish(
          env.EXCHANGE_EXTERNAL_TRANSFER,
          'external.transfer',
          Buffer.from(JSON.stringify(payload)),
          { persistent: true },
        )
        logger.info(
          { event: 'poller.transfer_published', txHash: payload.txHash, from: payload.from, to: payload.to, network: wc.network },
          'External Transfer event published to RabbitMQ',
        )
      }

      if (events.length > 0) {
        logger.debug(
          { event: 'poller.blocks_processed', fromBlock, toBlock, count: events.length, network: wc.network },
          'Processed blocks',
        )
      }
    } catch (err) {
      captureError(err, { context: 'contract-event-poller:poll', network: wc.network, contractAddress: wc.contractAddress })
      logger.error(
        { err, event: 'poller.error', network: wc.network, contractAddress: wc.contractAddress },
        'Contract event poller error — will retry next tick',
      )
    }
  }

  void poll()
  setInterval((): void => { void poll() }, env.BLOCK_POLL_INTERVAL_MS)
  logger.info(
    { event: 'poller.started', network: wc.network, contractAddress: wc.contractAddress, intervalMs: env.BLOCK_POLL_INTERVAL_MS },
    'Contract event poller started',
  )
}

export function startContractEventPoller(channel: amqplib.Channel): void {
  const contracts = parseWatchedContracts()
  if (contracts.length === 0) {
    logger.info({ event: 'poller.disabled' }, 'WATCHED_CONTRACTS not set — contract event poller disabled')
    return
  }
  for (const wc of contracts) {
    startPollerForContract(channel, wc)
  }
}
