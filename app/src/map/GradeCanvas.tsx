// CANVAS DA GRADE HEX (#573) — `<canvas>` em espaço de tela cobrindo a
// viewport, FORA do div transformado, que redesenha a malha do hexcrawl a
// cada quadro do gesto (relógio `onQuadro` do useMapView), em cada commit da
// view e no resize. A matemática mora em grade-tela.ts; aqui é só o ciclo de
// vida (tamanho × DPR, rAF coalescido, cor do tema).
//
// Sem contexto 2D (jsdom) o elemento existe (`data-hexgrid`,
// `data-grade-hexes`) e não desenha.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { MapView, UseMapView } from './useMapView'
import { desenharGrade, dprParaGrade, prepararGrade, type Celula, type Fonte, type Ponto } from './grade-tela'

const COR_PADRAO = '#ff7a00'

export function GradeCanvas({
  map,
  fonte,
  cells,
  vertices,
  alpha,
  cor,
}: {
  map: Pick<UseMapView, 'onQuadro' | 'geometriaBase' | 'view' | 'readLiveView'>
  fonte: Fonte
  cells: readonly Celula[]
  vertices: (col: number, row: number) => Ponto[]
  /** Opacidade da linha (o SVG usava color-mix do accent: 15% normal, 34% marcando). */
  alpha: number
  /** Cor da linha; ausente = `--accent` do tema (resolvida no canvas). */
  cor?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const viewRef = useRef<MapView>(map.view)
  /** quadro vindo do relógio do gesto (resolução limitada) ou commit (cheia) */
  const emGestoRef = useRef(false)
  // vértices e caixas calculados UMA vez por grade (não por quadro)
  const grade = useMemo(() => prepararGrade(cells, vertices), [cells, vertices])
  // props mais recentes pro desenho agendado (sem re-assinar o relógio)
  const propsRef = useRef({ fonte, grade, alpha, cor })
  propsRef.current = { fonte, grade, alpha, cor }
  const { onQuadro, geometriaBase, readLiveView } = map

  const desenhar = () => {
    const canvas = ref.current
    if (!canvas) return
    const geo = geometriaBase()
    if (!geo || !geo.vpW || !geo.vpH) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dprTela = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
    const dpr = dprParaGrade(dprTela, geo.vpW, geo.vpH, emGestoRef.current)
    const w = Math.round(geo.vpW * dpr)
    const h = Math.round(geo.vpH * dpr)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const p = propsRef.current
    const doTema = typeof getComputedStyle === 'function' ? getComputedStyle(canvas).getPropertyValue('--accent').trim() : ''
    const corResolvida = p.cor ?? (doTema || COR_PADRAO)
    desenharGrade(ctx, dpr, geo, viewRef.current, p.fonte, p.grade, { cor: corResolvida, alpha: p.alpha })
  }
  const agendar = () => {
    if (rafRef.current !== null || typeof requestAnimationFrame !== 'function') return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      desenhar()
    })
  }

  // relógio do gesto: a view viva chega aqui a cada quadro pintado
  useEffect(() => {
    const off = onQuadro((v) => {
      viewRef.current = v
      emGestoRef.current = true
      agendar()
    })
    return () => {
      off()
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onQuadro])
  // commit da view / dados novos / opacidade: redesenha
  useEffect(() => {
    viewRef.current = readLiveView()
    emGestoRef.current = false // commit da view: redesenha em resolução cheia
    agendar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.view, fonte, grade, alpha, cor, readLiveView])
  // resize da viewport (tela cheia, rotação)
  useEffect(() => {
    const canvas = ref.current
    const alvo = canvas?.parentElement
    if (!alvo || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => agendar())
    ro.observe(alvo)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  }
  return <canvas ref={ref} data-hexgrid="" data-grade-hexes={cells.length} aria-hidden style={style} />
}
