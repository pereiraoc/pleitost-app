// @vitest-environment jsdom
// #259 — WIRING do gesto: o hook useEdgeSwipe instala listeners de pointer no
// document e, na solta, chama o callback certo. Aqui só o encanamento (o helper
// puro tem sua própria suíte em edge-swipe.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { useEdgeSwipe } from '../src/components/layout/useEdgeSwipe'

afterEach(cleanup)

/** Dispara um PointerEvent no document (jsdom não tem construtor PointerEvent;
 *  cai no MouseEvent com as props de pointer anexadas — o hook só lê clientX/
 *  clientY/pointerId/pointerType). */
function pointer(type: string, x: number, y: number, opts?: { pointerType?: string; id?: number }) {
  const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as unknown as {
    pointerId: number
    pointerType: string
  }
  ev.pointerId = opts?.id ?? 1
  ev.pointerType = opts?.pointerType ?? 'touch'
  // act(): a solta do gesto pode chamar setState (abre/fecha drawer) — flush
  // síncrono pra o próximo gesto já enxergar o estado novo (stateRef atualizado).
  act(() => {
    document.dispatchEvent(ev as unknown as Event)
  })
}

function setViewportWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
}

/** Harness: espelha o wiring do AppShell (estado dos dois drawers + hook). */
function Harness({ spy }: { spy: Record<string, ReturnType<typeof vi.fn>> }) {
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  useEdgeSwipe(
    { leftOpen, rightOpen },
    {
      openLeft: () => {
        spy.openLeft()
        setLeftOpen(true)
      },
      closeLeft: () => {
        spy.closeLeft()
        setLeftOpen(false)
      },
      openRight: () => {
        spy.openRight()
        setRightOpen(true)
      },
      closeRight: () => {
        spy.closeRight()
        setRightOpen(false)
      },
    },
  )
  return null
}

function makeSpy() {
  return {
    openLeft: vi.fn(),
    closeLeft: vi.fn(),
    openRight: vi.fn(),
    closeRight: vi.fn(),
  }
}

describe('useEdgeSwipe (#259 wiring)', () => {
  beforeEach(() => setViewportWidth(390)) // mobile

  it('swipe da borda esquerda pra direita abre a sidebar esquerda', () => {
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    pointer('pointerdown', 4, 300)
    pointer('pointerup', 120, 305)
    expect(spy.openLeft).toHaveBeenCalledTimes(1)
    expect(spy.openRight).not.toHaveBeenCalled()
  })

  it('swipe da borda direita pra esquerda abre a sidebar direita', () => {
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    pointer('pointerdown', 388, 300)
    pointer('pointerup', 268, 305)
    expect(spy.openRight).toHaveBeenCalledTimes(1)
    expect(spy.openLeft).not.toHaveBeenCalled()
  })

  it('não dispara com mouse (só touch/caneta)', () => {
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    pointer('pointerdown', 4, 300, { pointerType: 'mouse' })
    pointer('pointerup', 120, 305, { pointerType: 'mouse' })
    expect(spy.openLeft).not.toHaveBeenCalled()
  })

  it('não dispara em telas largas (>=1100px: sidebars não são drawers)', () => {
    setViewportWidth(1440)
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    pointer('pointerdown', 4, 300)
    pointer('pointerup', 120, 305)
    expect(spy.openLeft).not.toHaveBeenCalled()
    expect(spy.openRight).not.toHaveBeenCalled()
  })

  it('tap curto no meio da tela não mexe nas sidebars (não sequestra clique)', () => {
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    pointer('pointerdown', 195, 300)
    pointer('pointerup', 205, 305)
    expect(spy.openLeft).not.toHaveBeenCalled()
    expect(spy.openRight).not.toHaveBeenCalled()
  })

  it('com a esquerda aberta, swipe pra esquerda fecha (gesto oposto)', () => {
    const spy = makeSpy()
    render(<Harness spy={spy} />)
    // abre primeiro
    pointer('pointerdown', 4, 300)
    pointer('pointerup', 120, 305)
    expect(spy.openLeft).toHaveBeenCalledTimes(1)
    // agora, do meio pra esquerda, fecha
    pointer('pointerdown', 200, 300)
    pointer('pointerup', 90, 305)
    expect(spy.closeLeft).toHaveBeenCalledTimes(1)
  })

  // #572 — pinça/pan no MAPA dentro do painel de detalhes fechava o painel: o
  // gesto arma em qualquer pointerdown com drawer aberto e, na solta, um dedo
  // que andou na horizontal (metade de toda pinça) vira "close-right". O mapa
  // some debaixo do dedo e nenhum gesto seguinte chega nele.
  describe('superfície de gesto (mapa) e multi-toque (#572)', () => {
    /** Abre o drawer direito por swipe (estado real do Harness). */
    function abrirDireita(spy: ReturnType<typeof makeSpy>) {
      pointer('pointerdown', 386, 300)
      pointer('pointerup', 250, 305)
      expect(spy.openRight).toHaveBeenCalledTimes(1)
    }
    /** Dispara no ELEMENTO (borbulha até o document, como no browser). */
    function pointerEm(el: Element, type: string, x: number, y: number, id = 1) {
      const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as unknown as {
        pointerId: number
        pointerType: string
      }
      ev.pointerId = id
      ev.pointerType = 'touch'
      act(() => {
        el.dispatchEvent(ev as unknown as Event)
      })
    }

    it('pan de um dedo que começa numa superfície de gesto NÃO fecha o drawer', () => {
      const spy = makeSpy()
      const { container } = render(
        <>
          <Harness spy={spy} />
          <div data-gesture-surface="" />
        </>,
      )
      abrirDireita(spy)
      const mapa = container.querySelector('[data-gesture-surface]')!
      pointerEm(mapa, 'pointerdown', 200, 300)
      pointerEm(mapa, 'pointermove', 280, 302)
      pointerEm(mapa, 'pointerup', 330, 305)
      expect(spy.closeRight).not.toHaveBeenCalled()
    })

    it('segundo ponteiro (pinça) em qualquer lugar desarma o swipe', () => {
      const spy = makeSpy()
      render(<Harness spy={spy} />)
      abrirDireita(spy)
      pointer('pointerdown', 200, 300, { id: 1 })
      pointer('pointerdown', 240, 300, { id: 2 })
      // os dois dedos abrem: o ÚLTIMO a soltar anda 120 px pra direita (seria
      // "close-right" se o gesto ainda estivesse armado)
      pointer('pointerup', 80, 302, { id: 1 })
      pointer('pointerup', 360, 302, { id: 2 })
      expect(spy.closeRight).not.toHaveBeenCalled()
      // e o gesto seguinte, de um dedo só, volta a funcionar normalmente
      pointer('pointerdown', 200, 300, { id: 3 })
      pointer('pointerup', 330, 305, { id: 3 })
      expect(spy.closeRight).toHaveBeenCalledTimes(1)
    })
  })
})
