// FRONTMATTER ⇢ BountyData (#248) — aventuras CRIADAS no app (Modo Mestre) não
// têm corpo ```bounty```; os campos vivem no FM. Este módulo é o contrato do FM
// de uma aventura local e o converte pro MESMO shape BountyData que a BountyCard
// consome (o que parseBountyBlock produziria a partir do bloco). Assim a carta
// é idêntica pra aventura da vault e pra local — uma única fonte de render.
//
// Shape do FM (espelha os campos do bloco bounty):
//   Titulo: string
//   Recompensa: { Marcas?, Ouro?, Reconhecimento?, Promoção?, Extra? }
//     — cada quantia é número, {min,max} ou string
//   Objetivo: string[]        (aceita [[wikilinks]])
//   Local?: string | string[]
//   Contato?: string
//   Financiador?: string
import type { BountyData, BountyRange, BountyValue } from './parse-bounty'

function asValue(v: unknown): BountyValue | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'object' && 'min' in v && 'max' in v) {
    const r = v as { min: unknown; max: unknown }
    if (typeof r.min === 'number' && typeof r.max === 'number') {
      return { min: r.min, max: r.max } as BountyRange
    }
  }
  return null
}

function asList(v: unknown): BountyValue[] {
  if (v == null) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(asValue).filter((x): x is BountyValue => x !== null)
}

export function bountyDataFromFm(fm: Record<string, unknown>): BountyData {
  const data: BountyData = {}
  const titulo = asValue(fm.Titulo)
  if (titulo != null) data.Titulo = titulo

  const recSrc =
    fm.Recompensa && typeof fm.Recompensa === 'object' && !Array.isArray(fm.Recompensa)
      ? (fm.Recompensa as Record<string, unknown>)
      : {}
  const rec: Record<string, BountyValue> = {}
  for (const key of ['Marcas', 'Ouro', 'Reconhecimento', 'Promoção', 'Extra']) {
    const val = asValue(recSrc[key])
    if (val != null) rec[key] = val
  }
  if (Object.keys(rec).length) data.Recompensa = rec

  const objetivos = asList(fm.Objetivo)
  if (objetivos.length) data.Objetivo = objetivos

  const local = asList(fm.Local)
  if (local.length) data.Local = local
  const contato = asValue(fm.Contato)
  if (contato != null) data.Contato = contato
  const financiador = asValue(fm.Financiador)
  if (financiador != null) data.Financiador = financiador

  return data
}
