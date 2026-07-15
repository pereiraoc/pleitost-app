// Bônus de EFEITO (condições) nos tooltips do Combate (#262) — têm que sair
// VERDES (classe .pos) e penalidades vermelhas (.neg), como no pleitost-autosheet.
// Antes: defesas/sentidos/perícias nem mostravam no tooltip rico; ataque mostrava
// sem cor. Agora todos usam modAppendixHtml.
import { describe, expect, it } from 'vitest'
import { modAppendixHtml, periciaBreakdown } from '../src/components/ficha/tooltips'
import type { ProfRow } from '../src/components/ficha/hero-model'

// #256: o header do tooltip de perícia usa o emoji do ATRIBUTO REAL (não o 🧠
// fixo, que coincidia com o emoji de INT e fazia toda perícia parecer INT).
describe('periciaBreakdown header emoji (#256)', () => {
  const row = (attr: string, nome: string): ProfRow =>
    ({ Nome: nome, Atributo: attr, Rank: 'A' }) as unknown as ProfRow
  it('FOR → 💪, AGI → 💨, INT → 🧠, PRE → 🗣️ (não sempre 🧠)', () => {
    expect(periciaBreakdown(row('FOR', 'Atletismo'), { FOR: 3 }).headerEmoji).toBe('💪')
    expect(periciaBreakdown(row('AGI', 'Acrobacia'), { AGI: 3 }).headerEmoji).toBe('💨')
    expect(periciaBreakdown(row('INT', 'Arcanismo'), { INT: 3 }).headerEmoji).toBe('🧠')
    expect(periciaBreakdown(row('PRE', 'Intimidação'), { PRE: 3 }).headerEmoji).toBe('🗣️')
  })
})

describe('modAppendixHtml (#262)', () => {
  it('bônus positivo → linha VERDE (.pos); penalidade → VERMELHA (.neg)', () => {
    const html = modAppendixHtml('Defesa — Efeitos', [
      { label: 'Vantagem de Combate', value: 2 },
      { label: 'Amedrontado', value: -1 },
    ])
    expect(html).toMatch(/class="dv-breakdown-line pos"[^>]*>[^<]*Vantagem de Combate/)
    expect(html).toMatch(/class="dv-breakdown-line neg"[^>]*>[^<]*Amedrontado/)
  })

  it('dado extra (value 0) → verde, rótulo cru sem "(0)"', () => {
    const html = modAppendixHtml('T', [{ label: 'Encantar Arma (+1d12)', value: 0 }])
    expect(html).toContain('class="dv-breakdown-line pos"')
    expect(html).toContain('Encantar Arma (+1d12)')
    expect(html).not.toContain('(0)')
  })

  it('sem entries → vazio (não polui o tooltip)', () => {
    expect(modAppendixHtml('T', [])).toBe('')
  })
})
