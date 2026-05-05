# GitHub Copilot Instructions — dfns_integration

## Project Context

This is a **Node.js/TypeScript** service that deploys ERC-20, ERC-721, and ERC-1155 smart contracts on EVM networks using **DFNS MPC wallets** as the signing layer. Messages are consumed from **RabbitMQ** queues and results are published to exchanges. Private keys never exist in this service — all signing is delegated to DFNS.

## Language & Stack

- **TypeScript 5.x** strict mode, Node16 module resolution, ESM (`"type": "module"`)
- **Fastify v5**, **amqplib**, **ethers v6**, **@dfns/sdk v0.8.x**, **Zod**, **@sentry/node v8**
- **Node.js >= 22**

## Code Style Rules

- Always use TypeScript — no `any`, no `// @ts-ignore`
- Use `z.object()` Zod schemas for all external input validation (OWASP A03)
- Use `unknown` instead of `any` in catch blocks
- Prefer `const` over `let`; never use `var`
- All async functions must handle errors explicitly — no silent swallows
- Always use structured logging via `logger` (never `console.log`)
- Always call `captureError()` for unexpected errors
- Use `.js` extensions in all imports (ESM requirement)
- File names: `kebab-case.ts`

## Security — OWASP Top 10 Checklist

When reviewing any PR, verify the following:

### A01 — Broken Access Control
- [ ] No hardcoded wallet IDs, private keys, or tokens in code
- [ ] All sensitive config comes from `env.ts` (Zod-validated environment variables)
- [ ] No credentials exposed in logs (use `sanitizePayload()`)

### A02 — Cryptographic Failures
- [ ] Private keys read only from environment, never logged or serialized
- [ ] No custom cryptography — use DFNS SDK for all signing
- [ ] HTTPS enforced for all external API calls

### A03 — Injection
- [ ] All RabbitMQ message payloads validated with Zod before use
- [ ] No dynamic code execution (`eval`, `Function()`, etc.)
- [ ] No template literals used to build SQL/shell/OS commands

### A04 — Insecure Design
- [ ] Idempotency enforced via `idempotencyKey` to prevent duplicate deployments
- [ ] Error messages do not expose internal stack traces to external consumers
- [ ] Dead-letter queues configured for unprocessable messages

### A05 — Security Misconfiguration
- [ ] Fastify helmet enabled (`@fastify/helmet`)
- [ ] Rate limiting configured (`@fastify/rate-limit`)
- [ ] No secrets committed (`.env`, `.env.test` are in `.gitignore`)
- [ ] Docker runs as non-root user

### A06 — Vulnerable and Outdated Components
- [ ] `npm audit` passes at `--audit-level=high`
- [ ] No dependencies with known critical CVEs
- [ ] DFNS SDK kept up to date

### A07 — Identification and Authentication Failures
- [ ] DFNS auth token validated on startup (not hardcoded)
- [ ] Service account credentials never exposed in error responses
- [ ] RabbitMQ URL credentials redacted in logs

### A08 — Software and Data Integrity Failures
- [ ] No `npm install` without lockfile in Docker (`npm ci` only)
- [ ] Contract artifacts committed and verified — not downloaded at runtime

### A09 — Security Logging and Monitoring Failures
- [ ] All errors sent to Sentry with context (`captureError`)
- [ ] Validation failures logged as warnings with payload context
- [ ] No sensitive fields in log output (private keys, auth tokens)

### A10 — Server-Side Request Forgery (SSRF)
- [ ] RPC URLs and DFNS API URLs come from validated env vars only
- [ ] No user-controlled URLs used in outbound HTTP calls

## Code Review Guidelines

### Architecture
- New features must follow the existing module structure under `src/modules/`
- New message formats need a Zod schema in `src/schemas/`
- Network additions must be added to `src/modules/token/networks.ts` — never hardcoded inline

### Error Handling
- All errors in RabbitMQ consumers must be caught and either:
  1. Published to the error exchange with a structured `CreationErrorEvent`, OR
  2. Nacked to the DLX for retry (legacy consumer pattern)
- Never let an unhandled rejection crash the consumer

### Testing
- New deploy functions must have unit tests
- New Zod schemas must have validation tests (valid + invalid inputs)
- Integration tests must mock DFNS and RabbitMQ — never hit real APIs in CI

### Performance
- `getDfnsClient()` is a singleton — do not instantiate in hot paths
- `getProvider()` caches providers per network — do not create new providers per message
- Prefetch should remain at 1 for sequential, safe contract deployment

### Blockchain-Specific
- Always call `waitForDeployment()` before reading the contract address
- Always call `deployTx.wait()` after deployment to obtain receipt fields
- Gas estimation includes a 20% buffer (`(estimate * 12n) / 10n`) — do not remove
- Do not change `kind: "Eip1559"` without verifying DFNS wallet network support
