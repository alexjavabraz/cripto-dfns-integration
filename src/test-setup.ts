/**
 * Test setup — sets required environment variables before any module loads.
 * Imported via vitest.config.ts `setupFiles`.
 */

// Set required env vars before any module imports env.ts
process.env['NODE_ENV'] = 'test'
process.env['DFNS_API_URL'] = 'https://api.dfns.ninja'
process.env['DFNS_ORG_ID'] = 'org-test-123'
process.env['DFNS_AUTH_TOKEN'] = 'test-auth-token'
process.env['DFNS_CRED_ID'] = 'test-cred-id'
process.env['DFNS_PRIVATE_KEY'] = 'test-private-key'
process.env['RABBITMQ_URL'] = 'amqp://localhost:5672'
process.env['SENTRY_DSN'] = 'https://test@sentry.io/123'
process.env['LOG_LEVEL'] = 'error' // suppress noise during tests
