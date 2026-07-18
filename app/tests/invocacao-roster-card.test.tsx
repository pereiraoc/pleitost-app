// @vitest-environment jsdom
// #66: o card da invocação no roster de combate mostra nome + vida (X/máx +
// moral temporária) + defesas/stats + ataques (o EV não vira stat, já vira a
// vida). Render puro sobre um ActiveInvocacao resolvido.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InvocacaoRosterCard } from '../src/components/sessao/SessaoPage'
import type { ActiveInvocacao } from '../src/interativa/invocacao'

afterEach(cleanup)

const inv: ActiveInvocacao = {
  label: 'Amálgama das Sombras',
  inst: { id: 'a', potencia: 6, vitalidade: 22, moralTemporaria: 3 },
  evMax: 30,
  resolved: {
    stats: { Defesa: 4, EV: 30, Movimento: 6 },
    ataques: [{ nome: 'Pseudópode Sombrio', tipo: 'Mental', bonus: 7, dano: '2d6+3' }],
  },
}

describe('InvocacaoRosterCard (#66)', () => {
  it('mostra nome, vida X/máx (+ temp), stats e ataque', () => {
    render(<InvocacaoRosterCard inv={inv} />)
    expect(screen.getByText(/Amálgama das Sombras/)).toBeTruthy()
    // vida: 22/30 + moral temporária 3
    expect(screen.getByText(/22\/30 \+3/)).toBeTruthy()
    // ataque com nome, bônus assinado e dano
    expect(screen.getByText(/Pseudópode Sombrio \+7 · 2d6\+3/)).toBeTruthy()
    // stats aparecem com EMOJI+valor (🛡️ 4 = Defesa, 👣 6 = Movimento); o EV
    // (que virou a vida) NÃO é listado como stat.
    const txt = document.body.textContent ?? ''
    expect(txt).toContain('🛡️')
    expect(txt).toContain('👣')
    expect(txt).not.toContain('EV')
  })

  it('sem resolved (invocador sem rank): mostra só o nome + vida, sem crashar', () => {
    render(<InvocacaoRosterCard inv={{ ...inv, resolved: null }} />)
    expect(screen.getByText(/Amálgama das Sombras/)).toBeTruthy()
    expect(screen.getByText(/22\/30/)).toBeTruthy()
  })
})
