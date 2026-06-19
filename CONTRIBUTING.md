# Contributing to dfns-integration

Thank you for your interest in contributing. This document covers how to set up your environment, coding standards, and the pull request process.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Security Requirements](#security-requirements)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)

## Prerequisites

- Node.js >= 22
- npm >= 10
- Docker (for container build verification)
- A running RabbitMQ instance (local or via Docker)
- DFNS service account credentials (for integration tests)

## Local Setup

```bash
git clone https://github.com/alexjavabraz/cripto-dfns-integration.git
cd cripto-dfns-integration
cp .env.example .env
# Fill in DFNS credentials, RabbitMQ URL, and RPC endpoints
npm install
npm run dev
```

Start a local RabbitMQ for development:

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  rabbitmq:3-management
```

## Development Workflow

1. Fork the repository and create a branch from `main`
2. Branch naming: `feat/`, `fix/`, `docs/`, `refactor/`, `ci/` prefixes
3. Make changes following the [Code Standards](#code-standards) below
4. Run the full check suite before pushing (see [Testing](#testing))
5. Open a pull request using the provided template

## Code Standards

### TypeScript

- **Strict mode** — `tsconfig.json` enforces `strict: true` and `exactOptionalPropertyTypes: true`
- No `any` — use `unknown` in catch blocks; use proper types everywhere else
- No `// @ts-ignore` or `// @ts-expect-error` without an explanatory comment
- ESM modules only (`"type": "module"` in `package.json`)

### Validation

- **All external inputs** (RabbitMQ messages, HTTP requests) **must be validated with Zod** before use — this is a hard requirement (OWASP A03)
- Add schemas to `src/schemas/` for new message formats
- Validation errors must be caught, logged with `logger.error()`, and result in a rejection published to the error exchange — never crash the consumer

### Logging

- Use `logger.*` (structured JSON via pino) — **never `console.log`**
- Call `sanitizePayload()` before logging any RabbitMQ message body
- **Never log**: private keys, auth tokens, DFNS credentials, wallet IDs in full, or any PII

### Error Handling

- All errors must call `captureError()` or `captureMessage()` from `src/config/sentry.ts`
- RabbitMQ consumers must always `ack` the message — even on business logic errors — then publish a structured error response to the error exchange. **Never `nack`** a message for business logic failures

### Architecture

- One file per responsibility in `src/modules/`
- New network support goes in `src/modules/token/networks.ts` — not hardcoded inline
- New token standards get their own deployment file (`erc<N>.ts`) in `src/modules/token/`
- Contract artifacts must be pre-compiled and committed to `artifacts/` after running `npm run compile:contracts`

## Testing

Run the full check suite:

```bash
npm run type-check      # TypeScript type check
npm run lint            # ESLint
npm run format:check    # Prettier
npm test                # Vitest unit tests
npm run test:coverage   # Tests + coverage report (target: 80% statements)
```

### Writing tests

- Unit tests go in `src/**/*.test.ts` alongside the file they test
- Use `vitest` — no Jest
- New public functions must have at least one test covering the happy path and one covering an error/edge case
- Tests must not make real network calls — mock `amqplib`, RPC providers, and the DFNS SDK

### Integration / smoke test

To run a real end-to-end test against a live RabbitMQ and Ethereum Sepolia:

```bash
SMOKE_TEST=true TEST_OWNER_ADDRESS=0xYourAddress npm run dev
```

## Security Requirements

Every contribution must satisfy the checklist in the [pull request template](.github/pull_request_template.md). Key points:

- **No hardcoded secrets** — use `.env` locally and AWS Secrets Manager in production
- **No private keys** in code, logs, or test fixtures
- **Zod validation** for every new message type
- Run `npm audit --audit-level=high` — no new high or critical vulnerabilities introduced
- Docker image must build and pass Trivy scan (CRITICAL severity blocks CI)

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## Pull Request Process

1. Ensure CI passes: type-check, lint, format, tests, security scans
2. Fill out the pull request template completely — the OWASP and code quality checklists are required, not optional
3. Keep PRs focused — one logical change per PR
4. Add or update tests for any new functionality
5. Update `README.md` if you add new environment variables, queues, or exchanges
6. Update `.env.example` for any new required environment variables
7. A maintainer will review within a few business days

## Reporting Bugs

Open a [GitHub Issue](../../issues/new) with:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Node.js version, OS, and relevant environment (redact credentials)
- Logs if available (redact sensitive data)

For **security vulnerabilities**, do **not** open a public issue — see [SECURITY.md](SECURITY.md).
