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
