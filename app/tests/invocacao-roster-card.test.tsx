// @vitest-environment jsdom
// #66: o card da invocação no roster de combate mostra nome + vida (X/máx +
// moral temporária) + defesas/stats + ataques (o EV não vira stat, já vira a
// vida). Render puro sobre um ActiveInvocacao resolvido.
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, cleanup, render, screen } from '@testing-library/react'
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
  it('padrão (pedido 2026-07-21): nome + vida/BARRA; stats e ataque SÓ no toggle 🛡️', () => {
    render(<InvocacaoRosterCard inv={inv} />)
    expect(screen.getByText(/Amálgama das Sombras/)).toBeTruthy()
    // vida: 22/30 + moral temporária 3 (número) + barra de vida presente
    expect(screen.getByText(/22\/30 \+3/)).toBeTruthy()
    // ataque e stats NÃO aparecem por padrão
    expect(screen.queryByText(/Pseudópode Sombrio/)).toBeNull()
    expect((document.body.textContent ?? '').includes('👣')).toBe(false)
    // toggle 🛡️ (o mesmo botão Ver defesas/stats das linhas) revela stats+ataque
    fireEvent.click(screen.getByTitle('Ver defesas/stats'))
    expect(screen.getByText(/Pseudópode Sombrio \+7 · 2d6\+3/)).toBeTruthy()
    const txt = document.body.textContent ?? ''
    expect(txt).toContain('👣')
    expect(txt).not.toContain('EV')
    // volta pra vida
    fireEvent.click(screen.getByTitle('Ver vida'))
    expect(screen.queryByText(/Pseudópode Sombrio/)).toBeNull()
  })

  it('sem resolved (invocador sem rank): mostra só o nome + vida, sem crashar', () => {
    render(<InvocacaoRosterCard inv={{ ...inv, resolved: null }} />)
    expect(screen.getByText(/Amálgama das Sombras/)).toBeTruthy()
    expect(screen.getByText(/22\/30/)).toBeTruthy()
  })
})
