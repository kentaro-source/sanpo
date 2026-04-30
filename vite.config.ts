import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const buildId = Date.now().toString()

function injectSwBuildId() {
  return {
    name: 'inject-sw-build-id',
    apply: 'build' as const,
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js')
      try {
        const content = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, content.replace(/__BUILD_ID__/g, buildId))
        console.log(`[sw] BUILD_ID injected: ${buildId}`)
      } catch (e) {
        console.warn('[sw] could not inject BUILD_ID:', e)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), injectSwBuildId()],
  base: '/sanpo/',
  server: {
    host: true,
  },
})
