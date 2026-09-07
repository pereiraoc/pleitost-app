// Parser PURO de uma nota de Recurso (VaultDoc → Recurso). Sem React, sem
// catálogo: só o frontmatter. Campos ausentes/inválidos → undefined; sem
// Preço inteiro, Tipo ou aba a nota não é um recurso utilizável (null).
import type { VaultDoc } from '../data/types'
import type { Recurso } from './types'

export const RECURSO_TYPE = 'Recurso'

export function isRecursoDoc(doc: Pick<VaultDoc, 'type'>): boolean {
  return doc.type === RECURSO_TYPE
}

function texto(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return ''
}

/** Inteiro ≥ 0 (o mundo não tem fração — 2026-09-07). */
export function inteiro(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** `[[Alvo|alias]]` → `Alvo`; texto cru fica como está. */
export function linkTarget(s: string): string {
  const m = /\[\[([^\]|#]+)/.exec(s)
  return (m ? m[1]! : s).trim()
}

function lista(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []
  return arr.map((x) => linkTarget(texto(x))).filter(Boolean)
}

export function parseRecurso(doc: VaultDoc): Recurso | null {
  if (!isRecursoDoc(doc)) return null
  const fm = (doc.frontmatter ?? {}) as Record<string, unknown>
  const preco = inteiro(fm['Preço'])
  const tipo = texto(fm['Tipo'])
  const aba = texto(fm['subcategoria']) || doc.subtype || ''
  if (preco === undefined || !tipo || !aba) return null
  return {
    id: doc.id,
    nome: doc.basename,
    aba,
    tipo,
    marca: texto(fm['Marca']),
    preco,
    cobranca: texto(fm['Cobrança']) || 'unidade',
    usado: inteiro(fm['Usado']),
    compra: inteiro(fm['Compra']),
    manutencao: inteiro(fm['Manutenção']),
    nivel: inteiro(fm['Nível']),
    porKm: inteiro(fm['Por_km']),
    longa: inteiro(fm['Longa']),
    volume: inteiro(fm['Volume']),
    onde: lista(fm['Onde']),
    resumo: texto(fm['Resumo']),
  }
}
