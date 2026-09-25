// INTERAÇÃO COMPARTILHADA DO MAPA (issue #80) — pan (1 ponteiro), PINÇA (2
// ponteiros, celular), zoom por roda (desktop) e TELA CHEIA. Extraído do que o
// HexMapEditor e o PanelExploracao duplicavam, pra os dois ganharem pinça +
// fullscreen de uma vez sem drift. A matemática de zoom ancorado (roda e
// pinça) e o limiar de arraste (3px) são os MESMOS de antes.
//
// O hook NÃO conhece a grade: expõe `fracAtClient` (fração 0..1 da imagem sob o
// cursor) e o consumidor converte via fracToHex. `mapRef` é o div transformado
// (img+svg); `getBoundingClientRect` dele já vem pós-transform, então o
// hit-test é imune ao zoom/pan. `viewportRef` é a área que captura ponteiros +
// roda. `containerRef` é o elemento que entra em tela cheia.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { marcarSuperficieDeGesto } from '../components/layout/gesture-surface'
import { pushLog } from '../data/debug-log'

export interface MapView {
  scale: number
  tx: number
  ty: number
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 8

const IDENTITY: MapView = { scale: 1, tx: 0, ty: 0 }

/** Fração 0..1 (x,y) da imagem sob o cliente, ou null fora dela. */
export interface Frac {
  fx: number
  fy: number
}

interface PointerRec {
  x: number
  y: number
}

export interface UseMapView {
  view: MapView
  dragging: boolean
  fullscreen: boolean
  /** ref do elemento que vai a tela cheia (o painel do mapa). */
  containerRef: RefObject<HTMLDivElement | null>
  /** callback-ref da viewport (captura ponteiros + roda non-passive). */
  viewportRef: (el: HTMLDivElement | null) => void
  /** ref do div transformado (img+svg) — base do hit-test. */
  mapRef: RefObject<HTMLDivElement | null>
  transform: string
  /** View sendo PINTADA agora: durante um gesto vai na frente de `view`, que
   *  só sincroniza no fim (#572 — nada de re-render no meio da pinça). */
  readLiveView: () => MapView
  fracAtClient: (clientX: number, clientY: number) => Frac | null
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  /** true (e reseta) se o último gesto arrastou/pinçou — pra suprimir o click. */
  consumeMoved: () => boolean
  zoomBy: (factor: number, cx?: number, cy?: number) => void
  resetView: () => void
  toggleFullscreen: () => void
}

/** Geometria da viewport e da imagem BASE (sem transform), em px de cliente. */
interface Geo {
  vpLeft: number
  vpTop: number
  vpW: number
  vpH: number
  baseW: number
  baseH: number
  /** posição centrada do div (invariante ao pan) relativa à viewport */
  layoutLeft: number
  layoutTop: number
}

/** Escala que está PINTADA no elemento (o rAF pode estar um quadro atrás do
 *  liveRef) — lida do transform computado/inline; fallback = `padrao`. */
function escalaPintada(el: HTMLElement, padrao: number): number {
  const t = (typeof getComputedStyle === 'function' ? getComputedStyle(el).transform : '') || el.style.transform || ''
  const m = /matrix\(([^,]+),/.exec(t)
  if (m) {
    const a = Number(m[1])
    return Number.isFinite(a) && a > 0 ? a : padrao
  }
  const sc = /scale\(([^)]+)\)/.exec(t)
  if (sc) {
    const a = Number(sc[1])
    return Number.isFinite(a) && a > 0 ? a : padrao
  }
  return padrao
}

/** Restringe a translação pra o mapa NUNCA sair da viewport: quando a imagem
 *  cobre um eixo, a borda não pode entrar; quando é menor, centraliza. */
function clampComGeo(g: Geo, next: MapView): MapView {
  const sw = next.scale * g.baseW
  const sh = next.scale * g.baseH
  let tx = next.tx
  let ty = next.ty
  if (sw >= g.vpW) {
    const maxTx = -g.layoutLeft
    const minTx = g.vpW - sw - g.layoutLeft
    tx = Math.min(maxTx, Math.max(minTx, tx))
  } else {
    tx = (g.vpW - sw) / 2 - g.layoutLeft
  }
  if (sh >= g.vpH) {
    const maxTy = -g.layoutTop
    const minTy = g.vpH - sh - g.layoutTop
    ty = Math.min(maxTy, Math.max(minTy, ty))
  } else {
    ty = (g.vpH - sh) / 2 - g.layoutTop
  }
  return { scale: next.scale, tx, ty }
}

function clampScale(s: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s))
}

function dist(a: PointerRec, b: PointerRec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function useMapView(): UseMapView {
  const [view, setView] = useState<MapView>(IDENTITY)
  const [dragging, setDragging] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const viewportElRef = useRef<HTMLDivElement | null>(null)

  // Ponteiros ativos (pan de 1 · pinça de ≥2), base do pan/pinça e flag de move.
  const pointers = useRef<Map<number, PointerRec>>(new Map())
  const panBase = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const pinchBase = useRef<{ d: number; mx: number; my: number; view: MapView } | null>(null)
  const movedRef = useRef(false)
  /** Ponteiro atual é TOQUE? Dedo real treme 5-15px num tap — com o limiar de
   *  mouse (3px) a maioria dos toques virava "micro-arraste" e o click era
   *  suprimido (report: "não to conseguindo editar" a pintura de região no
   *  celular; mesmo efeito nos taps de hex da exploração). Touch usa slop de
   *  plataforma (~12px); mouse/caneta seguem precisos em 3px. */
  const touchRef = useRef(false)
  /** #572: PINÇA por TOUCH EVENTS nativos (touchstart/touchmove no viewport,
   *  non-passive). Fallback dos pointer events: no Firefox Android a pinça
   *  não chegava como dois pointers ao hook — os `touches` do TouchEvent
   *  chegam sempre. Enquanto uma pinça de touch está ativa, o ramo de pinça
   *  por pointer é ignorado (senão aplicaria duas vezes onde os dois chegam). */
  const touchPinch = useRef<{ d: number; mx: number; my: number; view: MapView } | null>(null)
  /** View AO VIVO (report "pinch lerdo", 2026-09-24): durante pan/pinça o
   *  transform vai DIRETO no DOM (rAF) e o estado React — que re-renderiza
   *  rótulos, bairros e pinos — só sincroniza a cada ~120 ms e no fim do
   *  gesto. `liveRef` é sempre a view mais recente; `view` pode estar até
   *  120 ms atrás durante um gesto. */
  const liveRef = useRef<MapView>(IDENTITY)
  const gestoRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  /** Geometria medida UMA vez no início do gesto (base = sem transform):
   *  evita getBoundingClientRect a cada movimento (layout forçado). */
  const geoRef = useRef<Geo | null>(null)
  /** Resumo do gesto pro log de debug (#572): quantas entradas chegaram,
   *  quantos quadros o rAF pintou e o maior buraco entre eles — é o que
   *  distingue "o evento não chega" de "o quadro não sai" no aparelho. */
  const gestoStats = useRef<{ t0: number; entradas: number; quadros: number; tQuadro: number; gapMax: number; gapSoma: number; escala0: number } | null>(null)

  /** Restringe a translação pra o mapa NUNCA sair da viewport: quando a
   *  imagem cobre um eixo, a borda não pode entrar; quando é menor que a
   *  viewport, centraliza. Deriva o tamanho-base do rect ATUAL (mr/cur.scale) —
   *  independe do aspecto específico do mapa. `cur` = view pintada (o rect
   *  bate com ela); `next` = view proposta. */
  /** Mede a geometria base a partir do que está PINTADO agora (rect ÷ escala
   *  pintada; a translação pintada é a do liveRef quando o rAF já rodou, senão
   *  a anterior — por isso lê a escala do transform e a translação do rect). */
  const medirGeo = useCallback((): Geo | null => {
    const vpEl = viewportElRef.current
    const mapEl = mapRef.current
    if (!vpEl || !mapEl) return null
    const vp = vpEl.getBoundingClientRect()
    const mr = mapEl.getBoundingClientRect()
    if (!vp.width || !mr.width) return null
    const scale = escalaPintada(mapEl, liveRef.current.scale)
    const baseW = mr.width / scale
    const baseH = mr.height / scale
    // translação pintada: o rect já a inclui; a centralização base é o resto.
    const txPintado = liveRef.current.tx
    const tyPintado = liveRef.current.ty
    return {
      vpLeft: vp.left,
      vpTop: vp.top,
      vpW: vp.width,
      vpH: vp.height,
      baseW,
      baseH,
      layoutLeft: mr.left - vp.left - txPintado,
      layoutTop: mr.top - vp.top - tyPintado,
    }
  }, [])

  const clampView = useCallback(
    (_cur: MapView, next: MapView): MapView => {
      const g = geoRef.current ?? medirGeo()
      return g ? clampComGeo(g, next) : next
    },
    [medirGeo],
  )

  const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  /** Escreve o transform AO VIVO no DOM (rAF). O React NÃO re-renderiza no
   *  meio do gesto (#572: cada commit re-renderizava o painel inteiro do mapa
   *  e atrasava o toque seguinte); `view` sincroniza só no encerrarGesto.
   *  Rótulos/pinos contra-escalam pela var CSS `--map-escala`, escrita aqui. */
  const aplicarAoVivo = useCallback((next: MapView) => {
    const anterior = liveRef.current
    liveRef.current = next
    if (!gestoRef.current) {
      gestoRef.current = true
      gestoStats.current = { t0: agora(), entradas: 0, quadros: 0, tQuadro: 0, gapMax: 0, gapSoma: 0, escala0: anterior.scale }
    }
    const st = gestoStats.current
    if (st) st.entradas++
    if (rafRef.current === null && typeof requestAnimationFrame === 'function') {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const el = mapRef.current
        if (!el) return
        const v = liveRef.current
        el.style.willChange = 'transform'
        el.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
        el.style.setProperty('--map-escala', String(v.scale))
        const st2 = gestoStats.current
        if (st2) {
          const t = agora()
          if (st2.quadros > 0) {
            const gap = t - st2.tQuadro
            st2.gapSoma += gap
            if (gap > st2.gapMax) st2.gapMax = gap
          }
          st2.quadros++
          st2.tQuadro = t
        }
      })
    }
  }, [])

  /** Fim do gesto: commit imediato do React e solta o will-change. */
  const encerrarGesto = useCallback(() => {
    gestoRef.current = false
    geoRef.current = null
    const el = mapRef.current
    if (el) el.style.willChange = ''
    const st = gestoStats.current
    gestoStats.current = null
    if (st && st.entradas > 0) {
      const ms = Math.round(agora() - st.t0)
      pushLog('mapa', 'gesto', {
        ms,
        entradas: st.entradas,
        quadros: st.quadros,
        gapMedio: st.quadros > 1 ? Math.round(st.gapSoma / (st.quadros - 1)) : 0,
        gapMax: Math.round(st.gapMax),
        escala: [Number(st.escala0.toFixed(2)), Number(liveRef.current.scale.toFixed(2))],
        dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
        vp: viewportElRef.current ? `${viewportElRef.current.clientWidth}x${viewportElRef.current.clientHeight}` : '?',
      })
    }
    setView(liveRef.current)
    // `dragging` = "há gesto em curso" (o viewer troca pra imagem MÉDIA com
    // ele, #572): só apaga aqui, no único fim de gesto — inclusive da pinça
    // nativa por toque, que não passa por pointerup.
    setDragging(false)
  }, [])

  // Depois de cada render num gesto vivo, o React pode ter escrito o transform
  // COMMITADO (atrasado) — reaplica o vivo pra não dar salto pra trás.
  useLayoutEffect(() => {
    if (!gestoRef.current) return
    const el = mapRef.current
    if (!el) return
    const v = liveRef.current
    el.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
    el.style.setProperty('--map-escala', String(v.scale))
  })
  useEffect(
    () => () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  /** Zoom ancorado num ponto de cliente (roda/pinça/botões) — mesma conta de
   *  antes: leva a fração sob o âncora a permanecer sob ela. */
  /** Commit direto (roda/botões/reset): live e React juntos. */
  const commitView = useCallback((next: MapView) => {
    liveRef.current = next
    setView(next)
  }, [])

  const zoomBy = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const v = liveRef.current
      const scale = clampScale(v.scale * factor)
      if (scale === v.scale) return
      if (scale === ZOOM_MIN) {
        commitView(IDENTITY)
        return
      }
      const rect = mapRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) {
        commitView({ ...v, scale })
        return
      }
      const ax = cx ?? rect.left + rect.width / 2
      const ay = cy ?? rect.top + rect.height / 2
      const u = (ax - rect.left) / rect.width
      const w = (ay - rect.top) / rect.height
      const nextW = (rect.width / v.scale) * scale
      const nextH = (rect.height / v.scale) * scale
      const baseLeft = rect.left - v.tx
      const baseTop = rect.top - v.ty
      geoRef.current = null
      commitView(clampView(v, { scale, tx: ax - u * nextW - baseLeft, ty: ay - w * nextH - baseTop }))
    },
    [clampView, commitView],
  )

  const resetView = useCallback(() => commitView(IDENTITY), [commitView])

  /** Aplica a pinça: escala pela razão de distância a partir da view BASE,
   *  ancorada no ponto-médio (o âncora acompanha o pan dos dedos). A fração
   *  sob o âncora é medida na view base (largura base = rect/scale atual),
   *  então não deriva ao longo do gesto. */
  const aplicarPinca = useCallback(
    (base: { d: number; mx: number; my: number; view: MapView }, a: PointerRec, b: PointerRec) => {
      const d = dist(a, b)
      if (base.d <= 0) return
      movedRef.current = true
      const cur = liveRef.current
      const scale = clampScale(base.view.scale * (d / base.d))
      const g = geoRef.current ?? (geoRef.current = medirGeo())
      if (g) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const baseLeft = g.vpLeft + g.layoutLeft
        const baseTop = g.vpTop + g.layoutTop
        // fração da imagem sob o ponto-médio INICIAL, medida na view base
        const u = (base.mx - (baseLeft + base.view.tx)) / (g.baseW * base.view.scale)
        const w = (base.my - (baseTop + base.view.ty)) / (g.baseH * base.view.scale)
        aplicarAoVivo(clampComGeo(g, { scale, tx: mx - u * g.baseW * scale - baseLeft, ty: my - w * g.baseH * scale - baseTop }))
      } else {
        aplicarAoVivo({ ...cur, scale })
      }
    },
    [medirGeo, aplicarAoVivo],
  )

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) return
    e.preventDefault()
    const a = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
    const b = { x: e.touches[1]!.clientX, y: e.touches[1]!.clientY }
    touchPinch.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: liveRef.current }
    if (!geoRef.current) geoRef.current = medirGeo()
    panBase.current = null
    movedRef.current = true
    setDragging(true)
  }, [medirGeo])
  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const base = touchPinch.current
      if (!base || e.touches.length < 2) return
      e.preventDefault()
      aplicarPinca(
        base,
        { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY },
        { x: e.touches[1]!.clientX, y: e.touches[1]!.clientY },
      )
    },
    [aplicarPinca],
  )
  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (touchPinch.current) {
      if (e.touches.length >= 2) {
        const a = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
        const b = { x: e.touches[1]!.clientX, y: e.touches[1]!.clientY }
        touchPinch.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: liveRef.current }
        return
      }
      touchPinch.current = null
      // o dedo que sobrou vira pan a partir de onde está (sem salto)
      if (e.touches.length === 1) {
        const t = e.touches[0]!
        panBase.current = { x: t.clientX, y: t.clientY, tx: liveRef.current.tx, ty: liveRef.current.ty }
        for (const [id, p] of pointers.current) pointers.current.set(id, { ...p, x: t.clientX, y: t.clientY })
        return
      }
    }
    // Último dedo fora = fim do gesto, MESMO sem pointerup (Firefox Android
    // nem sempre entrega os pointers do toque): sem isto a view nunca
    // sincronizava e `dragging` ficava preso depois de pinça → pan → soltar.
    if (e.touches.length === 0 && gestoRef.current) {
      pointers.current.clear()
      panBase.current = null
      pinchBase.current = null
      encerrarGesto()
    }
  }, [encerrarGesto])

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY)
    },
    [zoomBy],
  )

  // Callback-ref: (re)liga o listener NATIVO non-passive de roda quando a
  // viewport monta/desmonta (React registra wheel como passivo na raiz).
  const viewportRef = useCallback(
    (el: HTMLDivElement | null) => {
      const prev = viewportElRef.current
      if (prev) {
        prev.removeEventListener('wheel', onWheel)
        prev.removeEventListener('touchstart', onTouchStart)
        prev.removeEventListener('touchmove', onTouchMove)
        prev.removeEventListener('touchend', onTouchEnd)
        prev.removeEventListener('touchcancel', onTouchEnd)
      }
      viewportElRef.current = el
      if (el) {
        // #572: o viewport é dono dos próprios toques — o swipe dos drawers
        // não pode armar num pan/pinça que começa aqui.
        marcarSuperficieDeGesto(el)
        el.addEventListener('wheel', onWheel, { passive: false })
        // #572: pinça por touch nativo (non-passive pra bloquear o zoom da página)
        el.addEventListener('touchstart', onTouchStart, { passive: false })
        el.addEventListener('touchmove', onTouchMove, { passive: false })
        el.addEventListener('touchend', onTouchEnd)
        el.addEventListener('touchcancel', onTouchEnd)
      }
    },
    [onWheel, onTouchStart, onTouchMove, onTouchEnd],
  )
  useEffect(() => {
    return () => {
      const el = viewportElRef.current
      if (el) {
        el.removeEventListener('wheel', onWheel)
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('touchend', onTouchEnd)
        el.removeEventListener('touchcancel', onTouchEnd)
      }
    }
  }, [onWheel, onTouchStart, onTouchMove, onTouchEnd])

  const fracAtClient = useCallback((clientX: number, clientY: number): Frac | null => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return { fx, fy }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      movedRef.current = false
      touchRef.current = e.pointerType === 'touch'
      setDragging(true)
      if (!geoRef.current) geoRef.current = medirGeo()
      const view = liveRef.current
      const pts = [...pointers.current.values()]
      if (pts.length >= 2) {
        // Início de pinça: baseline de distância/ponto-médio + view atual.
        const a = pts[0]! // pts.length >= 2
        const b = pts[1]!
        pinchBase.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view }
        panBase.current = null
      } else {
        panBase.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
      }
    },
    [medirGeo],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]

    // PINÇA (2+ ponteiros): escala pela razão de distância, ancorada no
    // ponto-médio inicial (que também acompanha o pan dos dedos). Se a pinça
    // por TOUCH nativo está ativa (#572), ela é quem aplica.
    if (pts.length >= 2 && pinchBase.current) {
      if (!touchPinch.current) aplicarPinca(pinchBase.current, pts[0]!, pts[1]!)
      return
    }
    // um dedo mexendo enquanto a pinça de touch está ativa: nada de pan
    if (touchPinch.current) return

    // PAN (1 ponteiro).
    const start = panBase.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    // Distância EUCLIDIANA (o slop de plataforma é um raio — Manhattan
    // penalizava tremida diagonal e ainda comia taps de ~10px).
    const slop = touchRef.current ? 12 : 3
    if (Math.hypot(dx, dy) > slop) movedRef.current = true
    if (movedRef.current) aplicarAoVivo(clampView(liveRef.current, { ...liveRef.current, tx: start.tx + dx, ty: start.ty + dy }))
  }, [clampView, aplicarPinca, aplicarAoVivo])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId)
      const view = liveRef.current
      const pts = [...pointers.current.values()]
      if (pts.length >= 2) {
        const a = pts[0]! // pts.length >= 2
        const b = pts[1]!
        pinchBase.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view }
      } else if (pts.length === 1) {
        pinchBase.current = null
        panBase.current = { x: pts[0]!.x, y: pts[0]!.y, tx: view.tx, ty: view.ty }
      } else {
        pinchBase.current = null
        panBase.current = null
        // pointercancel no meio da pinça nativa (o navegador desiste dos
        // pointers quando o 2º dedo pousa) NÃO encerra o gesto: o touchend faz.
        if (touchPinch.current) return
        setDragging(false)
        if (gestoRef.current) encerrarGesto()
      }
    },
    [encerrarGesto],
  )

  const consumeMoved = useCallback(() => {
    const m = movedRef.current
    movedRef.current = false
    return m
  }, [])

  const toggleFullscreen = useCallback(() => {
    setFullscreen((on) => {
      const el = containerRef.current
      if (!on) {
        // Melhor-esforço na API nativa (esconde a chrome do browser);
        // o overlay CSS (position:fixed) garante o efeito no iOS/Safari.
        try {
          el?.requestFullscreen?.().catch(() => {})
        } catch {
          /* iOS: sem API — o CSS resolve */
        }
        return true
      }
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {})
        }
      } catch {
        /* noop */
      }
      return false
    })
  }, [])

  // Sincroniza o estado quando o usuário sai da tela cheia por ESC/gesto.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen((on) => (on && !document.fullscreenElement ? false : on))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`

  return {
    view,
    dragging,
    readLiveView: () => liveRef.current,
    fullscreen,
    containerRef,
    viewportRef,
    mapRef,
    transform,
    fracAtClient,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeMoved,
    zoomBy,
    resetView,
    toggleFullscreen,
  }
}
