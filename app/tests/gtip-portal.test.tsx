// @vitest-environment jsdom
// O tooltip da ficha de grupo nasce no BODY (report 2026-09-12: "a tooltip
// aparece lá no canto esquerdo — na aba de grupo MUITO"). A caixa é
// position:fixed; dentro de um ancestral com `transform` o "fixed" passa a
// medir por esse ancestral e a caixa vai pro canto. O portal pro body corta o
// problema na raiz — é o que o tooltip da ficha (tooltips.tsx) já fazia.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useGrupoTip } from '../src/grupo/gtip'

function Tela() {
  const tip = useGrupoTip()
  return (
    // o ancestral transformado que quebrava o position:fixed
    <div style={{ transform: 'translateY(0px)' }}>
      <button
        onMouseEnter={tip.tipE('riq:h3', { h: '<b>Cz$</b>', w: 420 })}
        onMouseMove={tip.move}
        onMouseLeave={tip.hide}
      >
        riqueza
      </button>
      {tip.overlay}
    </div>
  )
}

describe('tooltip da ficha de grupo', () => {
  it('o overlay é filho do body, não da tela transformada', () => {
    render(<Tela />)
    fireEvent.mouseEnter(screen.getByText('riqueza'), { clientX: 300, clientY: 200 })
    const overlay = document.body.querySelector('[data-gtip-overlay]')
    expect(overlay, 'a caixa apareceu').not.toBeNull()
    expect(overlay!.parentElement).toBe(document.body)
    expect((overlay as HTMLElement).style.position).toBe('fixed')
  })
})
