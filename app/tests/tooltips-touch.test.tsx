// @vitest-environment jsdom
// TipHover no TOQUE (#: celular sem hover) — o breakdown abre por TAP, não só
// por hover; e entriesBreakdown compõe os bônus aplicados (dano/AdO). Em jsdom
// window.matchMedia é undefined ⇒ CAN_HOVER=false ⇒ caminho de toque ativo.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TipHover, TipProvider, entriesBreakdown, renderBreakdownHtml } from '../src/components/ficha/tooltips'

afterEach(cleanup)

describe('TipHover — tap abre/fecha (celular)', () => {
  it('tap no alvo mostra o overlay do breakdown; tap de novo fecha', () => {
    render(
      <TipProvider>
        <TipHover html="<div>BREAKDOWN X</div>">
          <span>alvo</span>
        </TipHover>
      </TipProvider>,
    )
    expect(document.querySelector('.dv-breakdown-tip')).toBeNull()
    fireEvent.click(screen.getByText('alvo'))
    const tip = document.querySelector('.dv-breakdown-tip')
    expect(tip).toBeTruthy()
    expect(tip!.innerHTML).toContain('BREAKDOWN X')
    fireEvent.click(screen.getByText('alvo'))
    expect(document.querySelector('.dv-breakdown-tip')).toBeNull()
  })

  it('tap REAL (mouseEnter sintético + click) mostra em UM toque só', () => {
    // No celular um tap dispara mouseenter sintético E click. Antes os dois se
    // cancelavam (show + toggle) e exigiam 2 toques. Em toque, mouseenter não é
    // mais ligado, então um tap = um show.
    render(
      <TipProvider>
        <TipHover html="<div>BREAKDOWN Y</div>">
          <span>alvo</span>
        </TipHover>
      </TipProvider>,
    )
    const alvo = screen.getByText('alvo')
    const target = alvo.closest('.has-breakdown') as HTMLElement
    fireEvent.mouseEnter(target) // no toque: no-op (não abre nem "arma" nada)
    fireEvent.click(target)
    const tip = document.querySelector('.dv-breakdown-tip')
    expect(tip).toBeTruthy()
    expect(tip!.innerHTML).toContain('BREAKDOWN Y')
  })

  it('tap sem coords (clientX/Y=0) ancora no ALVO, não no canto (0,0)', () => {
    render(
      <TipProvider>
        <TipHover html="<div>BREAKDOWN Z</div>">
          <span>alvo</span>
        </TipHover>
      </TipProvider>,
    )
    const target = screen.getByText('alvo').closest('.has-breakdown') as HTMLElement
    target.getBoundingClientRect = () =>
      ({ left: 100, top: 150, right: 140, bottom: 190, width: 40, height: 40, x: 100, y: 150, toJSON: () => ({}) }) as DOMRect
    fireEvent.click(target) // jsdom: clientX/Y = 0 → cai no fallback do rect
    const tip = document.querySelector('.dv-breakdown-tip') as HTMLElement
    expect(tip).toBeTruthy()
    // x = 100 + 40/2 = 120 → left = 120 + 16 = 136px (NÃO 16px, que seria o canto)
    expect(tip.style.left).toBe('136px')
  })
})

describe('entriesBreakdown — bônus aplicados (dano/AdO)', () => {
  it('lista uma linha por entry + linha Base opcional', () => {
    const html = renderBreakdownHtml(
      entriesBreakdown(
        'Ataque de Oportunidade',
        [
          { label: 'Encantar Arma', value: 4 },
          { label: 'Maldição', value: -1 },
        ],
        { base: '1d4+2' },
      ),
    )
    expect(html).toContain('Ataque de Oportunidade')
    expect(html).toContain('1d4+2') // base
    expect(html).toContain('Encantar Arma')
    expect(html).toContain('Maldição')
  })
})
