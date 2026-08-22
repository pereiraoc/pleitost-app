// @vitest-environment node
// #481 (parte perícias) — rebaixar o rank mantinha Especialização/Maestria
// "válidas" penduradas na linha (ex.: volta pra A e a Maestria de M fica).
// Agora o rebaixamento LIMPA o que depende do rank (padrão dos resets
// centrais do wizard): < M perde a Maestria; < E perde Especialização (e a
// Maestria junto — ela depende da especialidade, #313).
import { describe, expect, it } from 'vitest'
import { applyPericiaRankEdit } from '../src/rules/apply-pericia-rank-edit'

const LINHA = {
  Nome: 'Arcana',
  Atributo: 'INT',
  Proficiencia: 'M',
  Bonus_Item: 0,
  Bonus_Especial: 0,
  Especializacao: '[[Truque Mágico]]',
  Maestria: '[[Utensílio Mágico]]',
  Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }, { M: 'Slot.M' }],
}

describe('#481 — rebaixar rank limpa especialidade/maestria dependentes', () => {
  it('M → E: perde a Maestria, mantém a Especialização', () => {
    const out = applyPericiaRankEdit([{ ...LINHA }], [], 'Arcana', 'E')
    const r = out[0]!
    expect(r.Proficiencia).toBe('E')
    expect(r['Maestria'] ?? '').toBe('')
    expect(r['Especializacao']).toBe('[[Truque Mágico]]')
  })

  it('M → A: perde Especialização E Maestria', () => {
    const out = applyPericiaRankEdit([{ ...LINHA }], [], 'Arcana', 'A')
    const r = out[0]!
    expect(r.Proficiencia).toBe('A')
    expect(r['Especializacao'] ?? '').toBe('')
    expect(r['Maestria'] ?? '').toBe('')
  })

  it('subir/manter rank NÃO mexe nos picks', () => {
    const out = applyPericiaRankEdit([{ ...LINHA }], [], 'Arcana', 'M')
    const r = out[0]!
    expect(r['Especializacao']).toBe('[[Truque Mágico]]')
    expect(r['Maestria']).toBe('[[Utensílio Mágico]]')
  })
})
