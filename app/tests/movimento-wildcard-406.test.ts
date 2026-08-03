// @vitest-environment node
// Report #406: na ficha de criatura do bestiário os movimentos ADICIONAIS
// apareciam sem atributo e "sempre tem uma linha com um * que não tá fazendo
// nenhum sentido". Duas divergências do app vs plugin:
//   1. `Definir Movimento.Lista.*.Bonus_Item -1` (Evolução Básica de Monstro,
//      Tier 0) — no plugin o setter só aplica em linha EXISTENTE (setMovimento,
//      merge-setters.ts:257-258: find → no-op), então o `*` é silencioso; o app
//      CRIAVA uma linha literal chamada "*" (ensureMovimentoRow).
//   2. `Complementar Movimento.Lista <nome>` cria a linha com atributo "FOR"
//      no plugin (merge-setters.ts:250); o app criava com '' (badge sumia).
import { describe, expect, it } from 'vitest'
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'

type Row = Record<string, unknown>

function movimentoRows(fm: Record<string, unknown>): Row[] {
  const mov = (fm['Movimento'] ?? {}) as Record<string, unknown>
  return (Array.isArray(mov['Lista']) ? mov['Lista'] : []) as Row[]
}

const SAVED = () => ({
  Movimento: {
    Lista: [{ Nome: 'Terrestre', Atributo: 'AGI', Bonus_Item: 0, Bonus_Especial: 0 }],
  },
})

describe('#406 — Movimento.Lista no merge espelha o plugin', () => {
  it('Definir Movimento.Lista.*.<campo> NUNCA cria linha "*" (no-op como o plugin)', () => {
    const out = mergeCalculatedIntoFm(SAVED(), { 'Movimento.Lista.*.Bonus_Item': -1 }, [])
    const rows = movimentoRows(out)
    expect(rows.map((r) => r.Nome)).toEqual(['Terrestre'])
  })

  it('Definir em movimento INEXISTENTE é no-op (não cria a linha)', () => {
    const out = mergeCalculatedIntoFm(SAVED(), { 'Movimento.Lista.Escavador.Atributo': 'FOR' }, [])
    expect(movimentoRows(out).map((r) => r.Nome)).toEqual(['Terrestre'])
  })

  it('Complementar cria a linha com Atributo FOR (default do plugin), e Definir aplica', () => {
    const out = mergeCalculatedIntoFm(
      SAVED(),
      { 'Movimento.Lista': ['Terrestre', 'Aquatico', 'Voador'] },
      [],
    )
    const rows = movimentoRows(out)
    expect(rows.map((r) => r.Nome)).toEqual(['Terrestre', 'Aquatico', 'Voador'])
    expect(rows[1]!.Atributo).toBe('FOR') // default do plugin, não ''
    // Definir sobre a linha criada pelo Complementar (caso Lagartóides pós-fix)
    const out2 = mergeCalculatedIntoFm(
      SAVED(),
      { 'Movimento.Lista': ['Aquatico'], 'Movimento.Lista.Aquatico.Atributo': 'AGI' },
      [],
    )
    const aquatico = movimentoRows(out2).find((r) => r.Nome === 'Aquatico')
    expect(aquatico?.Atributo).toBe('AGI')
  })
})
