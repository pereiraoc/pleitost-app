import { chromium } from 'playwright'
const BASE = 'https://pereiraoc.github.io/pleitost-app'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1420, height: 950 } })
await ctx.addInitScript(() => localStorage.setItem('pleitost.theme', JSON.stringify({ theme: 'aco-solar', mode: 'light', context: 'cyberpunk' })))
const page = await ctx.newPage()
await page.goto(`${BASE}/compendio/Atlas`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button[role="tab"]', { timeout: 60000 })
await page.waitForTimeout(8000)
console.log('abas:', await page.$$eval('button[role="tab"]', (b) => b.map((x) => x.textContent + (x.getAttribute('aria-selected') === 'true' ? '*' : ''))))
console.log('nomes:', await page.$$eval('[data-area-bairro]', (e) => e.length), 'mapa?', !!(await page.$('[data-mapa-local] img')))
await browser.close()
