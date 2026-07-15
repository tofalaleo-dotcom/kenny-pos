import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const sourceIndex = join(root, 'index.source.html')
const liveIndex = join(root, 'index.html')
const dist = join(root, 'dist')
const docs = join(root, 'docs')
const assets = join(root, 'assets')

copyFileSync(sourceIndex, liveIndex)

const vite = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (vite.status !== 0) {
  process.exit(vite.status ?? 1)
}

if (!existsSync(docs)) mkdirSync(docs)
if (!existsSync(assets)) mkdirSync(assets)

cpSync(dist, docs, { recursive: true, force: true })
cpSync(join(dist, 'assets'), assets, { recursive: true, force: true })

for (const file of ['index.html', 'payment-qr.png', 'sw.js', '_redirects']) {
  const from = join(dist, file)
  if (existsSync(from)) copyFileSync(from, join(root, file))
}

// GitHub Pages shows its own "404 File not found" page when a user opens
// an app route or a cached URL that does not map to a physical file.
// Copy the app shell to 404.html so those requests still load kennyXpay.
copyFileSync(join(dist, 'index.html'), join(root, '404.html'))
copyFileSync(join(dist, 'index.html'), join(docs, '404.html'))
