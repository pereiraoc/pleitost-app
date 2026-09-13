// @vitest-environment jsdom
// ZOOM DA FIGURA (2026-09-13): clicar na imagem do recurso amplia no Lightbox
// e MORRE ALI. Os dois `stopPropagation` são condição de funcionamento, não
// polimento: a faixa mora no <summary> de um <details> (o clique abriria ou
// fecharia o eixo) e a miniatura mora dentro da linha role="radio" (o clique
// TROCARIA O PLANO). Por isso também não dá pra usar o `onActivate` do
// TipHover, que escuta no <span> pai — o clique nunca chega lá.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RecursoFaixa, RecursoThumb } from '../src/components/ficha/RecursoThumb'
import type { Recurso } from '../src/recursos/types'

vi.mock('../src/data/assets', () => ({
  useAssetIndex: () => ({ porCaminho: new Map() }),
  resolveAsset: (_i: unknown, alvo: string) => (alvo ? { caminho: alvo } : null),
  assetUrlFor: (e: { caminho: string }, thumb: boolean) => `/vault-data/assets/${e.caminho}${thumb ? '?thumb' : ''}`,
}))

const comFigura: Recurso = {
  id: 'Contexto/Recursos/Transporte/Gurgel Carajás',
  nome: 'Gurgel Carajás',
  aliases: [],
  aba: 'Transporte',
  tipo: 'Veículo',
  marca: '',
  preco: 400000,
  cobranca: 'única',
  onde: [],
  resumo: 'jipe',
  imagem: 'Gurgel Carajás.png',
}
const semFigura: Recurso = { ...comFigura, nome: 'Sem Foto', imagem: undefined }

afterEach(cleanup)

describe('ampliar a figura do recurso', () => {
  it('a faixa do eixo amplia no clique, sem abrir nem fechar o eixo', () => {
    const aberto = vi.fn()
    render(
      <details open onToggle={aberto}>
        <summary>
          <RecursoFaixa r={comFigura} />
        </summary>
      </details>,
    )
    expect(document.querySelector('[data-lightbox]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ampliar imagem de Gurgel Carajás/ }))
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    expect(document.querySelector('details')!.open).toBe(true)
  })

  it('a miniatura amplia sem acionar a linha-rádio em volta', () => {
    const escolher = vi.fn()
    render(
      <div role="radio" aria-checked="false" onClick={escolher}>
        <RecursoThumb r={comFigura} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ampliar imagem/ }))
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    expect(escolher).not.toHaveBeenCalled()
  })

  it('Enter na figura amplia, e também não aciona a linha em volta', () => {
    const escolher = vi.fn()
    render(
      <div role="radio" aria-checked="false" onKeyDown={escolher}>
        <RecursoThumb r={comFigura} />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /Ampliar imagem/ }), { key: 'Enter' })
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    expect(escolher).not.toHaveBeenCalled()
  })

  // BUG do mestre (2026-09-13): clicava pra ampliar, abria, e clicar fora não
  // fechava — a imagem travava. Portal do React propaga o evento pela ÁRVORE DE
  // COMPONENTES, não pela do DOM: o clique no overlay fechava e subia até o
  // onClick da própria figura, que reabria na mesma hora.
  it('clicar fora FECHA, e não reabre nem aciona a linha em volta', () => {
    const escolher = vi.fn()
    render(
      <div role="radio" aria-checked="false" onClick={escolher}>
        <RecursoThumb r={comFigura} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ampliar imagem/ }))
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    escolher.mockClear()
    fireEvent.click(document.querySelector('[data-lightbox]') as HTMLElement)
    expect(document.querySelector('[data-lightbox]')).toBeNull()
    expect(escolher).not.toHaveBeenCalled()
  })

  it('clicar fora fecha também na faixa do eixo, sem mexer no <details>', () => {
    render(
      <details open>
        <summary>
          <RecursoFaixa r={comFigura} />
        </summary>
      </details>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ampliar imagem/ }))
    fireEvent.click(document.querySelector('[data-lightbox]') as HTMLElement)
    expect(document.querySelector('[data-lightbox]')).toBeNull()
    expect(document.querySelector('details')!.open).toBe(true)
  })

  it('Esc fecha', () => {
    render(<RecursoThumb r={comFigura} />)
    fireEvent.click(screen.getByRole('button', { name: /Ampliar imagem/ }))
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[data-lightbox]')).toBeNull()
  })

  it('figura que não tem imagem segue decorativa e não amplia', () => {
    render(<RecursoThumb r={semFigura} icone="🚗" />)
    expect(screen.queryByRole('button')).toBeNull()
    const span = document.querySelector('[data-recurso-figura="emoji"]') as HTMLElement
    expect(span.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(span)
    expect(document.querySelector('[data-lightbox]')).toBeNull()
  })
})
