// Registro central dos tooltips da ficha de grupo — conteúdo VERBATIM do
// design puxado: design/pulled/grupo-tips.js define window.__GTIPS =
// { store: [{h,w}...], map: { 'bal:h1': ix, 'vida:r0c1': ix, ... } } e o
// buildGtip do design (Companion App.dc.html) lê window.__GTIPS em runtime.
// Aqui o script puxado é importado como side effect (única fonte de verdade,
// nada é copiado/inventado) e exposto tipado.
import '../../../design/pulled/grupo-tips.js'

export interface GtipEntry {
  /** HTML do tooltip (conteúdo do próprio design/usuário). */
  h: string
  /** Largura preferida em px (buildGtip usa min(w, viewport)). */
  w: number
}

export interface Gtips {
  store: GtipEntry[]
  map: Record<string, number>
}

declare global {
  interface Window {
    __GTIPS?: Gtips
  }
}

/** Espelha o acesso do design: `(typeof window!=='undefined')&&window.__GTIPS`. */
export function getGtips(): Gtips | null {
  return (typeof window !== 'undefined' && window.__GTIPS) || null
}

/** Entrada do store por chave — #384: pra reusar um texto GENÉRICO do design
 *  numa célula cuja chave por índice (`riq:r<gi>c1`) extrapola o snapshot
 *  (grupos com mais integrantes que o desenhado). */
export function storeEntry(key: string): GtipEntry | undefined {
  const gt = getGtips()
  const ix = gt?.map[key]
  return ix === undefined ? undefined : gt!.store[ix]
}
