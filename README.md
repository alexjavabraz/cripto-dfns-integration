# dfns_integration

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13291/badge)](https://www.bestpractices.dev/projects/13291)
[![CI](https://github.com/alexjavabraz/cripto-dfns-integration/actions/workflows/ci.yml/badge.svg)](https://github.com/alexjavabraz/cripto-dfns-integration/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**dfns-integration** is a backend service that automates the creation and management of blockchain tokens. It receives requests from an internal message queue, deploys smart contracts on Ethereum-compatible networks, and signs transactions securely without ever storing private keys — signing is delegated to [DFNS](https://www.dfns.co), a cloud-based cryptographic key management service.

In plain terms: when another service in the platform needs to issue a new digital token (or transfer, mint, or burn an existing one), it sends a message to this service, which handles the blockchain interaction and reports back the result.

> **Technical summary:** Consumes RabbitMQ queues → deploys ERC-20/721/1155 smart contracts on EVM networks → signs transactions via DFNS MPC wallets → publishes results to response exchanges.

## Platform

This service is part of a full-stack tokenization platform. Explore the live environment:

| Component | URL | Description |
|---|---|---|
| Dashboard | [tokeniza.net](https://tokeniza.net) | User-facing interface — token operations, FIAT ↔ token conversions, transfers |
| Developer Portal | [developers.tokeniza.online](https://developers.tokeniza.online) | CaaS API access, onboarding, and API key management |

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
| `QUEUE_GET_BALANCE` | Queue for balance query requests (default: `queue_get_balance`) |
| `EXCHANGE_BALANCE_RESPONSE` | Exchange for balance query responses (default: `balance_response`) |
| `TOKEN_EVENT` | Exchange for token admin operations — mint, burn, pause, unpause (default: `token_event`) |
| `EXCHANGE_TOKEN_EVENT_RESPONSE` | Exchange for token event results (default: `token_event_response`) |
| `SENTRY_DSN` | Sentry DSN for error tracking |

## RabbitMQ

### Queues & Exchanges

| Name | Type | Direction |
|---|---|---|
| `token_creation_request` | queue | input |
| `token.create` | queue | input (legacy) |
| `token_created` | topic exchange | output (success) |
| `token_creation_error` | topic exchange | output (error) |
| `queue_get_balance` | queue | input — balance query requests |
| `balance_response` | topic exchange | output — balance query responses |
| `token_event` | topic exchange | input — token admin operations (subscribe) |
| `token_event.queue` | queue (bound to `token_event` `#`) | internal consumer queue |
| `token_event_response` | topic exchange | output — token operation results |

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

---

### Balance Query — `queue_get_balance`

Queries an ERC-20 token balance for a given wallet address directly from the RPC node. No DFNS wallet required. Result is published to the `balance_response` exchange.

**Request** (routing key: `token.balance.requested`)

```json
{
  "event": "token.balance.requested",
  "idempotencyKey": "bal-001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": {
    "name": "ethereum",
    "chainId": 11155111
  },
  "token": {
    "address": "0xTokenContractAddress"
  },
  "wallet": {
    "address": "0xWalletAddress"
  },
  "metadata": {
    "requester": "my-service",
    "correlationId": "corr-bal-001"
  }
}
```

**Response — success** (routing key: `token.balance.responded`)

```json
{
  "event": "token.balance.responded",
  "idempotencyKey": "bal-001",
  "timestamp": "2026-05-06T12:00:00.500Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": {
    "address": "0xTokenContractAddress",
    "name": "My Token",
    "symbol": "MTK",
    "decimals": 18
  },
  "wallet": { "address": "0xWalletAddress" },
  "balance": {
    "raw": "1000000000000000000",
    "formatted": "1.0"
  },
  "metadata": {
    "correlationId": "corr-bal-001",
    "processedBy": "dfns-integration",
    "durationMs": 210
  }
}
```

**Response — error** (routing key: `token.balance.failed`)

```json
{
  "event": "token.balance.failed",
  "idempotencyKey": "bal-001",
  "timestamp": "2026-05-06T12:00:00.500Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "error": {
    "code": "QUERY_FAILED",
    "message": "call revert exception..."
  },
  "metadata": {
    "correlationId": "corr-bal-001",
    "processedBy": "dfns-integration",
    "durationMs": 180
  }
}
```

| Balance error code | Cause |
|---|---|
| `VALIDATION_ERROR` | Invalid request schema |
| `QUERY_FAILED` | RPC call failed (wrong address, network error) |

---

### Token Admin Operations — `token_event` exchange

Publishes admin operations (mint, burn, pause, unpause) to the `token_event` topic exchange. The service binds the durable queue `token_event.queue` to it with routing key `#`. Operations are executed via the DFNS wallet (must be contract owner). Results are published to `token_event_response`.

**Request — mint ERC-20** (routing key: any)

```json
{
  "event": "token.event.requested",
  "idempotencyKey": "evt-mint-001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": {
    "address": "0xTokenContractAddress",
    "standard": "ERC20"
  },
  "operation": {
    "type": "mint",
    "params": {
      "to": "0xRecipientAddress",
      "amount": "1000000000000000000"
    }
  },
  "metadata": { "requester": "my-service", "correlationId": "corr-evt-001" }
}
```

**Request — mint ERC-721**

```json
{
  "event": "token.event.requested",
  "idempotencyKey": "evt-mint-nft-001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": { "name": "polygon", "chainId": 137 },
  "token": { "address": "0xNFTContractAddress", "standard": "ERC721" },
  "operation": {
    "type": "mint",
    "params": { "to": "0xRecipientAddress" }
  },
  "metadata": { "requester": "my-service", "correlationId": "corr-evt-002" }
}
```

**Request — burn ERC-20**

```json
{
  "event": "token.event.requested",
  "idempotencyKey": "evt-burn-001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": { "address": "0xTokenContractAddress", "standard": "ERC20" },
  "operation": {
    "type": "burn",
    "params": {
      "from": "0xHolderAddress",
      "amount": "500000000000000000"
    }
  },
  "metadata": { "requester": "my-service", "correlationId": "corr-evt-003" }
}
```

**Request — pause / unpause**

```json
{
  "event": "token.event.requested",
  "idempotencyKey": "evt-pause-001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": { "address": "0xTokenContractAddress", "standard": "ERC20" },
  "operation": { "type": "pause" },
  "metadata": { "requester": "my-service", "correlationId": "corr-evt-004" }
}
```

**Response — success** (routing key: `token.event.succeeded`)

```json
{
  "event": "token.event.succeeded",
  "idempotencyKey": "evt-mint-001",
  "timestamp": "2026-05-06T12:00:05.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": { "address": "0xTokenContractAddress", "standard": "ERC20" },
  "operation": { "type": "mint" },
  "result": {
    "txHash": "0xDEF...",
    "blockNumber": 12345679,
    "gasUsed": "55000"
  },
  "explorer": { "transactionUrl": "https://sepolia.etherscan.io/tx/0xDEF..." },
  "metadata": {
    "correlationId": "corr-evt-001",
    "processedBy": "dfns-integration",
    "durationMs": 4500
  }
}
```

**Response — error** (routing key: `token.event.failed`)

```json
{
  "event": "token.event.failed",
  "idempotencyKey": "evt-mint-001",
  "timestamp": "2026-05-06T12:00:01.000Z",
  "network": { "name": "ethereum", "chainId": 11155111 },
  "token": { "address": "0xTokenContractAddress", "standard": "ERC20" },
  "operation": { "type": "mint" },
  "error": {
    "code": "EXECUTION_FAILED",
    "message": "execution reverted: Ownable: caller is not the owner"
  },
  "metadata": {
    "correlationId": "corr-evt-001",
    "processedBy": "dfns-integration",
    "durationMs": 900
  }
}
```

| Token event error code | Cause |
|---|---|
| `VALIDATION_ERROR` | Invalid request schema |
| `EXECUTION_FAILED` | Transaction reverted or DFNS signing error |

## Testing

### Publishing test messages to RabbitMQ

Use the script `scripts/publish-test-message.mjs` to send a test deployment message directly to the queue. It reads `RABBITMQ_URL` and `RABBITMQ_QUEUE` from the `.env` file automatically.

```bash
# ERC-20 on Ethereum (default)
node scripts/publish-test-message.mjs

# ERC-721 on Polygon
node scripts/publish-test-message.mjs ERC721 polygon

# ERC-1155 on Arbitrum
node scripts/publish-test-message.mjs ERC1155 arbitrum
```

**Syntax:** `node scripts/publish-test-message.mjs [type] [network]`

| Argument | Values | Default |
|---|---|---|
| `type` | `ERC20`, `ERC721`, `ERC1155` | `ERC20` |
| `network` | `ethereum`, `polygon`, `arbitrum` | `ethereum` |

### Payload format — `token.create` queue

All messages must include `idempotencyKey` and `timestamp`. Missing fields produce an error-level Sentry event with the list of invalid fields.

**ERC-20**
```json
{
  "type": "ERC20",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": "ethereum",
  "correlationId": "a3f843a8-68c6-43ff-b819-c48ec99ed91f",
  "name": "Test Token",
  "symbol": "TST",
  "decimals": 18,
  "supply": 1000000,
  "ownerAddress": "0x6d5dad0641990e5902723647c7ec33eb4020e7c7"
}
```

**ERC-721**
```json
{
  "type": "ERC721",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": "polygon",
  "correlationId": "b4g954c9-79d7-54gg-c920-b59fd00fe02g",
  "name": "Test NFT",
  "symbol": "TNFT",
  "ownerAddress": "0x6d5dad0641990e5902723647c7ec33eb4020e7c7",
  "metadata": { "uri": "https://example.com/metadata/{id}.json" }
}
```

**ERC-1155**
```json
{
  "type": "ERC1155",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": "arbitrum",
  "correlationId": "c5h065d0-80e8-65hh-d031-c60ge11gf13h",
  "ownerAddress": "0x6d5dad0641990e5902723647c7ec33eb4020e7c7",
  "metadata": { "uri": "https://example.com/metadata/{id}.json" }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `ERC20` \| `ERC721` \| `ERC1155` | Yes | Token standard |
| `idempotencyKey` | string | Yes | Unique key to prevent duplicate deployments |
| `timestamp` | ISO 8601 datetime | Yes | Message creation time |
| `network` | `ethereum` \| `polygon` \| `arbitrum` | Yes | Target network |
| `correlationId` | UUID | No | Tracing ID (auto-generated if absent) |
| `name` | string (max 64) | ERC20/721 | Token name |
| `symbol` | string (max 11) | ERC20/721 | Token symbol |
| `decimals` | integer 0–18 | ERC20 | Decimal places (default: 18) |
| `supply` | positive integer | ERC20 | Initial total supply |
| `ownerAddress` | `0x...` (40 hex chars) | Yes | Token owner wallet address |
| `metadata.uri` | URL (max 2048) | ERC1155 | Metadata base URI |

If `idempotencyKey`, `timestamp`, or any required field is missing or invalid, the message is rejected immediately and an **error** is sent to Sentry with the list of invalid fields — the message is not retried.

The script prints the exact payload published and confirms delivery:

```
Publishing to queue: token.create
Payload:
{
  "type": "ERC20",
  "idempotencyKey": "d5be0284-00f8-4e0a-8c5c-dbd01a682480",
  "timestamp": "2026-05-06T12:00:00.000Z",
  "network": "ethereum",
  "correlationId": "a3f843a8-68c6-43ff-b819-c48ec99ed91f",
  "name": "Test Token",
  "symbol": "TST",
  "decimals": 18,
  "supply": 1000000,
  "ownerAddress": "0x6d5dad0641990e5902723647c7ec33eb4020e7c7"
}

Message published successfully.
```

### Smoke test (end-to-end on startup)

Set `SMOKE_TEST=true` to run a full end-to-end deployment test before the service accepts traffic.

The test:
1. Publishes an ERC-20 deployment request to `token_creation_request`
2. Waits for the consumer to deploy the contract via DFNS
3. Listens on `token_created` / `token_creation_error` exchanges for the result
4. If deployment succeeds → service starts normally
5. If it fails or times out (5 min) → logs the error, sends to Sentry and **exits with code 1**

Required extra env var:

| Variable | Description |
|---|---|
| `SMOKE_TEST` | Set to `true` to enable (default: disabled) |
| `TEST_OWNER_ADDRESS` | Ethereum address (`0x...`) that will own the test token — required when `SMOKE_TEST=true` |

```bash
# Run with smoke test
docker run --env-file .env -e SMOKE_TEST=true -e TEST_OWNER_ADDRESS=0xYourAddress -p 3000:3000 dfns-integration

# Or locally
SMOKE_TEST=true TEST_OWNER_ADDRESS=0xYourAddress npm run dev
```

## Docker

```bash
# Build
docker build -t dfns-integration .

# Run
docker run --env-file .env -p 3000:3000 dfns-integration
```

## CI/CD (GitHub Actions → AWS ECS Fargate)

Deployment is done by `.github/workflows/deploy-ecs.yml`:

- `push` to `main` deploys to `staging`
- Manual `workflow_dispatch` can deploy to `staging` or `production`
- AWS authentication uses GitHub OIDC (`aws-actions/configure-aws-credentials`)
- Image is built and pushed to ECR, then ECS service is updated

### Required GitHub Environment variables (staging / production)

Configure these in **GitHub Environments** (`staging` and `production`):

| Variable | Description |
|---|---|
| `AWS_ROLE_ARN` | IAM role assumed via OIDC |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `ECR_REPOSITORY` | ECR repository name |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |
| `ECS_TASK_FAMILY` | ECS task definition family prefix |
| `ECS_EXECUTION_ROLE_ARN` | ECS task execution role ARN |
| `ECS_TASK_ROLE_ARN` | ECS task role ARN |
| `ECS_LOG_GROUP` | CloudWatch logs group for container logs |
| `DFNS_API_URL` | DFNS API URL (non-secret) |
| `DFNS_ORG_ID` | DFNS organization ID (non-secret) |
| `SECRET_ARN_DFNS_AUTH_TOKEN` | Secrets Manager/SSM ARN for `DFNS_AUTH_TOKEN` |
| `SECRET_ARN_DFNS_CRED_ID` | Secrets Manager/SSM ARN for `DFNS_CRED_ID` |
| `SECRET_ARN_DFNS_PRIVATE_KEY` | Secrets Manager/SSM ARN for `DFNS_PRIVATE_KEY` |
| `SECRET_ARN_RABBITMQ_URL` | Secrets Manager/SSM ARN for `RABBITMQ_URL` |
| `SECRET_ARN_SENTRY_DSN` | Secrets Manager/SSM ARN for `SENTRY_DSN` |
| `CONTAINER_PORT` | Optional (defaults to `3000` when unset) |
| `ECS_TASK_CPU` | Optional (defaults to `512` CPU units when unset) |
| `ECS_TASK_MEMORY` | Optional (defaults to `1024` MiB when unset) |

### How to configure AWS account access from GitHub (OIDC)

1. **Create IAM OIDC provider** (once per AWS account):
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

2. **Create IAM role for GitHub Actions** (example: `github-actions-ecs-deploy`) with trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:alexjavabraz/cripto-dfns-integration:environment:staging",
            "repo:alexjavabraz/cripto-dfns-integration:environment:production"
          ]
        }
      }
    }
  ]
}
```

3. **Attach permissions policy** to this role (least privilege):
   - ECR push/pull (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`, etc.)
   - ECS deploy (`ecs:RegisterTaskDefinition`, `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`, `ecs:UpdateService`)
   - IAM pass role (`iam:PassRole`) for `ECS_EXECUTION_ROLE_ARN` and `ECS_TASK_ROLE_ARN`
   - CloudWatch logs read helpers if needed (`logs:DescribeLogGroups`)

4. **Create GitHub Environments**:
   - Repository → **Settings** → **Environments**
   - Create `staging` and `production`
   - For `production`, add required reviewers (manual approval)

5. **Add GitHub Environment variables**:
   - Environment → **Variables** → **New variable**
   - Add all entries from table above (`AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, etc.)
   - `AWS_ROLE_ARN` must be the role created in step 2

6. **Store sensitive values in AWS Secrets Manager or SSM Parameter Store**:
   - Create one secret/parameter per sensitive value (DFNS, RabbitMQ, Sentry)
   - Put their ARNs in GitHub environment variables:
     - `SECRET_ARN_DFNS_AUTH_TOKEN`
     - `SECRET_ARN_DFNS_CRED_ID`
     - `SECRET_ARN_DFNS_PRIVATE_KEY`
     - `SECRET_ARN_RABBITMQ_URL`
     - `SECRET_ARN_SENTRY_DSN`

7. **Run deployment**:
   - `push` to `main` deploys `staging`
   - Manual: Actions → **Deploy to ECS** → **Run workflow** → choose `staging` or `production`

### Reliability recommendations

- Set `production` environment with required reviewers (manual approval gate)
- Keep ECS service deployment circuit breaker enabled with rollback
- Keep ECS service desired count `>= 1`
- Use ALB/NLB health checks against `/health` when exposed

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
