// Bônus de EFEITO (condições) nos tooltips do Combate (#262) — têm que sair
// VERDES (classe .pos) e penalidades vermelhas (.neg), como no pleitost-autosheet.
// Antes: defesas/sentidos/perícias nem mostravam no tooltip rico; ataque mostrava
// sem cor. Agora todos usam modAppendixHtml.
import { describe, expect, it } from 'vitest'
import { modAppendixHtml } from '../src/components/ficha/tooltips'

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
