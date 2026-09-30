// @vitest-environment jsdom
// #573 — toggles de A/B do mapa no MODO DEBUG: driver do transform, overlay
// assado e grade em canvas. É como o usuário compara no aparelho sem deploy
// novo; os valores vão em todo log `mapa/gesto`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { MAPA_DEBUG_PADRAO, escolherGrade, gravarMapaDebug, lerMapaDebug, useMapaDebug, __resetMapaDebugForTests } from '../src/map/mapa-debug'
import { useMapView } from '../src/map/useMapView'
import { clearLogs, getLogs, setDebugOn } from '../src/data/debug-log'

// padrão do repo: jsdom sem localStorage → storage falso em memória
function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})

beforeEach(() => {
  window.localStorage.clear()
  __resetMapaDebugForTests()
})
afterEach(() => {
  setDebugOn(false)
  clearLogs()
  vi.useRealTimers()
})

describe('#573 — lerMapaDebug / gravarMapaDebug', () => {
  it('sem chave, chave corrompida ou valores inválidos → padrões (auto, assar, auto)', () => {
    expect(lerMapaDebug()).toEqual(MAPA_DEBUG_PADRAO)
    window.localStorage.setItem('pleitost.debug.mapa', '{nope')
    __resetMapaDebugForTests()
    expect(lerMapaDebug()).toEqual(MAPA_DEBUG_PADRAO)
    window.localStorage.setItem('pleitost.debug.mapa', JSON.stringify({ driver: 'x', assar: 'sim', grade: 3 }))
    __resetMapaDebugForTests()
    expect(lerMapaDebug()).toEqual(MAPA_DEBUG_PADRAO)
  })
  it('gravar faz merge, persiste e o hook re-renderiza', () => {
    const { result } = renderHook(() => useMapaDebug())
    expect(result.current.driver).toBe('auto')
    act(() => gravarMapaDebug({ driver: 'estilo' }))
    expect(result.current).toEqual({ driver: 'estilo', assar: true, grade: 'auto' })
    act(() => gravarMapaDebug({ assar: false, grade: 'svg' }))
    expect(result.current).toEqual({ driver: 'estilo', assar: false, grade: 'svg' })
    expect(JSON.parse(window.localStorage.getItem('pleitost.debug.mapa')!)).toEqual({ driver: 'estilo', assar: false, grade: 'svg' })
    __resetMapaDebugForTests()
    expect(lerMapaDebug()).toEqual({ driver: 'estilo', assar: false, grade: 'svg' })
  })
})

describe('#573 — escolherGrade por motor', () => {
  it('auto = svg em todo motor (com o compositor o SVG não vira blob; o canvas custa por quadro no celular); canvas/svg forçam', () => {
    expect(escolherGrade('auto', { gecko: true, android: true })).toBe('svg')
    expect(escolherGrade('auto', { gecko: true, android: false })).toBe('svg')
    expect(escolherGrade('auto', { gecko: false, android: true })).toBe('svg')
    expect(escolherGrade('canvas', { gecko: false, android: false })).toBe('canvas')
    expect(escolherGrade('canvas', { gecko: true, android: true })).toBe('canvas')
  })
})

describe('#573 — log do gesto carrega driver/assar/grade', () => {
  it('pushLog mapa/gesto traz os três valores e o driver escolhido', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    setDebugOn(true)
    gravarMapaDebug({ assar: false, grade: 'svg' })
    function Host() {
      const map = useMapView()
      return (
        <div ref={map.viewportRef} data-vp="">
          <div ref={map.mapRef} style={{ transform: map.transform }} />
        </div>
      )
    }
    const { container } = render(<Host />)
    const vp = container.querySelector('[data-vp]') as HTMLElement
    const touchEv = (type: string, pts: Array<[number, number]>) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'touches', { value: pts.map(([x, y]) => ({ clientX: x, clientY: y })) })
      return e
    }
    act(() => { vp.dispatchEvent(touchEv('touchstart', [[100, 100], [200, 100]])) })
    act(() => { vp.dispatchEvent(touchEv('touchmove', [[100, 100], [300, 100]])) })
    act(() => { vi.advanceTimersByTime(20) })
    act(() => { vp.dispatchEvent(touchEv('touchend', [])) })
    const gesto = getLogs().find((l) => l.tag === 'mapa' && l.msg.startsWith('gesto'))
    expect(gesto).toBeTruthy()
    expect(gesto!.msg).toContain('"driver":"estilo"')
    expect(gesto!.msg).toContain('"assar":false')
    expect(gesto!.msg).toContain('"grade":"svg"')
    expect(gesto!.msg).toMatch(/"handlerMs":\d+/)
    expect(gesto!.msg).toMatch(/"handlerMax":[\d.]+/)
  })
})

describe('#573 — MapaDebugToggles', () => {
  it('mostra os três controles com o valor atual e grava ao mudar', async () => {
    const { MapaDebugToggles } = await import('../src/map/MapaDebugToggles')
    const { fireEvent, screen } = await import('@testing-library/react')
    render(<MapaDebugToggles />)
    const driver = screen.getByLabelText('Driver do transform do mapa') as HTMLSelectElement
    const assar = screen.getByLabelText('Overlay assado') as HTMLInputElement
    const grade = screen.getByLabelText('Grade hex do mapa') as HTMLSelectElement
    expect(driver.value).toBe('auto')
    expect(assar.checked).toBe(true)
    expect(grade.value).toBe('auto')
    fireEvent.change(driver, { target: { value: 'compositor' } })
    fireEvent.click(assar)
    fireEvent.change(grade, { target: { value: 'svg' } })
    expect(lerMapaDebug()).toEqual({ driver: 'compositor', assar: false, grade: 'svg' })
    expect(driver.value).toBe('compositor')
    expect(grade.value).toBe('svg')
  })
})
