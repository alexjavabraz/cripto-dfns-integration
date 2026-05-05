# dfns_integration

A production-ready service that listens to RabbitMQ queues and deploys ERC-20, ERC-721, and ERC-1155 smart contracts on EVM networks using [DFNS](https://www.dfns.co) MPC wallets for signing.

## Overview

```
RabbitMQ                   dfns_integration              Blockchain
─────────────────────      ──────────────────────────    ──────────────
token_creation_request ──► validate → sign via DFNS ──► deploy contract
                                        │
                           ┌────────────┴────────────┐
                           ▼                         ▼
                     token_created           token_creation_error
                     (exchange)              (exchange)
```

## Features

- Consumes `token_creation_request` queue with full idempotency support
- Deploys ERC-20, ERC-721, and ERC-1155 contracts using DFNS MPC wallets
- Publishes results to `token_created` / `token_creation_error` topic exchanges
- Legacy `token.create` queue support (simple format)
- Structured JSON logging, Sentry error tracking, rate limiting, security headers
- Health check endpoint at `GET /health`

## Prerequisites

- Node.js >= 22
- RabbitMQ instance
- DFNS service account with a pre-created wallet
- Ethereum-compatible RPC endpoint

## Setup

```bash
cp .env.example .env
# Fill in the values
npm install
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` |
| `PORT` | HTTP port (default: 3000) |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `DFNS_API_URL` | DFNS API base URL (e.g. `https://api.dfns.io`) |
| `DFNS_ORG_ID` | DFNS organization ID (`or-...`) |
| `DFNS_AUTH_TOKEN` | DFNS service account JWT |
| `DFNS_CRED_ID` | DFNS credential ID (base64 encoded) |
| `DFNS_PRIVATE_KEY` | RSA private key (PEM format) |
| `RPC_ETHEREUM` | Ethereum RPC endpoint |
| `RPC_POLYGON` | Polygon RPC endpoint |
| `RPC_ARBITRUM` | Arbitrum RPC endpoint |
| `DFNS_WALLET_ETHEREUM` | Pre-created DFNS wallet ID for Ethereum |
| `DFNS_WALLET_POLYGON` | Pre-created DFNS wallet ID for Polygon |
| `DFNS_WALLET_ARBITRUM` | Pre-created DFNS wallet ID for Arbitrum |
| `RABBITMQ_URL` | RabbitMQ connection URL |
| `RABBITMQ_QUEUE` | Legacy queue name (default: `token.create`) |
| `RABBITMQ_PREFETCH` | Consumer prefetch count (default: 1) |
| `RABBITMQ_CREATION_QUEUE` | Creation request queue (default: `token_creation_request`) |
| `RABBITMQ_CREATED_EXCHANGE` | Success exchange (default: `token_created`) |
| `RABBITMQ_ERROR_EXCHANGE` | Error exchange (default: `token_creation_error`) |
| `SENTRY_DSN` | Sentry DSN for error tracking |

## RabbitMQ

### Queues & Exchanges

| Name | Type | Direction |
|---|---|---|
| `token_creation_request` | queue | input |
| `token.create` | queue | input (legacy) |
| `token_created` | topic exchange | output (success) |
| `token_creation_error` | topic exchange | output (error) |

### Input Message — `token_creation_request`

```json
{
  "event": "token.creation.requested",
  "idempotencyKey": "unique-key-001",
  "timestamp": "2026-05-05T20:00:00.000Z",
  "network": {
    "name": "ethereum",
    "chainId": 11155111
  },
  "token": {
    "standard": "ERC20",
    "name": "My Token",
    "symbol": "MTK",
    "ownerAddress": "0xYourAddress"
  },
  "params": {
    "erc20": {
      "decimals": 18,
      "supply": 1000000
    }
  },
  "metadata": {
    "requester": "my-service",
    "correlationId": "corr-001"
  }
}
```

`network.name` must be one of: `ethereum`, `polygon`, `arbitrum`.

`token.standard` must be one of: `ERC20`, `ERC721`, `ERC1155`.

### Output Message — `token_created` (routing key: `token.creation.succeeded`)

```json
{
  "event": "token.creation.succeeded",
  "idempotencyKey": "unique-key-001",
  "timestamp": "2026-05-05T20:00:05.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": {
    "standard": "ERC20",
    "name": "My Token",
    "symbol": "MTK",
    "contractAddress": "0xABC..."
  },
  "deployment": {
    "contractAddress": "0xABC...",
    "transactionHash": "0xDEF...",
    "blockNumber": 12345678,
    "deployerAddress": "0xWALLET...",
    "gasUsed": "1234567",
    "effectiveGasPrice": "1000000000"
  },
  "explorer": {
    "transactionUrl": "https://sepolia.etherscan.io/tx/0xDEF...",
    "contractUrl": "https://sepolia.etherscan.io/address/0xABC..."
  },
  "metadata": {
    "correlationId": "corr-001",
    "processedBy": "dfns-integration",
    "durationMs": 4800
  }
}
```

### Output Message — `token_creation_error` (routing key: `token.creation.failed`)

```json
{
  "event": "token.creation.failed",
  "idempotencyKey": "unique-key-001",
  "timestamp": "2026-05-05T20:00:02.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": { "standard": "ERC20", "name": "My Token", "symbol": "MTK" },
  "error": {
    "code": "DEPLOYMENT_FAILED",
    "message": "...",
    "retryable": false
  },
  "metadata": {
    "correlationId": "corr-001",
    "processedBy": "dfns-integration",
    "durationMs": 1200
  }
}
```

#### Error codes

| Code | Cause | Retryable |
|---|---|---|
| `VALIDATION_ERROR` | Invalid message schema | No |
| `DUPLICATE_REQUEST` | `idempotencyKey` already processed | No |
| `DEPLOYMENT_FAILED` | Contract deployment or DFNS error | No |
| `NETWORK_ERROR` | RPC connection issues | Yes |
| `UNKNOWN_ERROR` | Catch-all | No |

## Docker

```bash
# Build
docker build -t dfns-integration .

# Run
docker run --env-file .env -p 3000:3000 dfns-integration
```

## Development

```bash
npm run dev              # Start with tsx watch (hot reload)
npm run build            # Compile TypeScript
npm run compile:contracts # Compile Solidity contracts
npm run lint             # ESLint
npm run format           # Prettier
npx tsc --noEmit         # Type check only
```

## Architecture

```
src/
  server.ts              # Entry point — Sentry, Fastify, RabbitMQ consumers
  app.ts                 # Fastify app — health check, rate limit, helmet
  config/
    env.ts               # Zod environment validation
    sentry.ts            # Sentry init + captureError/captureMessage helpers
  schemas/
    token.schema.ts      # Legacy TokenMessage discriminated union
    creation-request.schema.ts  # CreationRequestMessage, success/error events
  modules/
    dfns/
      client.ts          # DfnsApiClient singleton
      signer.ts          # DfnsSigner — ethers AbstractSigner backed by DFNS
    rabbitmq/
      connection.ts      # connect/disconnect, queue/exchange setup
      consumer.ts        # Legacy token.create consumer (retry + DLX)
      creation-consumer.ts  # token_creation_request consumer
      publisher.ts       # publishSuccess / publishError to exchanges
    token/
      artifacts.ts       # Load Hardhat artifacts at runtime
      networks.ts        # Network config + provider cache
      processor.ts       # processTokenMessage — orchestrates deployment
      erc20.ts           # deployERC20
      erc721.ts          # deployERC721
      erc1155.ts         # deployERC1155
  utils/
    logger.ts            # Structured JSON logger
    correlation.ts       # newCorrelationId, sanitizePayload
contracts/
  ERC20Token.sol
  ERC721Token.sol
  ERC1155Token.sol
artifacts/               # Pre-compiled Hardhat artifacts (committed)
```
