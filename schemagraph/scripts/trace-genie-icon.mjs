/**
 * Trace que-genie-icon.png → public/que-genie-icon.svg (vector paths via potrace).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import potrace from 'potrace'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pngPath = join(root, 'public', 'que-genie-icon.png')
const outPath = join(root, 'public', 'que-genie-icon.svg')

const svg = await new Promise((resolve, reject) => {
  potrace.trace(pngPath, {
    turdSize: 2,
    optTolerance: 0.4,
    color: 'currentColor',
    background: 'transparent',
  }, (err, result) => {
    if (err) reject(err)
    else resolve(result)
  })
})

const cleaned = String(svg)
  .replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'xmlns="http://www.w3.org/2000/svg"')
  .replace(/fill="#000000"/gi, 'fill="currentColor"')
  .replace(/fill="black"/gi, 'fill="currentColor"')
  .replace('<svg ', '<svg role="img" aria-label="Que Genie" ')

writeFileSync(outPath, cleaned, 'utf8')
console.log('Wrote', outPath, cleaned.length, 'bytes')
