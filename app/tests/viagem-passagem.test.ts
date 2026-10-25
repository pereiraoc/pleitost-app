// PASSAGEM (2026-10-25): Caravana e Barco cobram por PESSOA por dia de viagem
// (FM `po_por_dia` do meio: Caravana 1, Barco 2); a pé e a cavalo não custam
// nada (são do próprio herói). Dia começado é dia pago: o trecho arredonda
// pra cima.
import { describe, expect, it } from 'vitest'
import { passagemPorPessoa, passagemDaViagem, type ViagemCfg, type Viagem } from '../src/grupo/viagem'

const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [{ chave: 'normal', nome: 'Gramado', custo: 1 }],
  meios: [
    { nome: 'A pé', icone: '🚶', hexPorDia: 2, em: ['normal'] },
    { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['normal'] },
    { nome: 'Caravana', icone: '🐪', hexPorDia: 4, em: ['normal'], poPorDia: 1, antigos: ['Carruagem'] },
    { nome: 'Barco', icone: '⛵', hexPorDia: 5, em: ['normal'], poPorDia: 2, antigos: ['Navio'] },
  ],
}

describe('passagem por pessoa', () => {
  it('a pé e a cavalo não custam nada', () => {
    expect(passagemPorPessoa(CFG, [{ meio: 'A pé', dias: 3 }, { meio: 'Cavalo', dias: 2 }])).toBe(0)
  })
  it('caravana 1 PO/dia, barco 2 PO/dia', () => {
    expect(passagemPorPessoa(CFG, [{ meio: 'Caravana', dias: 2 }, { meio: 'Barco', dias: 3 }])).toBe(8)
  })
  it('dia começado é dia pago (arredonda o trecho pra cima)', () => {
    expect(passagemPorPessoa(CFG, [{ meio: 'Caravana', dias: 0.5 }])).toBe(1)
    expect(passagemPorPessoa(CFG, [{ meio: 'Barco', dias: 1.2 }])).toBe(3)
  })
  it('nome antigo vale pelo novo (Navio → Barco)', () => {
    expect(passagemPorPessoa(CFG, [{ meio: 'Navio', dias: 1 }])).toBe(2)
  })
  it('a viagem soma os trechos', () => {
    const v = {
      trechos: new Map([
        [2, { dias: 1, meios: ['Caravana'], partes: [{ meio: 'Caravana', dias: 0.5 }], bloqueios: [] }],
        [5, { dias: 1, meios: ['Barco'], partes: [{ meio: 'Barco', dias: 1 }], bloqueios: [] }],
      ]),
    } as unknown as Viagem
    expect(passagemDaViagem(CFG, v)).toBe(3)
  })
})
