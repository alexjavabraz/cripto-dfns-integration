import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock env before importing logger, as logger reads env.LOG_LEVEL at module level
vi.mock('../config/env.js', () => ({
  env: {
    LOG_LEVEL: 'debug',
    NODE_ENV: 'test',
  },
}))

import { logger } from './logger.js'

describe('logger', () => {
  let stdoutSpy: { mock: { calls: unknown[][] }; mockRestore(): void }
  let stderrSpy: { mock: { calls: unknown[][] }; mockRestore(): void }

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it('logger.info writes to stdout', () => {
    logger.info('test info message')
    expect(stdoutSpy).toHaveBeenCalledOnce()
    const output = JSON.parse(stdoutSpy.mock.calls[0]![0] as string)
    expect(output.level).toBe('info')
    expect(output.message).toBe('test info message')
  })

  it('logger.debug writes to stdout', () => {
    logger.debug('test debug message')
    expect(stdoutSpy).toHaveBeenCalledOnce()
    const output = JSON.parse(stdoutSpy.mock.calls[0]![0] as string)
    expect(output.level).toBe('debug')
  })

  it('logger.warn writes to stderr', () => {
    logger.warn('test warn message')
    expect(stderrSpy).toHaveBeenCalledOnce()
    const output = JSON.parse(stderrSpy.mock.calls[0]![0] as string)
    expect(output.level).toBe('warn')
    expect(output.message).toBe('test warn message')
  })

  it('logger.error writes to stderr', () => {
    logger.error('test error message')
    expect(stderrSpy).toHaveBeenCalledOnce()
    const output = JSON.parse(stderrSpy.mock.calls[0]![0] as string)
    expect(output.level).toBe('error')
    expect(output.message).toBe('test error message')
  })

  it('includes timestamp in output', () => {
    logger.info('timestamp test')
    const output = JSON.parse(stdoutSpy.mock.calls[0]![0] as string)
    expect(output.timestamp).toBeDefined()
    expect(new Date(output.timestamp as string).toISOString()).toBe(output.timestamp)
  })

  it('includes meta fields in output', () => {
    logger.info('with meta', { correlationId: 'corr-123', userId: 'user-456' })
    const output = JSON.parse(stdoutSpy.mock.calls[0]![0] as string)
    expect(output.correlationId).toBe('corr-123')
    expect(output.userId).toBe('user-456')
  })

  it('spreads meta fields alongside level and message', () => {
    logger.warn('meta spread test', { errorCode: 'E001' })
    const output = JSON.parse(stderrSpy.mock.calls[0]![0] as string)
    expect(output.level).toBe('warn')
    expect(output.message).toBe('meta spread test')
    expect(output.errorCode).toBe('E001')
  })

  it('writes valid JSON ending with newline', () => {
    logger.info('json test')
    const raw = stdoutSpy.mock.calls[0]![0] as string
    expect(raw.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})
