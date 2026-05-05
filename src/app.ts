import Fastify, { type FastifyError } from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import * as Sentry from '@sentry/node'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: false, // We use our own structured logger
    trustProxy: true,
    disableRequestLogging: true,
  })

  // --- Security headers (OWASP A05) ---
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
      },
    },
  })

  // --- Rate limiting: max 10 req/min (OWASP A07) ---
  await app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${String(context.ttl)} ms`,
    }),
  })

  // --- Health check endpoint (no auth required) ---
  app.get('/health', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_req, reply) => {
    return reply.send({ status: 'ok', env: env.NODE_ENV, timestamp: new Date().toISOString() })
  })

  // --- Request logging ---
  app.addHook('onRequest', (req, _reply, done) => {
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
    })
    done()
  })

  // --- Sentry error handler (captures unhandled Fastify errors) ---
  Sentry.setupFastifyErrorHandler(app)

  // --- Global error handler ---
  app.setErrorHandler((error: FastifyError, _req, reply) => {
    const statusCode = error.statusCode ?? 500
    logger.error('Unhandled Fastify error', { error: error.message })
    return reply.status(statusCode).send({
      statusCode,
      error: 'Internal Server Error',
    })
  })

  return app
}
