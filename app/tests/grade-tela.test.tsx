// @vitest-environment jsdom
// #573 — GRADE HEX EM CANVAS DE TELA: a malha (11k segmentos) sai do SVG
// transformado (no Gecko era o blob mais caro a re-rasterizar por quadro) e
// vai pra um <canvas> em espaço de tela, fora do div do mapa, redesenhado a
// cada quadro a partir da view viva. O alinhamento com a imagem é provado
// aqui pela matemática, não a olho: o ponto de tela de um px da fonte tem que
// ser o MESMO que o SVG (viewBox = crop → caixa do div → transform) produz.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import {
  celulasVisiveis,
  desenharGrade,
  fonteParaTela,
  retanguloFonteVisivel,
  type Fonte,
} from '../src/map/grade-tela'
import { GradeCanvas } from '../src/map/GradeCanvas'
import type { Geo, MapView } from '../src/map/useMapView'

const geo: Geo = { vpLeft: 0, vpTop: 0, vpW: 800, vpH: 600, baseW: 800, baseH: 600, layoutLeft: 20, layoutTop: 0 }
const crop: Fonte = { x: 1000, y: 500, w: 2000, h: 1500 }
const identidade: MapView = { scale: 1, tx: 0, ty: 0 }

/** O que o SVG faz: viewBox = crop mapeia pra caixa do div (baseW×baseH), e a
 *  caixa recebe translate(tx,ty) scale(s) com origem 0 0, deslocada de layoutLeft/Top. */
function comoOSvg(g: Geo, v: MapView, f: Fonte, p: { x: number; y: number }) {
  const noDiv = { x: ((p.x - f.x) / f.w) * g.baseW, y: ((p.y - f.y) / f.h) * g.baseH }
  return { x: g.layoutLeft + v.tx + noDiv.x * v.scale, y: g.layoutTop + v.ty + noDiv.y * v.scale }
}

describe('#573 — fonteParaTela = o ponto que o SVG produziria', () => {
  it('identidade: cantos do crop caem nos cantos da caixa do div', () => {
    expect(fonteParaTela(geo, identidade, crop, { x: 1000, y: 500 })).toEqual({ x: 20, y: 0 })
    expect(fonteParaTela(geo, identidade, crop, { x: 3000, y: 2000 })).toEqual({ x: 820, y: 600 })
  })
  it('com pan e zoom, e com crop deslocado, bate com a conta do SVG', () => {
    const v: MapView = { scale: 2, tx: -100, ty: -50 }
    expect(fonteParaTela(geo, v, crop, { x: 2000, y: 1250 })).toEqual({ x: 720, y: 550 })
    for (const p of [{ x: 1000, y: 500 }, { x: 1234, y: 987 }, { x: 2999, y: 1999 }]) {
      for (const view of [identidade, v, { scale: 0.5, tx: 30, ty: 40 }, { scale: 8, tx: -3000, ty: -2000 }]) {
        expect(fonteParaTela(geo, view, crop, p)).toEqual(comoOSvg(geo, view, crop, p))
      }
    }
  })
  it('fonte inteira (crop 0,0,W,H) = p/W·baseW·scale + tx + layoutLeft', () => {
    const tudo: Fonte = { x: 0, y: 0, w: 7440, h: 5262 }
    const v: MapView = { scale: 3, tx: -500, ty: -200 }
    const p = { x: 3720, y: 2631 }
    expect(fonteParaTela(geo, v, tudo, p)).toEqual({ x: (3720 / 7440) * 800 * 3 - 500 + 20, y: (2631 / 5262) * 600 * 3 - 200 + 0 })
  })
})

describe('#573 — retanguloFonteVisivel', () => {
  it('inverte a viewport pra px da fonte e clampa ao crop', () => {
    expect(retanguloFonteVisivel(geo, identidade, crop)).toEqual({ x: 1000, y: 500, w: 1950, h: 1500 })
    // zoom 2 ancorado no canto: só a metade esquerda/superior da caixa aparece
    const v: MapView = { scale: 2, tx: -20, ty: 0 }
    const r = retanguloFonteVisivel(geo, v, crop)
    expect(r.x).toBe(1000)
    expect(r.y).toBe(500)
    expect(r.w).toBe(1000)
    expect(r.h).toBe(750)
  })
})

/** Grade de teste: célula (col,row) é o quadrado de 100 px em (col·100, row·100). */
const quadrado = (col: number, row: number) => [
  { x: col * 100, y: row * 100 },
  { x: col * 100 + 100, y: row * 100 },
  { x: col * 100 + 100, y: row * 100 + 100 },
  { x: col * 100, y: row * 100 + 100 },
  { x: col * 100, y: row * 100 + 100 },
  { x: col * 100, y: row * 100 },
]
const todas = Array.from({ length: 100 }, (_, i) => ({ col: i % 10, row: Math.floor(i / 10) }))

describe('#573 — celulasVisiveis', () => {
  it('só as células cuja caixa toca o retângulo (mais a margem)', () => {
    const vis = celulasVisiveis(todas, quadrado, { x: 250, y: 250, w: 100, h: 100 }, 0)
    expect(vis.map((c) => `${c.col},${c.row}`).sort()).toEqual(['2,2', '2,3', '3,2', '3,3'])
    const comMargem = celulasVisiveis(todas, quadrado, { x: 250, y: 250, w: 100, h: 100 }, 100)
    expect(comMargem.length).toBe(16)
  })
  it('retângulo cobrindo tudo → todas as células', () => {
    expect(celulasVisiveis(todas, quadrado, { x: 0, y: 0, w: 1000, h: 1000 }, 0).length).toBe(100)
  })
})

function contextoFalso() {
  const chamadas: string[] = []
  const ctx = {
    lineWidth: 0,
    strokeStyle: '',
    globalAlpha: 1,
    setTransform: (...a: number[]) => chamadas.push(`setTransform:${a.join(',')}`),
    clearRect: (...a: number[]) => chamadas.push(`clearRect:${a.join(',')}`),
    beginPath: () => chamadas.push('beginPath'),
    moveTo: (x: number, y: number) => chamadas.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => chamadas.push(`lineTo:${x},${y}`),
    stroke: () => chamadas.push('stroke'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, chamadas }
}

describe('#573 — desenharGrade', () => {
  it('limpa, configura 1 px de tela, traça v2→v3→v4→v5 de cada célula visível em coordenadas de tela e dá UM stroke', () => {
    const { ctx, chamadas } = contextoFalso()
    const fonte: Fonte = { x: 0, y: 0, w: 1000, h: 1000 }
    const g: Geo = { ...geo, baseW: 1000, baseH: 1000, layoutLeft: 0, vpW: 1000, vpH: 1000 }
    // duas células, identidade: coordenadas de tela = da fonte
    const n = desenharGrade(ctx, 2, g, identidade, fonte, [{ col: 0, row: 0 }, { col: 9, row: 9 }], quadrado, { cor: '#f70', alpha: 0.15 })
    expect(n).toBe(2)
    expect(chamadas.slice(0, 3)).toEqual(['setTransform:2,0,0,2,0,0', 'clearRect:0,0,1000,1000', 'beginPath'])
    expect(chamadas.slice(3, 7)).toEqual(['moveTo:100,100', 'lineTo:0,100', 'lineTo:0,100', 'lineTo:0,0'])
    expect(chamadas.slice(7, 11)).toEqual(['moveTo:1000,1000', 'lineTo:900,1000', 'lineTo:900,1000', 'lineTo:900,900'])
    expect(chamadas.at(-1)).toBe('stroke')
    expect(chamadas.filter((c) => c === 'stroke').length).toBe(1)
    expect((ctx as unknown as { lineWidth: number }).lineWidth).toBe(1)
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(0.15)
    expect((ctx as unknown as { strokeStyle: string }).strokeStyle).toBe('#f70')
  })
  it('célula fora da viewport não é traçada', () => {
    const { ctx, chamadas } = contextoFalso()
    const fonte: Fonte = { x: 0, y: 0, w: 1000, h: 1000 }
    const g: Geo = { ...geo, baseW: 1000, baseH: 1000, layoutLeft: 0, vpW: 100, vpH: 100 }
    const n = desenharGrade(ctx, 1, g, identidade, fonte, todas, quadrado, { cor: '#f70', alpha: 0.15 })
    // viewport 100×100 em identidade cobre só (0,0) e, pela margem de 1 célula, as vizinhas
    expect(n).toBeLessThan(10)
    expect(chamadas.filter((c) => c.startsWith('moveTo')).length).toBe(n)
  })
})

describe('#573 — GradeCanvas', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  const mapFalso = () => {
    const subs = new Set<(v: MapView) => void>()
    return {
      view: identidade,
      readLiveView: () => identidade,
      onQuadro: (cb: (v: MapView) => void) => {
        subs.add(cb)
        return () => subs.delete(cb)
      },
      geometriaBase: () => geo,
      quadro: (v: MapView) => subs.forEach((cb) => cb(v)),
    }
  }
  it('sem contexto 2D (jsdom) renderiza o canvas com data-hexgrid e data-grade-hexes sem estourar', () => {
    const map = mapFalso()
    const { container } = render(
      <GradeCanvas map={map} fonte={crop} cells={todas} vertices={quadrado} alpha={0.15} />,
    )
    const c = container.querySelector('canvas[data-hexgrid]') as HTMLCanvasElement
    expect(c).toBeTruthy()
    expect(c.getAttribute('data-grade-hexes')).toBe('100')
    act(() => map.quadro({ scale: 2, tx: 0, ty: 0 }))
    act(() => { vi.advanceTimersByTime(20) })
  })
  it('várias notificações no mesmo quadro = UM redesenho (rAF coalescido); cada quadro redesenha', () => {
    const { ctx, chamadas } = contextoFalso()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as RenderingContext)
    const map = mapFalso()
    render(<GradeCanvas map={map} fonte={crop} cells={todas} vertices={quadrado} alpha={0.15} />)
    act(() => { vi.advanceTimersByTime(20) }) // desenho inicial
    const n0 = chamadas.filter((c) => c === 'stroke').length
    expect(n0).toBeGreaterThanOrEqual(1)
    act(() => {
      map.quadro({ scale: 1.1, tx: 0, ty: 0 })
      map.quadro({ scale: 1.2, tx: 0, ty: 0 })
      map.quadro({ scale: 1.3, tx: 0, ty: 0 })
    })
    act(() => { vi.advanceTimersByTime(20) })
    expect(chamadas.filter((c) => c === 'stroke').length).toBe(n0 + 1)
    act(() => map.quadro({ scale: 1.4, tx: 0, ty: 0 }))
    act(() => { vi.advanceTimersByTime(20) })
    expect(chamadas.filter((c) => c === 'stroke').length).toBe(n0 + 2)
  })
})
