/**
 * Post-build script: copies .next/static and public/ into the standalone output
 * so the standalone server can serve them.
 *
 * Run automatically via: npm run build:electron
 */
const fs   = require('fs')
const path = require('path')

const root       = path.join(__dirname, '..')
const standalone = path.join(root, '.next', 'standalone')
const staticSrc  = path.join(root, '.next', 'static')
const staticDst  = path.join(standalone, '.next', 'static')
const publicSrc  = path.join(root, 'public')
const publicDst  = path.join(standalone, 'public')

function copyDir (src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

console.log('Copying .next/static → standalone/.next/static')
copyDir(staticSrc, staticDst)

console.log('Copying public/ → standalone/public')
copyDir(publicSrc, publicDst)

console.log('Done. Standalone output is ready for Electron packaging.')
