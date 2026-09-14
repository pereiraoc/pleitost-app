// @vitest-environment jsdom
// O PAINEL do filtro do bestiário — a lógica tem teste próprio
// (bestiario-filtro.test.ts); aqui se guarda o que o mestre pediu da TELA:
// "aquele filtro que tem que clicar no botão pra aparecer as opções pra não
// ocupar muito espaço". Ou seja: fechado por padrão, e o botão tem que contar
// o que está marcado, senão o filtro liga e a tela não avisa.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { IndexDocEntry, VaultDoc } from '../src/data/types'
import { FiltroDeBestiario } from '../src/components/creatures/CreaturesPages'
import { FILTRO_VAZIO } from '../src/components/creatures/filtro-bestiario'

const doc = (nome: string, Tier: number, classe: string, afiliacao: string, Modificador?: string): VaultDoc =>
  ({
    id: `c/${nome}`,
    basename: nome,
    frontmatter: {
      Tier,
      Classe: `[[${classe}]]`,
      'Afiliação': afiliacao,
      ...(Modificador ? { Modificador } : {}),
    },
  }) as unknown as VaultDoc

const FICHAS = [
  doc('Brigadiano de Esquina', 0, 'Soldado', '[[Brigada Militar Metropolitana]]'),
  doc('Exoesqueleto do BOPE', 2, 'Bruto', '[[Brigada Militar Metropolitana]]', 'Elite'),
  doc('O Despachante', 3, 'Assassino', '[[A Caixinha]]', 'Solo'),
]
const docs = new Map(FICHAS.map((d) => [d.id, d]))
const entries = FICHAS.map((d) => ({ id: d.id, basename: d.basename }) as IndexDocEntry)

afterEach(cleanup)

const montar = (filtro = FILTRO_VAZIO, onChange = vi.fn()) => {
  const r = render(
    <FiltroDeBestiario entries={entries} docs={docs} filtro={filtro} onChange={onChange} />,
  )
  return { ...r, onChange, botao: screen.getByRole('button', { name: 'Filtrar bestiário' }) }
}

describe('painel do filtro do bestiário', () => {
  it('nasce fechado: as opções só aparecem depois do clique', () => {
    const { botao, container } = montar()
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-filtro-bestiario]')).toBeNull()
    fireEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    const painel = container.querySelector('[data-filtro-bestiario]')!
    expect(painel).not.toBeNull()
    // os quatro grupos que o mestre pediu
    for (const g of ['TIER', 'MODIFICADOR', 'CLASSE', 'AFILIAÇÃO']) {
      expect(within(painel as HTMLElement).getByRole('group', { name: g })).toBeTruthy()
    }
  })

  it('marcar uma opção devolve o filtro novo pro chamador', () => {
    const { botao, onChange } = montar()
    fireEvent.click(botao)
    fireEvent.click(screen.getByRole('checkbox', { name: 'ELITE' }))
    expect(onChange).toHaveBeenCalledWith({ ...FILTRO_VAZIO, modificadores: ['Elite'] })
  })

  it('desmarcar tira só aquela opção', () => {
    const filtro = { ...FILTRO_VAZIO, tiers: [0, 3] }
    const { botao, onChange } = montar(filtro)
    fireEvent.click(botao)
    fireEvent.click(screen.getByRole('checkbox', { name: '0' }))
    expect(onChange).toHaveBeenCalledWith({ ...filtro, tiers: [3] })
  })

  it('fechado, o botão conta o que está marcado — filtro ligado não fica invisível', () => {
    const { botao } = montar({ ...FILTRO_VAZIO, tiers: [1, 2], classes: ['Bruto'] })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(botao.textContent).toContain('(3)')
    expect(screen.getByRole('button', { name: 'LIMPAR' })).toBeTruthy()
  })

  it('LIMPAR zera tudo de uma vez', () => {
    const { onChange } = montar({ ...FILTRO_VAZIO, tiers: [1], afiliacoes: ['A Caixinha'] })
    fireEvent.click(screen.getByRole('button', { name: 'LIMPAR' }))
    expect(onChange).toHaveBeenCalledWith(FILTRO_VAZIO)
  })

  it('sem nada marcado não há o que limpar', () => {
    montar()
    expect(screen.queryByRole('button', { name: 'LIMPAR' })).toBeNull()
  })
})
