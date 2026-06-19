# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by e-mail to **alexjavabraz@gmail.com** with the subject line:

```
[SECURITY] dfns-integration — <brief description>
```

Include in your report:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if available)
- Any relevant logs, stack traces, or screenshots (redact sensitive data)
- Your preferred contact method for follow-up

### What to expect

| Step | Timeframe |
|------|-----------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 7 days |
| Fix or mitigation | Within 30 days for critical issues |
| Public disclosure | After fix is deployed and verified |

We follow **coordinated disclosure**: we will not publicly disclose the issue until a fix is available, and we will credit the reporter unless they prefer to remain anonymous.

## Security Practices

This project applies the following controls (see [CONTRIBUTING.md](CONTRIBUTING.md) for details):

- All external inputs validated with **Zod** before processing (OWASP A03)
- No private keys in this service — all signing delegated to **DFNS MPC**
- Static analysis with **ESLint**, **Semgrep** (OWASP ruleset), and **Gitleaks** on every push
- Docker image scanned with **Trivy** on every build (CRITICAL CVEs block the pipeline)
- Dependency audit with `npm audit --audit-level=high` on every PR
- Secrets managed via **AWS Secrets Manager** — never in code or environment files in production
- Non-root user in Docker container
- Structured logging via **Sentry** — credentials and private keys are never logged

## Scope

The following are **in scope** for security reports:

- Remote code execution or command injection
- Authentication or authorization bypass
- Secrets or private key exposure
- Unsafe deserialization of RabbitMQ messages
- Dependency vulnerabilities with a known exploit path in this service

The following are **out of scope**:

- Vulnerabilities in DFNS infrastructure itself (report to DFNS directly)
- Vulnerabilities in RabbitMQ or AWS services (report to their respective vendors)
- Issues that require physical access to the server
- Social engineering attacks

## Dependency Vulnerabilities

If you find a vulnerability in a dependency used by this project, please report it to the dependency maintainer first. If the vulnerability directly affects this service and cannot be fixed upstream in a reasonable time, open a **private** advisory via GitHub's [Security Advisories](../../security/advisories/new) feature.
