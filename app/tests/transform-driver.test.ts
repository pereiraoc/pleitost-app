// @vitest-environment jsdom
// #573 — DRIVER DE TRANSFORM do gesto do mapa, por motor. No Gecko (Firefox
// Android do usuário) `style.transform` escrito por JS a cada quadro obriga
// paint completo + re-raster de blob do SVG; uma animação de compositor
// (WAAPI) não. No Chromium a WAAPI por quadro PIORA (commit por quadro), então
// a escolha é por motor. jsdom não tem `Element.prototype.animate`: o driver
// compositor é exercitado com um `animate` falso que grava as chamadas.
import { describe, expect, it, vi } from 'vitest'
import { detectarAmbiente, escolherDriver, driverEstilo, driverCompositor } from '../src/map/transform-driver'

const UA_FIREFOX_ANDROID = 'Mozilla/5.0 (Android 16; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0'
const UA_FIREFOX_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0'
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36'
const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const view = (scale: number, tx: number, ty: number) => ({ scale, tx, ty })

/** `animate` falso: devolve um objeto Animation-like que grava tudo. */
function comAnimateFalso(el: HTMLElement) {
  const chamadas: string[] = []
  const anim = {
    effect: { setKeyframes: (kf: unknown) => chamadas.push(`setKeyframes:${JSON.stringify(kf)}`) },
    play: () => chamadas.push('play'),
    cancel: () => chamadas.push('cancel'),
    _t: 0,
    set currentTime(v: number) {
      chamadas.push(`currentTime=${v}`)
      this._t = v
    },
    get currentTime() {
      return this._t
    },
  }
  ;(el as unknown as { animate: unknown }).animate = (kf: unknown, opts: unknown) => {
    chamadas.push(`animate:${JSON.stringify(kf)}:${JSON.stringify(opts)}`)
    return anim
  }
  return { chamadas, anim }
}

describe('#573 — detectarAmbiente', () => {
  it('Firefox Android e Firefox desktop são Gecko; Chrome Android e Safari iOS (que dizem "like Gecko") não; Android só no celular/tablet', () => {
    expect(detectarAmbiente(UA_FIREFOX_ANDROID)).toEqual({ gecko: true, android: true })
    expect(detectarAmbiente(UA_FIREFOX_DESKTOP)).toEqual({ gecko: true, android: false })
    expect(detectarAmbiente(UA_CHROME_ANDROID)).toEqual({ gecko: false, android: true })
    expect(detectarAmbiente(UA_SAFARI_IOS)).toEqual({ gecko: false, android: false })
  })
})

describe('#573 — escolherDriver', () => {
  const el = () => document.createElement('div')
  it('auto: compositor só no Firefox ANDROID; Firefox desktop (estava bom) e os outros motores ficam no estilo', () => {
    const fxAndroid = el()
    comAnimateFalso(fxAndroid)
    expect(escolherDriver('auto', { gecko: true, android: true }, fxAndroid).nome).toBe('compositor')
    const fxDesktop = el()
    comAnimateFalso(fxDesktop)
    expect(escolherDriver('auto', { gecko: true, android: false }, fxDesktop).nome).toBe('estilo')
    const chromeEl = el()
    comAnimateFalso(chromeEl)
    expect(escolherDriver('auto', { gecko: false, android: true }, chromeEl).nome).toBe('estilo')
  })
  it('sem `animate` (jsdom) cai em estilo mesmo no Firefox Android e mesmo forçando compositor', () => {
    expect(escolherDriver('auto', { gecko: true, android: true }, el()).nome).toBe('estilo')
    expect(escolherDriver('compositor', { gecko: true, android: true }, el()).nome).toBe('estilo')
  })
  it('pref explícita vence a detecção: estilo no Firefox Android, compositor no Chromium', () => {
    const a = el()
    comAnimateFalso(a)
    expect(escolherDriver('estilo', { gecko: true, android: true }, a).nome).toBe('estilo')
    const b = el()
    comAnimateFalso(b)
    expect(escolherDriver('compositor', { gecko: false, android: false }, b).nome).toBe('compositor')
  })
})

describe('#573 — driver compositor (WAAPI)', () => {
  it('1ª aplicação cria UMA animação de duração infinita com keyframes constantes; as seguintes só trocam os keyframes (nunca play/currentTime: reiniciar deixa pending e o compositor mostra o valor de partida)', () => {
    const el = document.createElement('div')
    const { chamadas } = comAnimateFalso(el)
    driverCompositor.aplicar(el, view(3, 1, 2), { contraEscala: false })
    expect(chamadas).toEqual([
      'animate:[{"transform":"translate(1px, 2px) scale(3)"},{"transform":"translate(1px, 2px) scale(3)"}]:{"duration":1000000000,"fill":"forwards","easing":"linear"}',
    ])
    driverCompositor.aplicar(el, view(4, 5, 6), { contraEscala: false })
    expect(chamadas.slice(1)).toEqual([
      'setKeyframes:[{"transform":"translate(5px, 6px) scale(4)"},{"transform":"translate(5px, 6px) scale(4)"}]',
    ])
    expect(chamadas.some((c) => c === 'play' || c.startsWith('currentTime='))).toBe(false)
    // sem contraEscala a var NUNCA é tocada (restyle dos descendentes por quadro)
    expect(el.style.getPropertyValue('--map-escala')).toBe('')
  })
  it('encerrar escreve o transform final no style ANTES de cancelar (sem flash do transform antigo); descartar só cancela', () => {
    const el = document.createElement('div')
    const { chamadas, anim } = comAnimateFalso(el)
    driverCompositor.aplicar(el, view(2, 0, 0), { contraEscala: false })
    // intercepta o cancel pra registrar o style no momento da chamada
    const antesDoCancel: string[] = []
    anim.cancel = () => {
      antesDoCancel.push(el.style.transform)
      chamadas.push('cancel')
    }
    driverCompositor.encerrar(el, view(2.5, 7, 8), { contraEscala: false })
    expect(antesDoCancel).toEqual(['translate(7px, 8px) scale(2.5)'])
    expect(chamadas.at(-1)).toBe('cancel')
    expect(el.style.transform).toBe('translate(7px, 8px) scale(2.5)')
    // depois de encerrar, uma nova aplicação cria uma animação nova
    driverCompositor.aplicar(el, view(1, 0, 0), { contraEscala: false })
    expect(chamadas.filter((c) => c.startsWith('animate:')).length).toBe(2)
    driverCompositor.descartar(el)
    expect(chamadas.at(-1)).toBe('cancel')
    driverCompositor.descartar(null) // inofensivo
  })
  it('com contraEscala escreve --map-escala a cada aplicar e no encerrar (rótulos da POA seguem do tamanho certo)', () => {
    const el = document.createElement('div')
    comAnimateFalso(el)
    driverCompositor.aplicar(el, view(2, 0, 0), { contraEscala: true })
    expect(el.style.getPropertyValue('--map-escala')).toBe('2')
    driverCompositor.aplicar(el, view(3, 0, 0), { contraEscala: true })
    expect(el.style.getPropertyValue('--map-escala')).toBe('3')
    driverCompositor.encerrar(el, view(1.5, 0, 0), { contraEscala: true })
    expect(el.style.getPropertyValue('--map-escala')).toBe('1.5')
  })
})

describe('#573 — driver estilo (comportamento de antes, extraído do hook)', () => {
  it('aplicar escreve transform + will-change; encerrar fixa o transform e solta o will-change; var só com contraEscala', () => {
    const el = document.createElement('div')
    driverEstilo.aplicar(el, view(2, 3, 4), { contraEscala: false })
    expect(el.style.transform).toBe('translate(3px, 4px) scale(2)')
    expect(el.style.willChange).toBe('transform')
    expect(el.style.getPropertyValue('--map-escala')).toBe('')
    driverEstilo.encerrar(el, view(2.5, 3, 4), { contraEscala: false })
    expect(el.style.transform).toBe('translate(3px, 4px) scale(2.5)')
    expect(el.style.willChange).toBe('')
    const el2 = document.createElement('div')
    driverEstilo.aplicar(el2, view(2, 0, 0), { contraEscala: true })
    expect(el2.style.getPropertyValue('--map-escala')).toBe('2')
    driverEstilo.descartar(el2) // no-op
    driverEstilo.descartar(null)
  })
  it('spy: nenhum driver chama animate no estilo', () => {
    const el = document.createElement('div')
    const { chamadas } = comAnimateFalso(el)
    driverEstilo.aplicar(el, view(2, 0, 0), { contraEscala: false })
    expect(chamadas).toEqual([])
    vi.restoreAllMocks()
  })
})
