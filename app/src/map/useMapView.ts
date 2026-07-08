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
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

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

  /** Restringe a translação pra o mapa NUNCA sair da viewport: quando a
   *  imagem cobre um eixo, a borda não pode entrar; quando é menor que a
   *  viewport, centraliza. Deriva o tamanho-base do rect ATUAL (mr/cur.scale) —
   *  independe do aspecto específico do mapa. `cur` = view pintada (o rect
   *  bate com ela); `next` = view proposta. */
  const clampView = useCallback((cur: MapView, next: MapView): MapView => {
    const vpEl = viewportElRef.current
    const mapEl = mapRef.current
    if (!vpEl || !mapEl) return next
    const vp = vpEl.getBoundingClientRect()
    const mr = mapEl.getBoundingClientRect()
    if (!vp.width || !mr.width || !cur.scale) return next
    const baseW = mr.width / cur.scale
    const baseH = mr.height / cur.scale
    const layoutLeft = mr.left - vp.left - cur.tx // posição centrada do div (invariante ao pan)
    const layoutTop = mr.top - vp.top - cur.ty
    const sw = next.scale * baseW
    const sh = next.scale * baseH
    let tx = next.tx
    let ty = next.ty
    if (sw >= vp.width) {
      const maxTx = -layoutLeft
      const minTx = vp.width - sw - layoutLeft
      tx = Math.min(maxTx, Math.max(minTx, tx))
    } else {
      tx = (vp.width - sw) / 2 - layoutLeft
    }
    if (sh >= vp.height) {
      const maxTy = -layoutTop
      const minTy = vp.height - sh - layoutTop
      ty = Math.min(maxTy, Math.max(minTy, ty))
    } else {
      ty = (vp.height - sh) / 2 - layoutTop
    }
    return { scale: next.scale, tx, ty }
  }, [])

  /** Zoom ancorado num ponto de cliente (roda/pinça/botões) — mesma conta de
   *  antes: leva a fração sob o âncora a permanecer sob ela. */
  const zoomBy = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const scale = clampScale(v.scale * factor)
        if (scale === v.scale) return v
        if (scale === ZOOM_MIN) return IDENTITY
        const rect = mapRef.current?.getBoundingClientRect()
        if (!rect || rect.width <= 0) return { ...v, scale }
        const ax = cx ?? rect.left + rect.width / 2
        const ay = cy ?? rect.top + rect.height / 2
        const u = (ax - rect.left) / rect.width
        const w = (ay - rect.top) / rect.height
        const nextW = (rect.width / v.scale) * scale
        const nextH = (rect.height / v.scale) * scale
        const baseLeft = rect.left - v.tx
        const baseTop = rect.top - v.ty
        return clampView(v, { scale, tx: ax - u * nextW - baseLeft, ty: ay - w * nextH - baseTop })
      })
    },
    [clampView],
  )

  const resetView = useCallback(() => setView(IDENTITY), [])

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
      if (prev) prev.removeEventListener('wheel', onWheel)
      viewportElRef.current = el
      if (el) el.addEventListener('wheel', onWheel, { passive: false })
    },
    [onWheel],
  )
  useEffect(() => {
    return () => {
      const el = viewportElRef.current
      if (el) el.removeEventListener('wheel', onWheel)
    }
  }, [onWheel])

  const fracAtClient = useCallback((clientX: number, clientY: number): Frac | null => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return { fx, fy }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    movedRef.current = false
    setDragging(true)
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      // Início de pinça: baseline de distância/ponto-médio + view atual.
      const [a, b] = pts
      pinchBase.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view }
      panBase.current = null
    } else {
      panBase.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    }
  }, [view])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]

    // PINÇA (2+ ponteiros): escala pela razão de distância, ancorada no
    // ponto-médio inicial (que também acompanha o pan dos dedos).
    if (pts.length >= 2 && pinchBase.current) {
      const [a, b] = pts
      const d = dist(a, b)
      const base = pinchBase.current
      if (base.d > 0) {
        movedRef.current = true
        const scale = clampScale(base.view.scale * (d / base.d))
        const rect = mapRef.current?.getBoundingClientRect()
        if (rect && rect.width > 0) {
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          // âncora = ponto-médio ATUAL; parte da view base pra evitar deriva.
          const u = (base.mx - (rect.left - view.tx + base.view.tx)) / rect.width
          const w = (base.my - (rect.top - view.ty + base.view.ty)) / rect.height
          const nextW = (rect.width / view.scale) * scale
          const nextH = (rect.height / view.scale) * scale
          const baseLeft = rect.left - view.tx
          const baseTop = rect.top - view.ty
          setView(clampView(view, { scale, tx: mx - u * nextW - baseLeft, ty: my - w * nextH - baseTop }))
        } else {
          setView((v) => clampView(v, { ...v, scale }))
        }
      }
      return
    }

    // PAN (1 ponteiro).
    const start = panBase.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    if (movedRef.current) setView((v) => clampView(v, { ...v, tx: start.tx + dx, ty: start.ty + dy }))
  }, [view, clampView])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const [a, b] = pts
      pinchBase.current = { d: dist(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view }
    } else if (pts.length === 1) {
      pinchBase.current = null
      panBase.current = { x: pts[0].x, y: pts[0].y, tx: view.tx, ty: view.ty }
    } else {
      pinchBase.current = null
      panBase.current = null
      setDragging(false)
    }
  }, [view])

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
