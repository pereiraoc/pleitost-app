// FILTRO da aba TRANSPORTE (2026-09-09) — o mapa e o planejador passam a ser
// filtráveis por MODO (aeromóvel, ônibus…) e por CARTÃO: pelo plano (o Ouro
// abre o que o Prata e o Bronze abrem) ou só as linhas daquele cartão exato.
// Sem caminho com o filtro, o trecho se faz A PÉ — e o tempo a pé é o da rota
// que existiria com a malha inteira, vezes um fator do contexto.
import { describe, expect, it } from 'vitest'
import { corVisivel, linhasDoFiltro, type FiltroMalha, type LinhaMalha, type Malha } from '../src/transporte/malha'

const linha = (id: string, modo: string, nivel: number | null, paradas: string[], fechada = false): LinhaMalha =>
  ({ id, nome: id, modo, nivel, paradas, cor: '#123456', fechada, qualidade: 3 }) as unknown as LinhaMalha

const malha = {
  linhas: [
    linha('bronze-onibus', 'Ônibus', 2, ['A', 'B']),
    linha('prata-aero', 'Aeromóvel', 3, ['A', 'C']),
    linha('ouro-lot', 'Lotação', 4, ['C', 'D']),
    linha('platina-exec', 'Aeromóvel', 5, ['D', 'E']),
    linha('sem-plano', 'Informal', null, ['E', 'F']),
    linha('morta', 'Ônibus', 2, ['A', 'F'], true),
  ],
  paradas: new Map(),
} as unknown as Malha

const base: FiltroMalha = { modos: [], nivel: 4, exato: false }

describe('linhasDoFiltro', () => {
  it('por PLANO: o cartão abre tudo até o nível dele, mais o que não pede cartão', () => {
    const ids = linhasDoFiltro(malha, base).map((l) => l.id)
    expect(ids).toEqual(['bronze-onibus', 'prata-aero', 'ouro-lot', 'sem-plano'])
    expect(ids).not.toContain('platina-exec') // acima do cartão
    expect(ids).not.toContain('morta') // linha fechada nunca entra
  })
  it('EXATO: só as linhas daquele cartão (a linha sem cartão continua, é de graça)', () => {
    const ids = linhasDoFiltro(malha, { ...base, exato: true }).map((l) => l.id)
    expect(ids).toEqual(['ouro-lot', 'sem-plano'])
  })
  it('por MODO: filtra junto do cartão; lista vazia = todos os modos', () => {
    expect(linhasDoFiltro(malha, { ...base, modos: ['Aeromóvel'] }).map((l) => l.id)).toEqual(['prata-aero'])
    expect(linhasDoFiltro(malha, { ...base, modos: ['Aeromóvel', 'Ônibus'] }).map((l) => l.id)).toEqual(['bronze-onibus', 'prata-aero'])
    expect(linhasDoFiltro(malha, { ...base, nivel: 5, modos: ['Aeromóvel'] }).map((l) => l.id)).toEqual(['prata-aero', 'platina-exec'])
    expect(linhasDoFiltro(malha, base).length).toBeGreaterThan(1) // sem modo = todos
  })
})

describe('corVisivel', () => {
  it('no claro devolve a cor da nota, intacta', () => {
    expect(corVisivel('#111111', false)).toBe('#111111')
    expect(corVisivel('#1f5fbf', false)).toBe('#1f5fbf')
  })
  it('no escuro clareia o que sumiria no fundo (a Linha Executiva é #111)', () => {
    const clara = corVisivel('#111111', true)
    expect(clara).not.toBe('#111111')
    // clareou de verdade: cada canal subiu
    const canal = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
    for (const i of [0, 1, 2]) expect(canal(clara, i)).toBeGreaterThan(canal('#111111', i))
  })
  it('no escuro não mexe em cor que já aparece', () => {
    expect(corVisivel('#e9c46a', true)).toBe('#e9c46a')
    expect(corVisivel('#1f8f3f', true)).toBe('#1f8f3f')
  })
})

/* A PÉ: sem caminho com o filtro, o trecho se faz a pé — e o tempo sai do que
 * a malha INTEIRA levaria, vezes o fator do contexto. */
import { rotaAPe } from '../src/transporte/rotas'
import type { Parametros } from '../src/transporte/rotas'

const CFG = {
  categoria: 'Linha',
  mapa: 'M',
  modos: [{ nome: 'Ônibus', traco: 'cheio' as const, largura: 4, velocidade: 18, espera: 10, rua: true }],
  sinuosidade: 1,
  parada: 0,
  baldeacao: 5,
  aPe: { fator: 4, velocidade: 4.5 },
}
const P: Parametros = {
  cfg: CFG,
  metrosPorUnidade: 100,
  posicoes: new Map([
    ['A', { lat: 0, long: 0 }],
    ['B', { lat: 0, long: 30 }],
    ['Z', { lat: 0, long: 60 }],
  ]),
  transito: 1,
}
const comOnibus = [linha('onibus', 'Ônibus', 2, ['A', 'B'])]

describe('rotaAPe', () => {
  it('usa o tempo da rota que existiria na malha inteira, vezes o fator', () => {
    const a = rotaAPe(comOnibus, 'A', 'B', P)!
    expect(a.aPe).toBe(true)
    expect(a.pernas).toEqual([])
    // a rota de ônibus A→B leva alguns minutos; a pé leva 4× isso
    expect(a.minutos).toBeGreaterThan(0)
    const semFator = rotaAPe(comOnibus, 'A', 'B', { ...P, cfg: { ...CFG, aPe: { fator: 1, velocidade: 4.5 } } })!
    expect(a.minutos).toBe(semFator.minutos * 4)
  })
  it('sem rota nem na malha inteira, cai na distância direta e na velocidade a pé', () => {
    const semLinha = rotaAPe([], 'A', 'Z', P)!
    // 60 unidades × 100 m = 6 km a 4,5 km/h = 80 min
    expect(semLinha.minutos).toBe(80)
    expect(semLinha.km).toBe(6)
    expect(semLinha.aPe).toBe(true)
  })
  it('sem posição conhecida (ou origem = destino), não há estimativa', () => {
    expect(rotaAPe([], 'A', 'A', P)).toBeNull()
    expect(rotaAPe([], 'A', 'Fantasma', P)).toBeNull()
    expect(rotaAPe([], 'A', 'Z', { ...P, cfg: { ...CFG, aPe: undefined } })).toBeNull()
  })
})
