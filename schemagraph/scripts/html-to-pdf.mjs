/**
 * Render an HTML doc to PDF via Playwright.
 * Usage: node scripts/html-to-pdf.mjs <input.html> <output.pdf>
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const input = resolve(process.argv[2] || 'docs/Que-Production-Use-Guide.html')
const output = resolve(process.argv[3] || 'docs/Que-Production-Use-Guide.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(input).href, { waitUntil: 'networkidle' })
await page.pdf({
  path: output,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
})
await browser.close()
console.log(`Wrote ${output}`)
