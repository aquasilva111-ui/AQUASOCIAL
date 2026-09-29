import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Media tests run real ffmpeg encodes; keep headroom under parallel load.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    maxWorkers: 3,
  },
})
