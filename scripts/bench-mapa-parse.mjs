// Resumo por gesto dos perfis da bancada do mapa (#573): perfil bruto do Gecko
// (MOZ_PROFILER_SHUTDOWN) ou trace do Chromium. Cada gesto é delimitado por
// performance.mark('G:<rótulo>:start|end|after') na página.
import fs from 'node:fs'

/** Perfil do Gecko → por gesto: paint do conteúdo (ms), blobs re-rasterizados,
 *  tempo Graphics na thread Renderer (ms) e no pior WRWorker (ms). */
export function resumoGecko(file) {
  const prof = JSON.parse(fs.readFileSync(file, 'utf8'))
  const cats = prof.meta.categories.map((c) => c.name)
  const rootStart = prof.meta.startTime
  const threads = []
  for (const t of prof.threads ?? []) threads.push({ t, off: 0 })
  for (const p of prof.processes ?? []) {
    const off = (p.meta?.startTime ?? rootStart) - rootStart
    for (const t of p.threads ?? []) threads.push({ t, off })
  }
  const janelas = []
  for (const { t, off } of threads) {
    const m = t.markers
    if (!m?.data?.length) continue
    const s = m.schema
    for (const row of m.data) {
      const data = row[s.data]
      const name = data && typeof data.name === 'string' ? data.name : t.stringTable[row[s.name]]
      if (typeof name !== 'string' || !name.startsWith('G:')) continue
      const [, label, fase] = name.split(':')
      let w = janelas.find((x) => x.label === label)
      if (!w) janelas.push((w = { label }))
      w[fase] = row[s.startTime] + off
    }
  }
  janelas.sort((a, b) => a.start - b.start)
  const catOf = (t, stackIdx) => {
    const st = t.stackTable
    const ft = t.frameTable
    let cur = stackIdx
    let guard = 0
    while (cur != null && guard++ < 10000) {
      const row = st.data[cur]
      const c = ft.data[row[st.schema.frame]][ft.schema.category]
      if (c != null) return c
      cur = row[st.schema.prefix]
    }
    return null
  }
  const interval = prof.meta.interval
  const out = janelas.map((w) => ({ gesto: w.label, ms: Math.round(w.end - w.start), paintMs: 0, paints: 0, blobs: 0, rendererMs: 0, workerMaxMs: 0 }))
  for (const { t, off } of threads) {
    const isRenderer = t.name === 'Renderer'
    const isWorker = /^WRWorker/.test(t.name)
    if ((isRenderer || isWorker) && t.samples?.data?.length) {
      const s = t.samples
      const porJanela = new Map()
      for (const row of s.data) {
        const time = row[s.schema.time] + off
        const w = janelas.find((j) => time >= j.start && time <= j.end)
        if (!w) continue
        const c = catOf(t, row[s.schema.stack])
        if (c == null || cats[c] !== 'Graphics') continue
        porJanela.set(w.label, (porJanela.get(w.label) ?? 0) + interval)
      }
      for (const o of out) {
        const v = porJanela.get(o.gesto) ?? 0
        if (isRenderer) o.rendererMs += v
        else o.workerMaxMs = Math.max(o.workerMaxMs, v)
      }
    }
    if (t.markers?.data?.length) {
      const ms = t.markers.schema
      for (const row of t.markers.data) {
        const nm = t.stringTable[row[ms.name]]
        const st = row[ms.startTime] + off
        const en = row[ms.endTime] != null ? row[ms.endTime] + off : st
        const w = janelas.find((j) => st >= j.start && st <= j.end)
        if (!w) continue
        const o = out.find((x) => x.gesto === w.label)
        if (nm === 'RasterizeSingleBlob') o.blobs++
        if (nm === 'CONTENT_FULL_PAINT_TIME') {
          o.paints++
          o.paintMs += en - st
        }
      }
    }
  }
  return out.map((o) => ({ ...o, paintMs: Math.round(o.paintMs), paintPorQuadro: o.paints ? Number((o.paintMs / o.paints).toFixed(2)) : 0, rendererMs: Math.round(o.rendererMs), workerMaxMs: Math.round(o.workerMaxMs) }))
}

/** Trace do Chromium → por gesto: frames dropados, tempo de raster (self) nos
 *  workers e tempo de main thread (self, exceto RunTask). */
export function resumoChromium(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ev = Array.isArray(raw) ? raw : raw.traceEvents
  const threadName = new Map()
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}/${e.tid}`, e.args.name)
  const janelas = []
  for (const e of ev) {
    if (typeof e.name === 'string' && e.name.startsWith('G:') && ['R', 'I', 'i', 'n', 'b'].includes(e.ph)) {
      const [, label, fase] = e.name.split(':')
      let w = janelas.find((x) => x.label === label)
      if (!w) janelas.push((w = { label }))
      if (w[fase] == null) w[fase] = e.ts / 1000
    }
  }
  janelas.sort((a, b) => a.start - b.start)
  const out = janelas.map((w) => ({ gesto: w.label, ms: Math.round(w.end - w.start), dropados: 0, rasterMs: 0, mainMs: 0 }))
  for (const e of ev) {
    if (e.name === 'DroppedFrame') {
      const t = e.ts / 1000
      const w = janelas.find((j) => t >= j.start && t <= j.end)
      if (w) out.find((o) => o.gesto === w.label).dropados++
    }
  }
  const byThread = new Map()
  for (const e of ev) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue
    const k = `${e.pid}/${e.tid}`
    ;(byThread.get(k) ?? byThread.set(k, []).get(k)).push(e)
  }
  for (const [k, list] of byThread) {
    list.sort((a, b) => a.ts - b.ts)
    const stack = []
    for (const e of list) {
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop()
      if (stack.length) stack[stack.length - 1].childDur = (stack[stack.length - 1].childDur ?? 0) + e.dur
      stack.push(e)
    }
    const tn = threadName.get(k) ?? ''
    for (const e of list) {
      const start = e.ts / 1000
      const self = Math.max(0, e.dur - (e.childDur ?? 0)) / 1000
      const w = janelas.find((j) => start >= j.start && start <= j.end)
      if (!w) continue
      const o = out.find((x) => x.gesto === w.label)
      if (tn === 'ThreadPoolForegroundWorker') o.rasterMs += self
      else if (tn === 'CrRendererMain' && e.name !== 'RunTask') o.mainMs += self
    }
  }
  return out.map((o) => ({ ...o, rasterMs: Math.round(o.rasterMs), mainMs: Math.round(o.mainMs) }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  const r = file.includes('firefox') ? resumoGecko(file) : resumoChromium(file)
  console.table(r)
}
