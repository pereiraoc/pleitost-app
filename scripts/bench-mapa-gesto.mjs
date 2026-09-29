#!/usr/bin/env node
// BANCADA DE GESTO DO MAPA (#573) — repete a sequência real do usuário
// (pinça → pan → pinça de volta → pan, 2×; 30 quadros por gesto) no build de
// produção servido por `vite preview`, em Firefox (mesma engine do celular,
// com o Gecko Profiler) ou Chromium (Pixel 7 emulado, CPU 4×, trace), e
// imprime por gesto o que decide se o mapa está fluido: paint do conteúdo por
// quadro, blobs re-rasterizados, thread Renderer, frames dropados.
//
// Uso (na raiz do repo, com o build feito: `VITE_BASE=/pleitost-app/ npm run build && npm run gen-thumbs`):
//   node scripts/bench-mapa-gesto.mjs --engine firefox            # /mapa
//   node scripts/bench-mapa-gesto.mjs --engine chromium --cpu 4
//   node scripts/bench-mapa-gesto.mjs --engine firefox --explora   # Exploração do grupo
//   node scripts/bench-mapa-gesto.mjs --engine firefox --debug '{"driver":"estilo","assar":false,"grade":"svg"}'  # A/B
//   node scripts/bench-mapa-gesto.mjs --engine chromium --diff     # overlay assado × SVG em repouso (% de pixels diferentes)
//   flags: --fullscreen · --pinch-max (até 8×) · --headed · --url <url> · --keep (não derruba o preview)
// Precisa do Firefox do Playwright: `cd app && npx playwright install firefox`.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resumoChromium, resumoGecko } from './bench-mapa-parse.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// playwright vem hoisted na raiz do workspace (ou em app/node_modules)
const require = createRequire(path.join(raiz, 'app/package.json'))
const playwrightDir = path.dirname(require.resolve('playwright/package.json'))
const { chromium, firefox, devices } = await import(path.join(playwrightDir, 'index.mjs'))

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const val = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : d
}
const engine = val('engine', 'firefox')
const cpu = Number(val('cpu', engine === 'chromium' ? 4 : 1))
const PORT = 4174
const base = `http://localhost:${PORT}/pleitost-app`
const explora = flag('explora')
const url = val('url', explora ? `${base}/heroi/Sistema/Criaturas/Her%C3%B3is/Affonso?tab=grupos` : `${base}/mapa`)
const debugPatch = val('debug', null)
const outDir = path.join(raiz, 'app/bench-out')
fs.mkdirSync(outDir, { recursive: true })
const tag = [engine, explora ? 'explora' : 'mapa', flag('fullscreen') ? 'fs' : '', flag('pinch-max') ? 'max' : '', debugPatch ? 'ab' : ''].filter(Boolean).join('-')
const perfil = path.join(outDir, `prof-${tag}.json`)

// ── preview do build ────────────────────────────────────────────────────
const dist = path.join(raiz, 'app/dist/index.html')
if (!fs.existsSync(dist)) {
  console.error('sem build em app/dist — rode: VITE_BASE=/pleitost-app/ npm run build && npm run gen-thumbs')
  process.exit(1)
}
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: path.join(raiz, 'app'),
  env: { ...process.env, VITE_BASE: '/pleitost-app/' },
  stdio: 'ignore',
})
const esperaPreview = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('preview não subiu')
}
await esperaPreview()

const launchOpts = { headless: !flag('headed') }
if (engine === 'firefox') {
  try {
    fs.unlinkSync(perfil)
  } catch {}
  launchOpts.env = {
    ...process.env,
    MOZ_PROFILER_STARTUP: '1',
    MOZ_PROFILER_SHUTDOWN: perfil,
    MOZ_PROFILER_STARTUP_INTERVAL: '1',
    MOZ_PROFILER_STARTUP_ENTRIES: '40000000',
    MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,WRRenderBackend,WRWorker,WRSceneBuilder,ImgDecoder',
    MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu,leaf,markers',
  }
}
const browser = await (engine === 'firefox' ? firefox : chromium).launch(launchOpts)
const ctxOpts = engine === 'chromium' ? { ...devices['Pixel 7'] } : { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true }
const context = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block' })
await context.addInitScript((patch) => {
  try {
    localStorage.setItem('pleitost.debug', '1')
    if (patch) localStorage.setItem('pleitost.debug.mapa', patch)
  } catch {}
  // ids sintéticos não são ponteiros ativos: no Gecko setPointerCapture lança
  const orig = Element.prototype.setPointerCapture
  Element.prototype.setPointerCapture = function (id) {
    try {
      return orig.call(this, id)
    } catch {}
  }
}, debugPatch)
const page = await context.newPage()
// vite preview devolve index.html pra caminhos com %2C (vírgula) — serve do dist
await page.route((u) => u.pathname.includes('/vault-data/') && u.pathname.includes('%2C'), async (route) => {
  const p = decodeURIComponent(route.request().url().split('/pleitost-app/')[1].split('?')[0])
  const abs = path.join(raiz, 'app/dist', p)
  if (fs.existsSync(abs)) await route.fulfill({ path: abs, contentType: 'application/json' })
  else await route.continue()
})
if (engine === 'chromium' && cpu > 1) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
}
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
if (explora) {
  const btn = page.locator('button').filter({ hasText: /EXPLORA/i }).first()
  await btn.waitFor({ timeout: 60000 })
  await btn.dispatchEvent('click')
  await page.waitForTimeout(800)
  await page.evaluate(() => document.querySelector('.sidebar-right.drawer-open')?.classList.remove('drawer-open'))
}
await page.waitForSelector('[data-mapa] img', { timeout: 60000 })
// espera o overlay assado (quando ligado) ficar pronto, até 20 s
try {
  await page.waitForFunction(() => {
    const ov = document.querySelector('[data-mapa] svg image')
    const assado = document.querySelector('[data-mapa-assado]')
    return !ov || !!assado
  }, null, { timeout: 20000 })
} catch {}
if (flag('fullscreen')) {
  await page.click('[data-fullscreen-toggle]')
  await page.waitForTimeout(800)
}
if (flag('pinch-max')) await page.evaluate(() => { window.__pinchMax = true })
await page.waitForTimeout(800)
const info = await page.evaluate(() => {
  const img = document.querySelector('[data-mapa] img')
  const svg = document.querySelector('[data-mapa] svg')
  const r = document.querySelector('[data-mapa]').getBoundingClientRect()
  return {
    assado: img.hasAttribute('data-mapa-assado'),
    gradeCanvas: !!document.querySelector('canvas[data-hexgrid]'),
    svgNodes: svg ? svg.querySelectorAll('*').length : 0,
    mapaRect: `${Math.round(r.width)}x${Math.round(r.height)}`,
    debug: localStorage.getItem('pleitost.debug.mapa'),
  }
})
console.log(`# ${tag} · cpu×${cpu}`, JSON.stringify(info))

// ── diff overlay assado × SVG em repouso ───────────────────────────────────
if (flag('diff')) {
  const sharp = (await import(require.resolve('sharp'))).default
  const shot = async (nome) => {
    const el = await page.$('[data-mapa-viewport]')
    const p = path.join(outDir, `diff-${nome}.png`)
    await el.screenshot({ path: p })
    return p
  }
  const a = await shot('assado')
  await page.evaluate(() => {
    localStorage.setItem('pleitost.debug.mapa', JSON.stringify({ driver: 'auto', assar: false, grade: 'canvas' }))
    window.dispatchEvent(new CustomEvent('pleitost:mapa-debug'))
  })
  await page.waitForFunction(() => !!document.querySelector('[data-mapa] svg image'), null, { timeout: 10000 })
  await page.waitForTimeout(600)
  const b = await shot('svg')
  const [ia, ib] = await Promise.all([sharp(a).raw().toBuffer({ resolveWithObject: true }), sharp(b).raw().toBuffer({ resolveWithObject: true })])
  let dif = 0
  const n = Math.min(ia.data.length, ib.data.length) / ia.info.channels
  for (let i = 0; i < n; i++) {
    const o = i * ia.info.channels
    if (Math.abs(ia.data[o] - ib.data[o]) > 32 || Math.abs(ia.data[o + 1] - ib.data[o + 1]) > 32 || Math.abs(ia.data[o + 2] - ib.data[o + 2]) > 32) dif++
  }
  console.log(`diff assado × svg: ${((dif / n) * 100).toFixed(3)}% de pixels diferentes (${dif}/${n}) — ${a} · ${b}`)
  await context.close()
  await browser.close()
  if (!flag('keep')) preview.kill()
  process.exit(0)
}

// ── gestos sintéticos, um passo por quadro ─────────────────────────────────
if (engine === 'chromium') {
  await browser.startTracing(page, {
    path: perfil,
    categories: ['-*', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'cc', 'gpu', 'blink.user_timing'],
  })
}
const gesto = (label, kind, steps, dir) =>
  page.evaluate(
    async ({ label, kind, steps, dir }) => {
      const vp = document.querySelector('[data-mapa-viewport]')
      const mapa = document.querySelector('[data-mapa]')
      const r = vp.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const raf = () => new Promise((res) => requestAnimationFrame(() => res(performance.now())))
      const frames = []
      const touch = (id, x, y) => new Touch({ identifier: id, target: vp, clientX: x, clientY: y, pageX: x, pageY: y })
      const te = (type, touches) => vp.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches }))
      const pe = (type, id, x, y) =>
        vp.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }))
      performance.mark(`G:${label}:start`)
      const t0 = performance.now()
      if (kind === 'pinch') {
        const MAXD = window.__pinchMax ? 480 : 240
        let d = dir > 0 ? 60 : MAXD
        const step = dir > 0 ? (MAXD - 60) / steps : (MAXD - 40) / steps
        pe('pointerdown', 1, cx - d / 2, cy)
        te('touchstart', [touch(1, cx - d / 2, cy)])
        pe('pointerdown', 2, cx + d / 2, cy)
        te('touchstart', [touch(1, cx - d / 2, cy), touch(2, cx + d / 2, cy)])
        for (let i = 0; i < steps; i++) {
          d += dir > 0 ? step : -step
          te('touchmove', [touch(1, cx - d / 2, cy), touch(2, cx + d / 2, cy)])
          pe('pointermove', 1, cx - d / 2, cy)
          pe('pointermove', 2, cx + d / 2, cy)
          frames.push(await raf())
        }
        pe('pointerup', 2, cx + d / 2, cy)
        te('touchend', [touch(1, cx - d / 2, cy)])
        pe('pointerup', 1, cx - d / 2, cy)
        te('touchend', [])
      } else {
        let x = cx
        let y = cy
        pe('pointerdown', 1, x, y)
        te('touchstart', [touch(1, x, y)])
        for (let i = 0; i < steps; i++) {
          x += 6 * dir
          y += 3 * dir
          te('touchmove', [touch(1, x, y)])
          pe('pointermove', 1, x, y)
          frames.push(await raf())
        }
        pe('pointerup', 1, x, y)
        te('touchend', [])
      }
      const tEnd = performance.now()
      performance.mark(`G:${label}:end`)
      await new Promise((res) => setTimeout(res, 600))
      performance.mark(`G:${label}:after`)
      const gaps = frames.slice(1).map((t, i) => t - frames[i])
      const escala = /scale\(([^)]+)\)/.exec(getComputedStyle(mapa).transform === 'none' ? mapa.style.transform : mapa.style.transform)?.[1]
      return { label, ms: Math.round(tEnd - t0), rAF: frames.length, gapMax: gaps.length ? Math.round(Math.max(...gaps)) : 0, escala: escala ? Number(escala).toFixed(2) : '?' }
    },
    { label, kind, steps, dir },
  )
const seq = [
  ['pinca-in-1', 'pinch', 30, +1],
  ['pan-1', 'pan', 30, +1],
  ['pinca-out-1', 'pinch', 30, -1],
  ['pan-2', 'pan', 30, -1],
  ['pinca-in-2', 'pinch', 30, +1],
  ['pan-3', 'pan', 30, +1],
]
for (const [label, kind, steps, dir] of seq) {
  const r = await gesto(label, kind, steps, dir)
  console.log(`${r.label.padEnd(12)} ${r.ms}ms rAF ${r.rAF} gapMax ${r.gapMax}ms esc ${r.escala}`)
  await page.waitForTimeout(300)
}
if (engine === 'chromium') await browser.stopTracing()
await context.close()
await browser.close()
for (let i = 0; i < 40 && !fs.existsSync(perfil); i++) await new Promise((r) => setTimeout(r, 250))
if (!flag('keep')) preview.kill()
if (!fs.existsSync(perfil)) {
  console.log('perfil não gerado:', perfil)
  process.exit(1)
}
console.log(`perfil: ${perfil} (${Math.round(fs.statSync(perfil).size / 1e6)} MB)`)
console.table(engine === 'firefox' ? resumoGecko(perfil) : resumoChromium(perfil))
