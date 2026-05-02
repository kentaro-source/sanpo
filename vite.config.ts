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

// In Capacitor (Android) builds the webview loads from a local scheme,
// so base must be relative ('./'). For the PWA / GitHub Pages build it
// stays '/sanpo/'. Toggle with CAP=1 env var (used by `cap:build` script).
const isCapacitor = process.env.CAP === '1'

export default defineConfig({
  plugins: [react(), injectSwBuildId()],
  base: isCapacitor ? './' : '/sanpo/',
  define: {
    __BUILD_TAG__: JSON.stringify(buildTag),
    __CAPACITOR_BUILD__: JSON.stringify(isCapacitor),
  },
  server: {
    host: true,
  },
})
