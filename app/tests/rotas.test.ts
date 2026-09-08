// PLANEJADOR (2026-09-08b): trajetos com até duas baldeações, tempo pelos
// parâmetros do contexto (distância real × sinuosidade ÷ velocidade × atraso
// da qualidade × trânsito + paradas + espera + baldeação), top-N distintos.
import { describe, expect, it } from 'vitest'
import type { VaultDoc } from '../src/data/types'
import { montarMalha } from '../src/transporte/malha'
import { calcularRotas, distanciaKm, formatarMinutos, tempoNaLinha, type Parametros, type TransporteCfg } from '../src/transporte/rotas'

const cfg: TransporteCfg = {
  categoria: 'Linha',
  mapa: 'Malha',
  cidade: 'Cidade',
  sinuosidade: 1,
  parada: 1,
  baldeacao: 5,
  atrasoPorQualidade: [2, 1.5, 1, 1, 1],
  periodos: [{ nome: 'Pico', transito: 2 }, { nome: 'Normal', transito: 1 }],
  modos: [
    { nome: 'Aeromóvel', traco: 'cheio', largura: 7, velocidade: 60, espera: 4 },
    { nome: 'Ônibus', traco: 'cheio', largura: 4, velocidade: 30, espera: 10, rua: true },
  ],
}
function doc(basename: string, type: string, fm: Record<string, unknown>, extra: Partial<VaultDoc> = {}): VaultDoc {
  return { id: `x/${basename}`, path: `x/${basename}.md`, basename, type, subtype: String(fm.subcategoria ?? ''), grupo: null, frontmatter: fm, inlineFields: {}, ruleElements: [], links: [], images: [], headings: [], body: '', ...extra } as unknown as VaultDoc
}
// A —1km— B —1km— C (aeromóvel, ★5) ; B —1km— D (ônibus, ★1) ; A —1,414km— D (ônibus direto, ★5, diagonal)
const mapa = doc('Malha', 'Contexto', {}, { malha: { paradas: [{ nome: 'A', x: 0, y: 0 }, { nome: 'B', x: 1, y: 0 }, { nome: 'C', x: 2, y: 0 }, { nome: 'D', x: 1, y: -1 }] } })
const aero = doc('AERO', 'Linha', { subcategoria: 'Aeromóvel', Acesso: '[[TRI Prata]]', Qualidade: 5, Paradas: ['[[A]]', '[[B]]', '[[C]]'] })
const bus = doc('BUS', 'Linha', { subcategoria: 'Ônibus', Acesso: '[[TRI Bronze]]', Qualidade: 1, Paradas: ['[[B]]', '[[D]]'] })
const direto = doc('DIRETO', 'Linha', { subcategoria: 'Ônibus', Acesso: '[[TRI Bronze]]', Qualidade: 5, Paradas: ['[[A]]', '[[D]]'] })
const malha = montarMalha([mapa, aero, bus, direto], cfg, () => 3)
const posicoes = new Map([
  ['A', { lat: 0, long: 0 }],
  ['B', { lat: 0, long: 1000 }],
  ['C', { lat: 0, long: 2000 }],
  ['D', { lat: 1000, long: 1000 }],
])
const params = (transito = 1): Parametros => ({ cfg, metrosPorUnidade: 1, posicoes, transito })

describe('tempo numa linha', () => {
  it('distância × sinuosidade ÷ velocidade × qualidade × trânsito + paradas intermediárias', () => {
    expect(distanciaKm('A', 'C', params())).toBe(2)
    const AERO = malha.linhas.find((l) => l.nome === 'AERO')!
    // 2 km a 60 km/h = 2 min, ★5 = ×1, 1 parada intermediária = +1 → 3 min
    expect(tempoNaLinha(AERO, 0, 2, params())!.minutos).toBeCloseTo(3, 5)
    expect(tempoNaLinha(AERO, 2, 0, params())!.paradas).toEqual(['C', 'B', 'A']) // volta
    const BUS = malha.linhas.find((l) => l.nome === 'BUS')!
    // 1 km a 30 km/h = 2 min × ★1 (×2) = 4; no pico ×2 = 8 (ônibus é rua)
    expect(tempoNaLinha(BUS, 0, 1, params())!.minutos).toBeCloseTo(4, 5)
    expect(tempoNaLinha(BUS, 0, 1, params(2))!.minutos).toBeCloseTo(8, 5)
    expect(tempoNaLinha(AERO, 0, 1, params(2))!.minutos).toBeCloseTo(1, 5) // trilho não sofre trânsito
  })
})

describe('calcularRotas', () => {
  it('A→D: direto vs baldeação em B, ranqueadas pelo tempo com espera e baldeação', () => {
    const rotas = calcularRotas(malha, malha.linhas, 'A', 'D', params())
    expect(rotas.map((r) => r.linhas.map((id) => id.split('/')[1]))).toEqual([['DIRETO'], ['AERO', 'BUS']])
    // direto: espera 10 + 1,414 km/30 km/h = 2,83 min → 13
    expect(rotas[0]!.minutos).toBe(13)
    // baldeação: espera 4 + 1 min (A→B) + baldeação 5 + espera 10 + 4 min (B→D) = 24
    expect(rotas[1]!.minutos).toBe(24)
    expect(rotas[1]!.pernas[1]!.baldeacao).toBe(5)
    expect(rotas[1]!.paradas).toEqual(['A', 'B', 'D'])
  })
  it('no pico o ônibus direto perde pro aeromóvel + ônibus curto', () => {
    const rotas = calcularRotas(malha, malha.linhas, 'A', 'D', params(2))
    // direto: 10 + 5,66 = 16 ; baldeação: 4 + 1 + 5 + 10 + 8 = 28 → direto ainda ganha
    expect(rotas[0]!.linhas[0]).toContain('DIRETO')
    expect(rotas[0]!.minutos).toBe(16)
    expect(rotas[1]!.minutos).toBe(28)
  })
  it('só as linhas passadas contam (o cartão limita); sem caminho → vazio; mesma parada → vazio', () => {
    const soAero = malha.linhas.filter((l) => l.nome === 'AERO')
    expect(calcularRotas(malha, soAero, 'A', 'D', params())).toEqual([])
    expect(calcularRotas(malha, soAero, 'A', 'C', params()).length).toBe(1)
    expect(calcularRotas(malha, malha.linhas, 'A', 'A', params())).toEqual([])
  })
  it('formatarMinutos', () => {
    expect(formatarMinutos(35)).toBe('35 min')
    expect(formatarMinutos(65)).toBe('1h05')
  })
})
