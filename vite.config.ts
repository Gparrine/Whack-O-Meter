import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Whack-O-Meter'
const base = `/${repoName}/`
const rootDir = join(import.meta.dirname)

function serveRawData(): Plugin {
  return {
    name: 'serve-raw-data',
    configureServer(server) {
      server.middlewares.use(`${base}raw_data`, (req, res, next) => {
        const requestPath = decodeURIComponent(req.url ?? '/').replace(/^\//, '')
        if (!requestPath || requestPath.includes('..')) {
          next()
          return
        }

        const filePath = join(rootDir, 'raw_data', requestPath)
        if (!existsSync(filePath)) {
          next()
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveRawData()],
  base,
})
