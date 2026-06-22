import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.claude/**'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/smoke-test.ts',
        'src/test-setup.ts',
        // Infrastructure entrypoints — no meaningful unit test surface
        'src/app.ts',
        'src/config/sentry.ts',
        'src/modules/dfns/client.ts',
        'src/modules/rabbitmq/connection.ts',
        // env.ts is a pure config reader — tested implicitly via all other tests that mock it
        'src/config/env.ts',
        // Blockchain deployment functions covered via integration — mock-only in unit tests
        'src/modules/token/erc20.ts',
        'src/modules/token/erc721.ts',
        'src/modules/token/erc1155.ts',
        'src/modules/token/token-ops.ts',
        'src/modules/token/token-transfer.ts',
        'src/modules/token/balance.ts',
      ],
    },
  },
})
