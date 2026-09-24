// @vitest-environment jsdom
// #572 — PINÇA no mapa (touch): dois ponteiros afastando têm que AUMENTAR a
// escala do useMapView (e aproximando, diminuir), e um dedo só continua
// sendo pan. (jsdom não constrói PointerEvent com pointerId — os handlers
// do hook são chamados direto com eventos sintéticos, como o React faria.)
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMapView } from '../src/map/useMapView'

const el = { setPointerCapture: () => {} } as unknown as HTMLElement
const ev = (id: number, x: number, y: number) =>
  ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y, currentTarget: el }) as unknown as React.PointerEvent

describe('#572 — pinça com dois ponteiros de toque', () => {
  it('afastar os dedos aumenta a escala; aproximar diminui; soltar um volta ao pan', () => {
    const { result } = renderHook(() => useMapView())
    expect(result.current.view.scale).toBe(1)
    act(() => result.current.onPointerDown(ev(1, 100, 100)))
    act(() => result.current.onPointerDown(ev(2, 200, 100))) // distância 100
    act(() => result.current.onPointerMove(ev(2, 300, 100))) // distância 200 → ×2
    expect(result.current.view.scale).toBeCloseTo(2, 5)
    act(() => result.current.onPointerMove(ev(2, 250, 100))) // distância 150 → ×1.5
    expect(result.current.view.scale).toBeCloseTo(1.5, 5)
    // solta o 2º dedo: o 1º segue como pan, sem mexer na escala
    act(() => result.current.onPointerUp(ev(2, 250, 100)))
    act(() => result.current.onPointerMove(ev(1, 140, 100)))
    expect(result.current.view.scale).toBeCloseTo(1.5, 5)
    expect(result.current.consumeMoved()).toBe(true)
  })

  it('mexer o PRIMEIRO dedo durante a pinça também escala (sem virar pan)', () => {
    const { result } = renderHook(() => useMapView())
    act(() => result.current.onPointerDown(ev(1, 100, 100)))
    act(() => result.current.onPointerDown(ev(2, 200, 100)))
    act(() => result.current.onPointerMove(ev(1, 90, 100))) // distância 110 → ×1.1
    expect(result.current.view.scale).toBeCloseTo(1.1, 5)
    expect(result.current.view.tx).toBeCloseTo(0, 5)
  })
})

describe('#572 — pinça por TOUCH EVENTS nativos (fallback: Firefox Android não entregava dois pointers)', () => {
  function Host() {
    const map = useMapView()
    return (
      <div ref={map.viewportRef} data-vp="">
        <div ref={map.mapRef} data-scale={map.view.scale} />
      </div>
    )
  }
  const touchEv = (type: string, pts: Array<[number, number]>) => {
    const e = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'touches', { value: pts.map(([x, y]) => ({ clientX: x, clientY: y })) })
    return e
  }
  it('dois toques afastando escalam; touchend com um dedo encerra a pinça; a página não zooma (preventDefault)', async () => {
    const { render, act } = await import('@testing-library/react')
    const { container } = render(<Host />)
    const vp = container.querySelector('[data-vp]') as HTMLElement
    const escala = () => Number(container.querySelector('[data-scale]')!.getAttribute('data-scale'))
    const start = touchEv('touchstart', [[100, 100], [200, 100]])
    act(() => { vp.dispatchEvent(start) })
    expect(start.defaultPrevented).toBe(true)
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[100, 100], [300, 100]])) })
    expect(escala()).toBeCloseTo(2, 5)
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[100, 100], [250, 100]])) })
    expect(escala()).toBeCloseTo(1.5, 5)
    act(() => { vp.dispatchEvent(touchEv('touchend', [[100, 100]])) })
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[120, 100]])) })
    expect(escala()).toBeCloseTo(1.5, 5)
    // um dedo só: não é pinça, não previne o scroll da página
    const um = touchEv('touchstart', [[100, 100]])
    act(() => { vp.dispatchEvent(um) })
    expect(um.defaultPrevented).toBe(false)
  })
})
