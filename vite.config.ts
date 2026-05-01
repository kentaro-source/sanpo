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

// Short build tag for visible "is this the latest?" badge in the UI.
// Format: MMDD-HHMM in local time (Asia/Tokyo on the build runner).
const buildTag = (() => {
  const d = new Date()
  const tz = (n: number) => String(n).padStart(2, '0')
  return `${tz(d.getMonth() + 1)}${tz(d.getDate())}-${tz(d.getHours())}${tz(d.getMinutes())}`
})()

export default defineConfig({
  plugins: [react(), injectSwBuildId()],
  base: '/sanpo/',
  define: {
    __BUILD_TAG__: JSON.stringify(buildTag),
  },
  server: {
    host: true,
  },
})
