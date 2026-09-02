import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [react(), svelte()],
  test: {
    globals: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
})
