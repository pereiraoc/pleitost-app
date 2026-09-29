// DRIVER DE TRANSFORM DO GESTO (#573) — como o pan/pinça chega ao DOM, por
// motor de navegador.
//
// Medido em 2026-09-29 (build de produção, Playwright Firefox + Gecko Profiler,
// Chromium + trace, sequência pinça→pan→pinça→pan ×2):
//   • Gecko (Firefox Android = celular/tablet do usuário): `style.transform`
//     escrito por JS a cada quadro obriga PAINT COMPLETO do subtree
//     transformado e RE-RASTER DE BLOB (CPU, 8 threads) de todo SVG com
//     conteúdo pesado dentro dele — ~280 rasterizações por gesto no /mapa,
//     ~150 (muito mais caras) na Exploração. Uma ANIMAÇÃO DE COMPOSITOR
//     (Web Animations) do mesmo transform é assumida pelo compositor: blobs
//     1688 → 36 por sequência, paint 2,4 → 1,2 ms/quadro, thread Renderer
//     −80%; vale até 8× de zoom e em tela cheia (2767 → 303).
//   • Chromium mantém a camada composta com `will-change` e só aplica o
//     transform na GPU: o estilo direto já é o melhor caminho, e a MESMA
//     receita WAAPI piora (commit por quadro, 1–3 frames dropados a CPU 4×).
// Logo a escolha é POR MOTOR: compositor no Gecko, estilo nos demais. Único
// ponto de detecção de motor do app; a pref do modo debug permite A/B no
// aparelho (mapa-debug). Sem `Element.animate` (jsdom) cai sempre no estilo.
import type { MapView } from './useMapView'

export interface OpcoesAplicar {
  /** Escreve `--map-escala` (contra-escala de rótulos/pinos, MapaLocal). A
   *  var custa um restyle dos descendentes por quadro — só quem precisa. */
  contraEscala: boolean
}

export interface TransformDriver {
  readonly nome: 'estilo' | 'compositor'
  /** Um quadro do gesto (chamado no rAF do hook). */
  aplicar(el: HTMLElement, v: MapView, o: OpcoesAplicar): void
  /** Fim do gesto: fixa o valor final no style e libera o que for do driver. */
  encerrar(el: HTMLElement, v: MapView, o: OpcoesAplicar): void
  /** Unmount / troca de elemento. */
  descartar(el: HTMLElement | null): void
}

export type DriverPref = 'auto' | 'estilo' | 'compositor'

export interface Ambiente {
  gecko: boolean
}

export function transformCss(v: MapView): string {
  return `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
}

/** Gecko = user-agent com "Gecko/<versão>" (Firefox desktop "Gecko/20100101",
 *  Android "Gecko/156.0"). Chromium e WebKit dizem "(KHTML, like Gecko)", sem
 *  a barra — não casam. */
export function detectarAmbiente(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): Ambiente {
  return { gecko: /\bGecko\/\d/.test(ua) }
}

function escreverVar(el: HTMLElement, v: MapView, o: OpcoesAplicar): void {
  if (o.contraEscala) el.style.setProperty('--map-escala', String(v.scale))
}

/** O que o hook fazia até o #572: transform inline + will-change no gesto. */
export const driverEstilo: TransformDriver = {
  nome: 'estilo',
  aplicar(el, v, o) {
    el.style.willChange = 'transform'
    el.style.transform = transformCss(v)
    escreverVar(el, v, o)
  },
  encerrar(el, v, o) {
    el.style.transform = transformCss(v)
    escreverVar(el, v, o)
    el.style.willChange = ''
  },
  descartar() {
    /* nada a liberar */
  },
}

const animacoes = new WeakMap<HTMLElement, Animation>()

/** Transform como animação de compositor: uma Animation por elemento, fill
 *  forwards de um quadro; cada quadro novo troca os keyframes e recomeça
 *  (exatamente o que foi medido). `encerrar` escreve o transform final no
 *  style ANTES de cancelar — sem flash do transform anterior ao gesto, e o
 *  motor pinta uma vez, nítido, na escala final. */
export const driverCompositor: TransformDriver = {
  nome: 'compositor',
  aplicar(el, v, o) {
    const keyframes = [{ transform: transformCss(v) }]
    const atual = animacoes.get(el)
    if (!atual) {
      animacoes.set(el, el.animate(keyframes, { duration: 16, fill: 'forwards', easing: 'linear' }))
    } else {
      ;(atual.effect as KeyframeEffect | null)?.setKeyframes(keyframes)
      atual.currentTime = 0
      atual.play()
    }
    escreverVar(el, v, o)
  },
  encerrar(el, v, o) {
    el.style.transform = transformCss(v)
    escreverVar(el, v, o)
    const atual = animacoes.get(el)
    if (atual) {
      animacoes.delete(el)
      atual.cancel()
    }
  },
  descartar(el) {
    if (!el) return
    const atual = animacoes.get(el)
    if (atual) {
      animacoes.delete(el)
      atual.cancel()
    }
  },
}

function podeAnimar(el: HTMLElement | null | undefined): boolean {
  return !!el && typeof (el as { animate?: unknown }).animate === 'function'
}

/** Driver pra este elemento: pref explícita vence; `auto` = compositor só no
 *  Gecko. Sem `animate` no elemento, sempre estilo. */
export function escolherDriver(
  pref: DriverPref,
  ambiente: Ambiente = detectarAmbiente(),
  el?: HTMLElement | null,
): TransformDriver {
  if (pref === 'estilo') return driverEstilo
  if (pref === 'compositor') return podeAnimar(el) ? driverCompositor : driverEstilo
  return ambiente.gecko && podeAnimar(el) ? driverCompositor : driverEstilo
}
