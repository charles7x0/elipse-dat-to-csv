import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts']
    }
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core')
    }
  }
})
