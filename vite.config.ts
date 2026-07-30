import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const buildId = Date.now().toString()

/**
 * DEV-ONLY endpoint used by the route-geometry generator.
 *
 * The generator has to run inside a browser page (the Maps API key is
 * restricted to HTTP referrers, so Directions cannot be called from Node),
 * but its output has to end up in files. This lets the page POST each
 * finished segment to disk.
 *
 * `apply: 'serve'` keeps it out of production builds entirely.
 *
 *   GET  /__route-geometry        → { done: ["JP-KR", …] }  (for resuming)
 *   POST /__route-geometry?key=X  → writes public/route-geometry/X.json
 */
function routeGeometryWriter() {
  const outDir = resolve(__dirname, 'public', 'route-geometry')
  return {
    name: 'route-geometry-writer',
    apply: 'serve' as const,
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          fn: (req: any, res: any, next: () => void) => void,
        ) => void
      }
    }) {
      // Serve the generator script itself (dev only). It used to live in
      // public/, which meant this development-only tool was bundled into the
      // production PWA and the APK.
      server.middlewares.use('/__route-geometry-script', (_req, res, next) => {
        try {
          const src = readFileSync(
            resolve(__dirname, 'scripts', 'gen-route-geometry.js'),
            'utf8',
          )
          res.setHeader('Content-Type', 'application/javascript')
          res.end(src)
        } catch {
          next()
        }
      })

      server.middlewares.use('/__route-geometry', (req, res, next) => {
        if (req.method === 'GET') {
          const done = existsSync(outDir)
            ? readdirSync(outDir)
                .filter((f: string) => f.endsWith('.json'))
                .map((f: string) => f.replace(/\.json$/, ''))
            : []
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ done }))
          return
        }
        if (req.method !== 'POST') return next()

        const url = new URL(req.url ?? '', 'http://localhost')
        const key = url.searchParams.get('key') ?? ''
        // Path-traversal guard: segment keys are ISO-ish ids only.
        if (!/^[A-Za-z0-9_-]+$/.test(key)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'bad key' }))
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8')
            JSON.parse(body) // validate before writing
            mkdirSync(outDir, { recursive: true })
            writeFileSync(resolve(outDir, `${key}.json`), body)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, key, bytes: body.length }))
            console.log(`[route-geometry] wrote ${key}.json (${body.length} B)`)
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}

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
  plugins: [react(), injectSwBuildId(), routeGeometryWriter()],
  base: isCapacitor ? './' : '/sanpo/',
  define: {
    __BUILD_TAG__: JSON.stringify(buildTag),
    __CAPACITOR_BUILD__: JSON.stringify(isCapacitor),
  },
  server: {
    host: true,
    watch: {
      // The geometry generator writes into public/route-geometry while it
      // runs. Vite treats any public/ change as a full-reload trigger, which
      // reloaded the page and killed the generator mid-run (it died after
      // ~16 segments every time). Ignore that directory so generation can
      // complete; the files are only read at app start anyway.
      ignored: ['**/public/route-geometry/**'],
    },
  },
})
