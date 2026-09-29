// @vitest-environment jsdom
// #573 — o useMapView delega o transform do gesto ao DRIVER por motor e
// expõe o relógio de quadros (onQuadro) que a grade em canvas usa. jsdom não
// tem `animate` → driver estilo; o que se prova aqui é a integração do hook.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useMapView, type MapView } from '../src/map/useMapView'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] }))
afterEach(() => vi.useRealTimers())

const touchEv = (type: string, pts: Array<[number, number]>) => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'touches', { value: pts.map(([x, y]) => ({ clientX: x, clientY: y })) })
  return e
}

function Host({ contraEscala, quadros }: { contraEscala?: boolean; quadros: MapView[] }) {
  const map = useMapView(contraEscala ? { contraEscala: true } : undefined)
  // assina o relógio (onQuadro é estável; o cleanup desassina no unmount)
  const { onQuadro } = map
  React.useEffect(() => onQuadro((v) => {
    quadros.push(v)
  }), [onQuadro, quadros])
  return (
    <div ref={map.viewportRef} data-vp="">
      <div ref={map.mapRef} data-scale={map.view.scale} style={{ transform: map.transform }} />
      <button data-zoom onClick={() => map.zoomBy(2)} />
    </div>
  )
}
import React from 'react'

describe('#573 — useMapView + driver', () => {
  it('sem contraEscala a var --map-escala NÃO é escrita no gesto; com contraEscala é', () => {
    const q1: MapView[] = []
    const { container } = render(<Host quadros={q1} />)
    const vp = container.querySelector('[data-vp]') as HTMLElement
    const mapa = container.querySelector('[data-scale]') as HTMLElement
    act(() => { vp.dispatchEvent(touchEv('touchstart', [[100, 100], [200, 100]])) })
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[100, 100], [300, 100]])) })
    act(() => { vi.advanceTimersByTime(20) })
    expect(mapa.style.transform).toContain('scale(2)')
    expect(mapa.style.getPropertyValue('--map-escala')).toBe('')

    const q2: MapView[] = []
    const r2 = render(<Host contraEscala quadros={q2} />)
    const vp2 = r2.container.querySelector('[data-vp]') as HTMLElement
    const mapa2 = r2.container.querySelector('[data-scale]') as HTMLElement
    act(() => { vp2.dispatchEvent(touchEv('touchstart', [[100, 100], [200, 100]])) })
    act(() => { vp2.dispatchEvent(touchEv('touchmove', [[100, 100], [300, 100]])) })
    act(() => { vi.advanceTimersByTime(20) })
    expect(mapa2.style.getPropertyValue('--map-escala')).toBe('2')
  })

  it('onQuadro recebe a view pintada a cada quadro do gesto, no fim do gesto e no zoom por botão', () => {
    const quadros: MapView[] = []
    const { container } = render(<Host quadros={quadros} />)
    const vp = container.querySelector('[data-vp]') as HTMLElement
    act(() => { vp.dispatchEvent(touchEv('touchstart', [[100, 100], [200, 100]])) })
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[100, 100], [300, 100]])) })
    act(() => { vi.advanceTimersByTime(20) })
    expect(quadros.at(-1)?.scale).toBeCloseTo(2, 5)
    const n = quadros.length
    // fim do gesto: commit → notifica de novo com a view final
    act(() => { vp.dispatchEvent(touchEv('touchend', [])) })
    expect(quadros.length).toBeGreaterThan(n)
    expect(quadros.at(-1)?.scale).toBeCloseTo(2, 5)
    // zoom por botão (commitView) também notifica
    const antes = quadros.length
    act(() => { (container.querySelector('[data-zoom]') as HTMLElement).click() })
    expect(quadros.length).toBeGreaterThan(antes)
    expect(quadros.at(-1)?.scale).toBeCloseTo(4, 5)
  })

  it('geometriaBase devolve a caixa de layout do mapa (rect ÷ escala pintada, sem a translação)', () => {
    let geometria: (() => unknown) | null = null
    function Leitor() {
      const map = useMapView()
      geometria = map.geometriaBase
      return (
        <div ref={map.viewportRef} data-vp="">
          <div ref={map.mapRef} data-m="" style={{ transform: map.transform }} />
        </div>
      )
    }
    const { container } = render(<Leitor />)
    const vp = container.querySelector('[data-vp]') as HTMLElement
    const mapa = container.querySelector('[data-m]') as HTMLElement
    // jsdom não faz layout: rects zerados → null
    expect(geometria!()).toBeNull()
    vp.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320, x: 10, y: 20, toJSON() {} }) as DOMRect
    mapa.getBoundingClientRect = () => ({ left: 60, top: 20, width: 300, height: 300, right: 360, bottom: 320, x: 60, y: 20, toJSON() {} }) as DOMRect
    expect(geometria!()).toEqual({ vpLeft: 10, vpTop: 20, vpW: 400, vpH: 300, baseW: 300, baseH: 300, layoutLeft: 50, layoutTop: 0 })
  })
})
