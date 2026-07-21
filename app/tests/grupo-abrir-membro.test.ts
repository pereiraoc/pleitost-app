// N1: clicar no nome de um membro nas abas do grupo abre nos DETALHES (direita),
// não navega pra ficha cheia. Membro de sessão (id `sessao:<charId>`) →
// resumo-sessao; membro da vault/local → resumo.
import { describe, expect, it, vi } from 'vitest'
import { abrirMembroDetalhe } from '../src/grupo/panel-ui'
import type { DetailCtl, DetailTarget } from '../src/data/detail-context'

function mockDetail(): { ctl: DetailCtl; opened: DetailTarget[] } {
  const opened: DetailTarget[] = []
  const ctl = {
    stack: [],
    open: (t: DetailTarget) => opened.push(t),
    close: vi.fn(),
    back: vi.fn(),
  } as unknown as DetailCtl
  return { ctl, opened }
}

describe('abrirMembroDetalhe', () => {
  it('membro de SESSÃO (sessao:<id>) → resumo-sessao com o charId cru', () => {
    const { ctl, opened } = mockDetail()
    abrirMembroDetalhe(ctl, 'sessao:char-abc')
    expect(opened).toEqual([{ kind: 'resumo-sessao', id: 'char-abc' }])
  })

  it('membro da VAULT (id do doc) → resumo', () => {
    const { ctl, opened } = mockDetail()
    abrirMembroDetalhe(ctl, 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas')
    expect(opened).toEqual([{ kind: 'resumo', id: 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas' }])
  })

  it('no-op sem DetailCtl (fora do shell com painel) ou id vazio', () => {
    const { ctl, opened } = mockDetail()
    abrirMembroDetalhe(null, 'sessao:x')
    abrirMembroDetalhe(ctl, '')
    expect(opened).toEqual([])
  })
})
