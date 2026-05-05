import { env } from '../config/env.js'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  correlationId?: string
  [key: string]: unknown
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }
}

function write(entry: LogEntry): void {
  const output = JSON.stringify(entry)
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(output + '\n')
  } else {
    process.stdout.write(output + '\n')
  }
}

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const configuredLevel = levels[env.LOG_LEVEL as LogLevel] ?? 1

function shouldLog(level: LogLevel): boolean {
  return (levels[level] ?? 0) >= configuredLevel
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) write(formatEntry('debug', message, meta))
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) write(formatEntry('info', message, meta))
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) write(formatEntry('warn', message, meta))
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) write(formatEntry('error', message, meta))
  },
}
