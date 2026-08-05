// @vitest-environment node
// #417 (era #296): as Essenciais entram no catálogo de não-aprendidas quando a
// proficiência OCULTA ArcanaEssencial ≥ A — espelho do isAllowed do plugin
// (view-model.ts:625-628: "gateia pela proficiência oculta ArcanaEssencial,
// NÃO MAIS Arcanista"). A regra antiga do #296 (classe Arcanista no primário)
// virou obsoleta quando o plugin passou o gate pra ArcanaEssencial — Truque
// Mágico/Utensílio Mágico concedem a qualquer classe. O trap do #296 segue:
// Bardo SEM concessão tem prof N e não vê Essencial.
import { describe, expect, it } from 'vitest'
import { shouldOfferEssenciais } from '../src/rules/projection'

describe('shouldOfferEssenciais (#417)', () => {
  it('sem concessão (prof N) → NÃO oferece — trap do #296 preservado', () => {
    expect(shouldOfferEssenciais('N')).toBe(false)
  })

  it('qualquer concessão (A/E/M) → oferece; o gate por RANK fica no caller', () => {
    expect(shouldOfferEssenciais('A')).toBe(true)
    expect(shouldOfferEssenciais('E')).toBe(true)
    expect(shouldOfferEssenciais('M')).toBe(true)
  })
})
