// @vitest-environment node
// TRAÇADO NO MAPA REAL (report 2026-09-10): as linhas do Atlas deixam de ser
// retas parada-a-parada e andam como no esquemático — cotovelo de metrô
// (eixo + 45°), linhas que dividem trecho correndo paralelas, cantos redondos.
import { describe, expect, it } from 'vitest'
import { caminhoArredondado, cotovelo, tracarLinhasNoMapa, type PontoXY } from '../src/transporte/tracado-mapa'

const pos: Record<string, PontoXY> = {
  A: { x: 0, y: 0 },
  B: { x: 100, y: 40 },
  C: { x: 100, y: 140 },
}
const ponto = (n: string) => pos[n] ?? null
const angulo = (a: PontoXY, b: PontoXY) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

describe('traçado da malha no mapa real', () => {
  it('cada trecho vira um cotovelo octilinear: só ângulos múltiplos de 45°', () => {
    const pts = cotovelo(pos.A!, pos.B!)
    expect(pts).toHaveLength(3)
    for (let i = 0; i < pts.length - 1; i++) {
      const g = angulo(pts[i]!, pts[i + 1]!)
      expect(Math.abs(g / 45 - Math.round(g / 45))).toBeLessThan(1e-9)
    }
    // trecho já reto: sem cotovelo
    expect(cotovelo(pos.B!, pos.C!)).toHaveLength(2)
  })

  it('duas linhas no mesmo trecho correm PARALELAS, uma de cada lado', () => {
    const t = tracarLinhasNoMapa(
      [
        { id: 'L1', paradas: ['A', 'B'] },
        { id: 'L2', paradas: ['B', 'A'] }, // sentido oposto: mesmo trecho
      ],
      ponto,
      { folga: 6, raio: 10 },
    )
    const p1 = t.get('L1')!.pontos
    const p2 = [...t.get('L2')!.pontos].reverse()
    expect(p1).toHaveLength(p2.length)
    // no primeiro segmento (horizontal), a distância entre elas é a folga
    expect(Math.abs(p1[0]!.y - p2[0]!.y)).toBeCloseTo(6, 5)
    expect(p1[0]!.x).toBeCloseTo(p2[0]!.x, 5)
  })

  it('linha sozinha no trecho passa pelo centro (sem deslocamento)', () => {
    const t = tracarLinhasNoMapa([{ id: 'L1', paradas: ['B', 'C'] }], ponto, { folga: 6, raio: 10 })
    expect(t.get('L1')!.pontos[0]).toEqual({ x: 100, y: 40 })
  })

  it('o cotovelo sai arredondado (curva) e a ponta chega na parada', () => {
    const t = tracarLinhasNoMapa([{ id: 'L1', paradas: ['A', 'B', 'C'] }], ponto, { folga: 6, raio: 10 })
    const d = t.get('L1')!.d
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d).toContain('Q')
    expect(d.endsWith('L100.0 140.0')).toBe(true)
  })

  it('reta contínua não ganha curva à toa', () => {
    expect(caminhoArredondado([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 5)).not.toContain('Q')
  })
})
