// #303: ícone de "supercharged link" de um wikilink — o MESMO emoji que o
// Obsidian mostra antes do link, derivado do DOC-ALVO. NÃO inventa emoji: usa os
// SELETORES extraídos da config do Obsidian (supercharged-icons.ts, gerado) com
// a MESMA semântica do CSS que o plugin gera: percorre os seletores na ordem,
// atributo casa por valor exato sem caixa (`i`), path por sufixo/trecho/prefixo,
// e o ÚLTIMO que casa vence (cascata). Report 2026-09-07: o app comparava com
// caixa exata e só por tipo/subtipo/grupo — Vigor/Ímpeto ("Defesas-e-Resistências"),
// Percepção/Intuição (seletor por PATH), Ações (custo), Magias (escola/elemento)
// e Sintonias ficavam sem ícone.
import type { IndexDocEntry } from '../data/types'
import { reskinName } from '../data/reskin'
import { SC_SELECTORS, type ScSelector } from './supercharged-icons'

export type IconEntry = Pick<IndexDocEntry, 'type' | 'subtype' | 'grupo'> &
  Partial<Pick<IndexDocEntry, 'path' | 'custo' | 'escola' | 'elemento' | 'sintonia'>>

/** NFC + trim (+ minúsculas quando o seletor é case-insensitive). */
function norm(s: string, caseSensitive: boolean): string {
  const n = s.normalize('NFC').trim()
  return caseSensitive ? n : n.toLowerCase()
}

/** Valor da faceta `nome` do doc-alvo (o atributo que o supercharged lê do
 *  FM/inline field: categoria/subcategoria/grupo/custo/escola/elemento/sintonia). */
function faceta(entry: IconEntry, nome: string): string | null {
  switch (nome) {
    case 'categoria':
      return entry.type ?? null
    case 'subcategoria':
      return entry.subtype ?? null
    case 'grupo':
      // grupo de arma vem como string ("cac-marcial"); grupo-membership (lista de
      // wikilinks) não casa nenhum seletor e cai fora.
      return typeof entry.grupo === 'string' ? entry.grupo : null
    case 'custo':
      return entry.custo ?? null
    case 'escola':
      return entry.escola ?? null
    case 'elemento':
      return entry.elemento ?? null
    case 'sintonia':
      return entry.sintonia ?? null
    default:
      return null
  }
}

function casa(sel: ScSelector, entry: IconEntry): boolean {
  if (sel.tipo === 'path') {
    const p = entry.path
    if (!p) return false
    const a = norm(p, sel.caseSensitive)
    const b = norm(sel.valor, sel.caseSensitive)
    if (sel.match === 'endswith') return a.endsWith(b)
    if (sel.match === 'startswith') return a.startsWith(b)
    if (sel.match === 'contains') return a.includes(b)
    return a === b
  }
  const v = faceta(entry, sel.nome)
  if (v == null || v === '') return false
  const a = norm(v, sel.caseSensitive)
  const b = norm(sel.valor, sel.caseSensitive)
  if (sel.match === 'endswith') return a.endsWith(b)
  if (sel.match === 'startswith') return a.startsWith(b)
  if (sel.match === 'contains') return a.includes(b)
  return a === b
}

/** Emoji do link a partir das facetas do doc-alvo (síncrono) — aceita a
 *  entrada de índice OU o VaultDoc inteiro (mesmas facetas). '' = sem ícone,
 *  como no Obsidian quando nenhum seletor casa. */
export function linkIconForEntry(entry: IconEntry | undefined): string {
  if (!entry) return ''
  // Mundo com Empregado (POA): patinhas não — o CA vira gente/drone.
  const alvo: IconEntry =
    entry.subtype?.normalize('NFC').trim() === 'Companheiro Animal' &&
    reskinName('Companheiro Animal') !== 'Companheiro Animal'
      ? { ...entry, subtype: 'Heroi', grupo: null }
      : entry
  let icone = ''
  for (const sel of SC_SELECTORS) if (casa(sel, alvo)) icone = sel.icone
  return icone
}
