// Mecânica de DESCANSO — porta fiel de renderDescansoCol do plugin
// pleitost-autosheet (render/modes/interativa/tabs/tab-recursos/sections/
// acoes-descanso.ts:155-315) sobre o modelo salvo do app (issue #227):
//   DESCANSAR (plugin :232-262) — Moral→max, EM (+Secundária)→max, usos por
//     minuto restauram (`/min`,`/10min`→max; `cargas+1/10min`→+1) e Encorajar
//     deixa de ser imune (#182). Vitalidade NÃO restaura (a imunidade de
//     Medicina reflete ferimentos "frescos" — também não reseta); Moral
//     Temporária preserva.
//   DORMIR (plugin :274-304) — Vitalidade soma 6/9/12 EV (níveis 1/4/7, cap
//     no max — regra da nota Recuperação, #206 do plugin), Moral→max,
//     MoralTemp→0, EM (+Secundária)→max, imunidades zeram, usos→max e
//     Cargas (Focos) DESCARREGAM (→0).
// As funções são puras: devolvem a lista de writes `[path, value]` pro
// caller aplicar via model.setVolatile (canal volátil da Interativa).
import type { VaultDoc } from '../../data/types'
import {
  cargasPorTier,
  fmPath,
  num,
  parseItemAlias,
  str,
  tierLetter,
  usosFreqPorTier,
  usosPorTier,
} from './hero-model'
import { linkLabel } from '../../markdown/dataview-value'

export interface DescansoUsoItem {
  /** Key em Interativa.Usos_Recursos — MESMO formato dos consumers
   *  (AtaquesPanel `arma:<nome>|prop:<prop>`; TesourosPanel
   *  `tes:<nome>|tier:<T>`). */
  key: string
  max: number
  /** Freq textual do doc ("1/10min", "1/dia"; cargas → "Carga(s)" como o
   *  plugin, usos.ts:116) — decide a restauração no Descansar. */
  freq: string
  /** Focos/Implementos com cargas_<tier> — init 0, Dormir descarrega. */
  isCarga?: boolean
}

/** Itens com uso controlado que o APP rastreia em Usos_Recursos — espelho de
 *  buildUsoItems do plugin (usos.ts:57-149) no recorte do app: imbuições de
 *  arma equipada + tesouros (habilidades/técnicas com usos ainda não têm UI
 *  aqui). Passivo/sem tier ficam fora, como nos consumers. */
export function buildDescansoUsoItems(
  fm: Record<string, unknown>,
  refDoc: (value: unknown) => VaultDoc | undefined,
): DescansoUsoItem[] {
  const out: DescansoUsoItem[] = []
  // 1. Imbuições equipadas em armas (keys do AtaquesPanel).
  const armas = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  for (const arma of armas) {
    const prop = linkLabel(str(arma['Propriedade']))
    if (!prop) continue
    const tier = tierLetter(arma['Categoria'])
    if (!tier) continue
    const propDoc = refDoc(arma['Propriedade'])
    const freq = usosFreqPorTier(propDoc, tier)
    const max = usosPorTier(propDoc, tier)
    if (!freq || !max) continue
    out.push({ key: `arma:${linkLabel(str(arma['Nome']))}|prop:${prop}`, max, freq })
  }
  // 2. Tesouros com uso controlado (keys do TesourosPanel). Cargas têm
  //    precedência sobre usos, como no plugin (usos.ts:112-118).
  const tesouros = (fmPath(fm, 'Inventario', 'Tesouros') ?? []) as unknown[]
  for (const raw of tesouros) {
    const { nome, tier } = parseItemAlias(raw)
    if (!tier) continue
    const tDoc = refDoc(raw)
    const key = `tes:${nome}|tier:${tier}`
    const cargas = cargasPorTier(tDoc, tier)
    if (cargas) {
      out.push({ key, max: cargas, freq: cargas === 1 ? 'Carga' : 'Cargas', isCarga: true })
      continue
    }
    const freq = usosFreqPorTier(tDoc, tier)
    const max = usosPorTier(tDoc, tier)
    if (!freq || !max) continue
    out.push({ key, max, freq })
  }
  return out
}

export interface DescansoState {
  /** Vitalidade CORRENTE (Dormir soma EV por cima, cap no max). */
  vit: number
  vitMax: number
  moralMax: number
  emMax: number
  emSecMax: number
  nivel: number
  /** Snapshot de Interativa.Usos_Recursos — keys fora dos usoItems (Slot.X…)
   *  são preservadas intactas, como no plugin (só ids dos items mudam). */
  usos: Record<string, unknown>
  usoItems: readonly DescansoUsoItem[]
}

export type DescansoWrite = [path: string, value: unknown]

/** Corrente salvo de um uso; ausente → default do app (usos cheios, cargas
 *  descarregadas — TesourosPanel/AtaquesPanel). */
function usoCur(s: DescansoState, it: DescansoUsoItem): number {
  return s.usos[it.key] !== undefined ? num(s.usos[it.key]) : it.isCarga ? 0 : it.max
}

/** DESCANSAR — writes do plugin acoes-descanso.ts:240-262. */
export function descansarWrites(s: DescansoState): DescansoWrite[] {
  const usos: Record<string, unknown> = { ...s.usos }
  // aplicarDescansoNosUsos (plugin :190-199): `1/min`/`1/10min` → max;
  // `cargas+1/10min` → +1 (cap max); demais freqs não restauram.
  for (const it of s.usoItems) {
    const norm = it.freq.toLowerCase().replace(/\s+/g, '')
    if (/cargas\+1\/10min/.test(norm)) usos[it.key] = Math.min(it.max, usoCur(s, it) + 1)
    else if (/\/min$|\/10min$/.test(norm)) usos[it.key] = it.max
  }
  return [
    ['Interativa.Recursos_Restantes.Moral', s.moralMax],
    ['Interativa.Recursos_Restantes.EM', s.emMax],
    // EM Secundária restaura junto com a Primária — regra de jogo: descanso
    // restaura todas as fontes mágicas independentes (plugin :244-246).
    ['Interativa.Recursos_Restantes.EM_Secundaria', s.emSecMax],
    ['Interativa.Usos_Recursos', usos],
    // #182 do plugin: libera Encorajar pro próximo encontro; Medicina NÃO
    // reseta (Vitalidade não restaurou — ainda há ferimentos pra tratar).
    ['Interativa.Imunidades.Encorajar', false],
  ]
}

/** DORMIR — writes do plugin acoes-descanso.ts:274-304. */
export function dormirWrites(s: DescansoState): DescansoWrite[] {
  // Regra "6/9/12 EV por noite (níveis 1/4/7)" da nota Recuperação (#206).
  const ganhoEv = s.nivel >= 7 ? 12 : s.nivel >= 4 ? 9 : 6
  const usos: Record<string, unknown> = { ...s.usos }
  // Usos enchem até o max; Cargas (Focos) DESCARREGAM (→0) ao dormir.
  for (const it of s.usoItems) usos[it.key] = it.isCarga ? 0 : it.max
  return [
    ['Interativa.Recursos_Restantes.Vitalidade', Math.min(s.vitMax, s.vit + ganhoEv)],
    ['Interativa.Recursos_Restantes.Moral', s.moralMax],
    ['Interativa.Recursos_Restantes.Moral_Temporaria', 0],
    ['Interativa.Recursos_Restantes.EM', s.emMax],
    ['Interativa.Recursos_Restantes.EM_Secundaria', s.emSecMax],
    ['Interativa.Usos_Recursos', usos],
    ['Interativa.Imunidades.Medicina', false],
    ['Interativa.Imunidades.Encorajar', false],
  ]
}
