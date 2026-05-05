## Description

<!-- What does this PR do? Why is this change needed? -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring
- [ ] Infrastructure / CI
- [ ] Documentation

## Testing

- [ ] Unit tests added or updated
- [ ] Tested locally with a real RabbitMQ message
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

## OWASP Top 10 Security Checklist

- [ ] **A01** No hardcoded credentials, wallet IDs, or tokens in code
- [ ] **A02** No private keys logged or serialized — DFNS handles all signing
- [ ] **A03** All external inputs validated with Zod before use
- [ ] **A04** Errors do not expose internal stack traces to message consumers
- [ ] **A05** No new secrets committed; Docker runs as non-root
- [ ] **A06** `npm audit --audit-level=high` passes; no new critical CVEs introduced
- [ ] **A07** Auth credentials redacted in all log output
- [ ] **A08** `npm ci` used (not `npm install`) in all scripts and Docker
- [ ] **A09** All new error paths call `captureError()` with context
- [ ] **A10** No user-controlled URLs used in outbound HTTP calls

## Code Quality Checklist

- [ ] No `any` types — use `unknown` in catch blocks
- [ ] Structured logging used (`logger.*`) — no `console.log`
- [ ] New RabbitMQ message formats have a Zod schema in `src/schemas/`
- [ ] New network configs added to `networks.ts` — not hardcoded inline
- [ ] Contract artifacts updated if Solidity contracts changed (`npm run compile:contracts`)
- [ ] `sanitizePayload()` used before logging message payloads

## Deployment Notes

<!-- Any migrations, env var changes, RabbitMQ queue/exchange changes, or contract changes? -->
