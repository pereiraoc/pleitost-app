// OFERTAS dos lugares (v3): FM `Serviços` em LISTA (o lugar é o
// estabelecimento) ou MAPA (comércio de rua por tipo de estabelecimento);
// rolagem determinística por semente com quantidade e disponibilidade pela
// linha da régua; planos e tarifas avulsas nunca entram na vitrine.
import { describe, expect, it } from 'vitest'
import { parseOfertas, parseOfertasAgrupadas, rollOfertas, rngDe } from '../src/recursos/ofertas'
import { cfg, kitnet, onibus, polar, porNome } from './fixtures/recursos-fixtures'

describe('parseOfertas', () => {
  it('lista: um grupo do próprio lugar; sufixo usado/novo; lixo ignorado', () => {
    expect(parseOfertasAgrupadas({ Serviços: ['[[Gurgel Carajás]]', '[[Gurgel Carajás]] usado', '[[Bicicleta Caloi 10|bike]] USADO', 'texto', 42] }, 'Serviços')).toEqual([
      { estabelecimento: null, ofertas: [{ nome: 'Gurgel Carajás' }, { nome: 'Gurgel Carajás', estado: 'usado' }, { nome: 'Bicicleta Caloi 10', estado: 'usado' }] },
    ])
    expect(parseOfertasAgrupadas({}, 'Serviços')).toEqual([])
  })
  it('mapa: um grupo por tipo de estabelecimento (comércio de rua do bairro)', () => {
    const g = parseOfertasAgrupadas({ Serviços: { 'Boteco de esquina': ['[[Polar Tradicional]]'], 'Banca de jornal': ['[[Elma Chips]]', '[[Chá Mate Leão]]'], Vazio: [] } }, 'Serviços')
    expect(g).toEqual([
      { estabelecimento: 'Boteco de esquina', ofertas: [{ nome: 'Polar Tradicional' }] },
      { estabelecimento: 'Banca de jornal', ofertas: [{ nome: 'Elma Chips' }, { nome: 'Chá Mate Leão' }] },
    ])
    expect(parseOfertas({ Serviços: { A: ['[[X]]'], B: ['[[Y]]'] } }, 'Serviços')).toEqual([{ nome: 'X' }, { nome: 'Y' }])
  })
})

describe('rollOfertas', () => {
  const ofertas = [{ nome: 'Gurgel Carajás' }, { nome: 'Gurgel Carajás', estado: 'usado' as const }, { nome: 'Polar Tradicional' }, { nome: 'Passagem de Ônibus' }, { nome: 'Transporte Classe Média' }, { nome: 'Kitnet do Aeromóvel' }, { nome: 'Nada' }]
  it('é determinística por semente; planos, tarifas avulsas e notas desconhecidas ficam fora; imóvel sai pelo preço de COMPRA', () => {
    const a = rollOfertas(ofertas, porNome, 'Grande Cidade', cfg, 1000, 1, 'X|2026-09-07')
    const b = rollOfertas(ofertas, porNome, 'Grande Cidade', cfg, 1000, 1, 'X|2026-09-07')
    expect(a).toEqual(b)
    expect(a.map((o) => o.key)).toEqual(['Gurgel Carajás#', 'Gurgel Carajás#usado', 'Polar Tradicional#', 'Kitnet do Aeromóvel#'])
    expect(a.find((o) => o.key === 'Gurgel Carajás#usado')!.preco).toBe(150000)
    const im = a.find((o) => o.recurso === kitnet)!
    expect(im.acao).toBe('comprar')
    expect(im.preco).toBe(600000)
    const capital = rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Capital', cfg, 1000, 1.5, 'Y')
    expect(capital[0]!.preco).toBe(600000)
    void onibus
  })
  it('dentro da faixa da linha: sempre disponível; dois níveis fora: raro; usado conta um nível abaixo', () => {
    for (let i = 0; i < 20; i++) {
      const o = rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Capital', cfg, 1000, 1, `s${i}`)[0]!
      expect(o.disponivel).toBe(true)
      expect(o.qtd).toBeGreaterThanOrEqual(1)
    }
    let dispo = 0
    for (let i = 0; i < 200; i++) dispo += rollOfertas([{ nome: 'Gurgel Carajás' }], porNome, 'Pequena Cidade', cfg, 1000, 0.7, `s${i}`)[0]!.disponivel ? 1 : 0
    expect(dispo).toBeGreaterThan(15)
    expect(dispo).toBeLessThan(70)
    let dispoUsado = 0
    for (let i = 0; i < 200; i++) dispoUsado += rollOfertas([{ nome: 'Gurgel Carajás', estado: 'usado' }], porNome, 'Pequena Cidade', cfg, 1000, 0.7, `s${i}`)[0]!.disponivel ? 1 : 0
    expect(dispoUsado).toBeGreaterThan(dispo)
    expect(rollOfertas([{ nome: 'Polar Tradicional' }], porNome, null, cfg, 1000, 1, 'z')[0]!.disponivel).toBe(true)
    void polar
  })
  it('quantidade escala pelo fator da linha; PRNG estável', () => {
    const soma = (linha: string) => {
      let t = 0
      for (let i = 0; i < 50; i++) t += rollOfertas([{ nome: 'Polar Tradicional' }], porNome, linha, cfg, 1000, 1, `q${i}`)[0]!.qtd ?? 0
      return t
    }
    expect(soma('Iluminada')).toBeGreaterThan(soma('Grande Cidade'))
    expect(rngDe('a')()).toBe(rngDe('a')())
  })
})
