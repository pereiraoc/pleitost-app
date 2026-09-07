// OFERTAS dos estabelecimentos (2026-09-07b): FM `Serviços` → ofertas
// (sufixo usado), rolagem determinística por semente com quantidade e
// disponibilidade pela linha da régua (config `recursos.disponibilidade`).
import { describe, expect, it } from 'vitest'
import { parseOfertas, rollOfertas, rngDe } from '../src/recursos/ofertas'
import { carajas, cesta, cfg, onibus, polar, porNome, recarga, uisque, estilos } from './fixtures/recursos-fixtures'

describe('parseOfertas', () => {
  it('lê wikilinks com sufixo usado/novo e ignora lixo', () => {
    expect(parseOfertas({ Serviços: ['[[Gurgel Carajás]]', '[[Gurgel Carajás]] usado', '[[Bicicleta Caloi 10|bike]] USADO', 'texto', 42] }, 'Serviços')).toEqual([
      { nome: 'Gurgel Carajás' },
      { nome: 'Gurgel Carajás', estado: 'usado' },
      { nome: 'Bicicleta Caloi 10', estado: 'usado' },
    ])
    expect(parseOfertas({}, 'Serviços')).toEqual([])
  })
})

describe('rollOfertas', () => {
  const ofertas = [{ nome: 'Gurgel Carajás' }, { nome: 'Gurgel Carajás', estado: 'usado' as const }, { nome: 'Polar Tradicional' }, { nome: 'Passagem de Ônibus' }, { nome: 'Recarga TRI' }, { nome: 'Transporte Classe Média' }, { nome: 'Nada' }]
  it('é determinística por semente; estilos e notas desconhecidas ficam fora', () => {
    const a = rollOfertas(ofertas, porNome, 'Grande Cidade', cfg, 1000, 1, 'X|2026-09-07')
    const b = rollOfertas(ofertas, porNome, 'Grande Cidade', cfg, 1000, 1, 'X|2026-09-07')
    expect(a).toEqual(b)
    expect(a.map((o) => o.key)).toEqual(['Gurgel Carajás#', 'Gurgel Carajás#usado', 'Polar Tradicional#', 'Passagem de Ônibus#', 'Recarga TRI#'])
    // passagem e recarga: ilimitadas; preço com a régua
    expect(a.find((o) => o.recurso === onibus)!.qtd).toBeNull()
    expect(a.find((o) => o.recurso === recarga)!.qtd).toBeNull()
    expect(a.find((o) => o.key === 'Gurgel Carajás#usado')!.preco).toBe(150000)
    const capital = rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Capital', cfg, 1000, 1.5, 'Y')
    expect(capital[0]!.preco).toBe(600000)
  })
  it('dentro da faixa da linha: sempre disponível; dois níveis fora: raro', () => {
    // Carajás (nível 5) numa Capital [3,6]: 100% em qualquer semente
    for (let i = 0; i < 20; i++) {
      const o = rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Capital', cfg, 1000, 1, `s${i}`)[0]!
      expect(o.disponivel).toBe(true)
      expect(o.qtd).toBeGreaterThanOrEqual(1)
    }
    // Carajás numa Boca de Bairro [1,3]: nível 5 → 2 fora → 20%
    let dispo = 0
    for (let i = 0; i < 200; i++) dispo += rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Pequena Cidade', cfg, 1000, 0.7, `s${i}`)[0]!.disponivel ? 1 : 0
    expect(dispo).toBeGreaterThan(15)
    expect(dispo).toBeLessThan(70)
    // usado conta um nível abaixo (4 → 1 fora → 50%)
    let dispoUsado = 0
    for (let i = 0; i < 200; i++) dispoUsado += rollOfertas([{ nome: 'Gurgel Carajás', estado: 'usado' }], porNome, 'Pequena Cidade', cfg, 1000, 0.7, `s${i}`)[0]!.disponivel ? 1 : 0
    expect(dispoUsado).toBeGreaterThan(dispo)
    // sem linha: faixa cheia
    expect(rollOfertas([{ nome: 'Uísque de Contrabando' }], porNome, null, cfg, 1000, 1, 'z')[0]!.disponivel).toBe(true)
    void uisque
    void cesta
    void polar
    void carajas
    void estilos
  })
  it('quantidade escala pelo fator da linha', () => {
    const soma = (linha: string, q: number) => {
      let t = 0
      for (let i = 0; i < 50; i++) t += rollOfertas([{ nome: 'Polar Tradicional' }], porNome, linha, cfg, 1000, q, `q${i}`)[0]!.qtd ?? 0
      return t
    }
    expect(soma('Iluminada', 1)).toBeGreaterThan(soma('Grande Cidade', 1))
    const rng = rngDe('a')
    expect(rng()).toBe(rngDe('a')())
  })
})
