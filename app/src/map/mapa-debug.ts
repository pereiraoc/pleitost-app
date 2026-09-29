// TOGGLES DE A/B DO MAPA NO MODO DEBUG (#573) — driver do transform, overlay
// assado e grade em canvas. É como o usuário compara no aparelho, sem deploy
// novo: liga o modo debug, troca aqui, repete o gesto e manda o report com o
// log `mapa/gesto` (que carrega os três valores). Persistido em localStorage;
// leitura tolerante (chave ausente/corrompida → padrões).
import { useSyncExternalStore } from 'react'
import { detectarAmbiente, type Ambiente, type DriverPref } from './transform-driver'

const CHAVE = 'pleitost.debug.mapa'
const EVENTO = 'pleitost:mapa-debug'

export type GradePref = 'auto' | 'canvas' | 'svg'

export interface MapaDebug {
  driver: DriverPref
  assar: boolean
  grade: GradePref
}

export const MAPA_DEBUG_PADRAO: MapaDebug = { driver: 'auto', assar: true, grade: 'auto' }

const DRIVERS = new Set<string>(['auto', 'estilo', 'compositor'])
const GRADES = new Set<string>(['auto', 'canvas', 'svg'])

/** Onde a grade é desenhada, por motor: no Gecko o path no SVG transformado
 *  é o blob mais caro a re-rasterizar por quadro → canvas de tela; no
 *  Chromium o SVG dentro da camada composta não custa nada por quadro e o
 *  canvas redesenhado a cada quadro custa (DoUpdateLayers, medido 2026-09-29)
 *  → SVG. `auto` escolhe isso; canvas/svg forçam (A/B no aparelho). */
export function escolherGrade(pref: GradePref, ambiente: Ambiente = detectarAmbiente()): 'canvas' | 'svg' {
  if (pref === 'canvas' || pref === 'svg') return pref
  return ambiente.gecko ? 'canvas' : 'svg'
}

function sanitizar(raw: unknown): MapaDebug {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    driver: typeof o.driver === 'string' && DRIVERS.has(o.driver) ? (o.driver as DriverPref) : MAPA_DEBUG_PADRAO.driver,
    assar: typeof o.assar === 'boolean' ? o.assar : MAPA_DEBUG_PADRAO.assar,
    grade: typeof o.grade === 'string' && GRADES.has(o.grade) ? (o.grade as GradePref) : MAPA_DEBUG_PADRAO.grade,
  }
}

let estado: MapaDebug | null = null

/** `window.localStorage`, não o global nu: no Node 22+ `globalThis.localStorage`
 *  existe como undefined (sem a flag de webstorage) e o jsdom não o cobre. */
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function lerMapaDebug(): MapaDebug {
  if (estado) return estado
  try {
    const raw = storage()?.getItem(CHAVE) ?? null
    estado = raw ? sanitizar(JSON.parse(raw)) : { ...MAPA_DEBUG_PADRAO }
  } catch {
    estado = { ...MAPA_DEBUG_PADRAO }
  }
  return estado
}

export function gravarMapaDebug(patch: Partial<MapaDebug>): void {
  estado = sanitizar({ ...lerMapaDebug(), ...patch })
  try {
    storage()?.setItem(CHAVE, JSON.stringify(estado))
  } catch {
    /* sem storage — segue só em memória */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO))
  } catch {
    /* fora do browser */
  }
}

function assinar(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb)
  return () => window.removeEventListener(EVENTO, cb)
}

export function useMapaDebug(): MapaDebug {
  return useSyncExternalStore(assinar, lerMapaDebug, lerMapaDebug)
}

export function __resetMapaDebugForTests(): void {
  estado = null
}
