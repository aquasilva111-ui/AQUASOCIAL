import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    // os testes originais do feed-generator usam describe/it/expect globais (estilo Jest)
    globals: true,
  },
})
