// FILTRO v2 (2026-09-09) — a ordem dos modos segue o BOLSO (do que qualquer um
// paga ao que só o cartão caro abre), e o trajeto passa a mostrar o que falta:
// quando o cartão do jogador não abre uma perna, a rota vira mista — aquele
// trecho se faz a pé ou de táxi, com os dois tempos à vista.
import { describe, expect, it } from 'vitest'
import { modosPorPreco, type LinhaMalha, type Malha } from '../src/transporte/malha'
import { calcularRotasComAcesso, type Parametros } from '../src/transporte/rotas'

const linha = (id: string, modo: string, nivel: number | null, paradas: string[]): LinhaMalha =>
  ({ id, nome: id, modo, nivel, paradas, cor: '#123456', fechada: false, qualidade: 3, traco: 'cheio', largura: 4 }) as unknown as LinhaMalha

describe('modosPorPreco', () => {
  it('ordena pelo cartão mais barato que o modo aceita; o que não pede cartão vem antes', () => {
    const malha = {
      linhas: [
        linha('exec', 'Aeromóvel', 5, ['A', 'B']),
        linha('pop', 'Aeromóvel', 3, ['A', 'C']),
        linha('bus', 'Ônibus', 2, ['A', 'D']),
        linha('kombi', 'Kombi', null, ['A', 'E']),
        linha('vip', 'Lotação', 4, ['A', 'F']),
      ],
      paradas: new Map(),
    } as unknown as Malha
    // Kombi (sem cartão) · Ônibus (2) · Aeromóvel (3, pelo mais barato dele) · Lotação (4)
    expect(modosPorPreco(malha)).toEqual(['Kombi', 'Ônibus', 'Aeromóvel', 'Lotação'])
  })
  it('ignora linha fechada e não repete modo', () => {
    const malha = {
      linhas: [
        { ...linha('morta', 'Balsa', 2, ['A', 'B']), fechada: true },
        linha('b1', 'Ônibus', 3, ['A', 'B']),
        linha('b2', 'Ônibus', 2, ['A', 'C']),
      ],
      paradas: new Map(),
    } as unknown as Malha
    expect(modosPorPreco(malha)).toEqual(['Ônibus'])
  })
})

const CFG = {
  categoria: 'Linha',
  mapa: 'M',
  modos: [{ nome: 'Ônibus', traco: 'cheio' as const, largura: 4, velocidade: 20, espera: 0, rua: false }],
  sinuosidade: 1,
  parada: 0,
  baldeacao: 5,
  aPe: { fator: 4, velocidade: 4.5 },
  taxi: { fator: 0.6 },
}
const P: Parametros = {
  cfg: CFG,
  metrosPorUnidade: 100,
  posicoes: new Map([
    ['A', { lat: 0, long: 0 }],
    ['B', { lat: 0, long: 50 }],
    ['C', { lat: 0, long: 100 }],
  ]),
  transito: 1,
}
// o cartão do jogador abre só a primeira metade do caminho
const barata = linha('bus-baixo', 'Ônibus', 2, ['A', 'B'])
const cara = linha('bus-alto', 'Ônibus', 5, ['B', 'C'])

describe('calcularRotasComAcesso', () => {
  it('havendo caminho no filtro, devolve a rota normal e nada de a pé', () => {
    const [r] = calcularRotasComAcesso([barata], [barata, cara], 'A', 'B', P)
    expect(r!.pernas).toHaveLength(1)
    expect(r!.trechos ?? []).toEqual([])
  })
  it('sem acesso na segunda perna, o trecho vira caminhada OU táxi, com os dois tempos', () => {
    const [r] = calcularRotasComAcesso([barata], [barata, cara], 'A', 'C', P)
    expect(r).toBeTruthy()
    // a primeira perna continua sendo de ônibus; a segunda vira trecho sem acesso
    expect(r!.pernas.map((p) => p.linha.id)).toEqual(['bus-baixo'])
    const t = r!.trechos!
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ de: 'B', ate: 'C', bloqueada: 'bus-alto' })
    expect(t[0]!.aPe).toBeGreaterThan(t[0]!.taxi) // a pé é sempre mais lento que o táxi
    // o total soma a alternativa MAIS RÁPIDA (o táxi), e o tempo a pé fica à mostra
    expect(r!.minutos).toBe(r!.pernas.reduce((a, p) => a + p.viagem + p.espera + p.baldeacao, 0) + t[0]!.taxi)
  })
  it('sem caminho nem com a malha inteira, não inventa rota', () => {
    expect(calcularRotasComAcesso([barata], [barata], 'A', 'C', P)).toEqual([])
  })
})
