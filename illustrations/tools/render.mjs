// Rend les SVG de illustrations/svg en une planche-contact PNG (contrôle visuel).
// Usage : node illustrations/tools/render.mjs [nom...]
import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const root = new URL('../..', import.meta.url).pathname
const dirs = ['illustrations/svg', 'illustrations/brouillons'].map((d) => join(root, d))
const outDir = join(root, 'illustrations/tools/out')
mkdirSync(outDir, { recursive: true })

const only = process.argv.slice(2)
const files = dirs
  .flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.svg')).map((f) => join(d, f)))
  .filter((f) => only.length === 0 || only.includes(basename(f, '.svg')))
  .sort()

const cols = Math.min(2, Math.max(1, files.length))
const cardW = 820
const cardH = Math.round((cardW * 1152) / 2048) + 46
const rows = Math.ceil(files.length / cols)

const cards = files
  .map((f) => {
    const svg = readFileSync(f, 'utf8')
    return `<figure><div class="art">${svg}</div><figcaption>${basename(f, '.svg')}</figcaption></figure>`
  })
  .join('\n')

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:#2b2b2b; font:500 20px/1.2 system-ui,sans-serif }
  .grid { display:grid; grid-template-columns:repeat(${cols},${cardW}px); gap:20px; padding:20px }
  figure { margin:0 }
  .art { background:#444444; display:block }
  .art svg { display:block; width:100%; height:auto }
  figcaption { padding:8px 2px 0; letter-spacing:.06em; text-transform:uppercase; font-size:17px; color:#8f8f8f }
</style><div class="grid">${cards}</div>`

const page = join(outDir, 'sheet.html')
writeFileSync(page, html)

execFileSync(CHROME, [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${cols * (cardW + 20) + 20},${rows * (cardH + 20) + 20}`,
  `--screenshot=${join(outDir, 'sheet.png')}`,
  `file://${page}`,
], { stdio: ['ignore', 'ignore', 'ignore'] })

console.log(`${files.length} illustration(s) -> illustrations/tools/out/sheet.png`)
