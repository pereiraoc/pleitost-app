// Aba EXPLORAÇÃO (issue #36) — dropdown de Localizações do Atlas pro ponto
// da trilha. REUSA o scan exportado das regras (listLocalizacoes em
// src/rules/naturalidade.ts, porta de listLocalizacoes do plugin) e espelha
// a APRESENTAÇÃO em árvore do naturalidade-picker (indentação de 2 NBSP por
// nível, ícone do registro por subcategoria, filhos por pasta em pt-BR,
// folhas Capital → Grande → Pequena → resto alfabético). Diferença de
// contrato, própria desta tela: TODO doc de Localização é selecionável
// (o grupo pode estar numa Região/Nação/Ponto de Interesse, não só numa
// cidade) e o value é o ID do doc no catálogo — o ponto guarda localId.
import type { Catalog } from '../data/catalog'
import { listLocalizacoes, type NaturalidadeOption } from '../rules/naturalidade'
import { tokens } from '../components/ficha/registry'

/** Ícones por subcategoria — mesmo espelho de SUBCATEGORIA_ICON do plugin
 *  (registro central de emojis); subcategoria fora do registro (ex.: Ponto
 *  de Interesse) fica sem ícone — nunca inventar fallback. */
const SUBCATEGORIA_ICON: Record<string, string> = {
  Capital: tokens.emojis.subcategoria.Capital,
  'Pequena Cidade': tokens.emojis.subcategoria.PequenaCidade,
  'Grande Cidade': tokens.emojis.subcategoria.GrandeCidade,
  Região: tokens.emojis.subcategoria.Regiao,
  Nação: tokens.emojis.subcategoria.Nacao,
}

/** Espelho de SUBCATEGORIA_ORDER do naturalidade-picker. */
const SUBCATEGORIA_ORDER: Record<string, number> = {
  Capital: 0,
  'Grande Cidade': 1,
  'Pequena Cidade': 2,
}

const ATLAS_PREFIX = 'Atlas/'

/** Linha plana do <select> de local (value = id do doc no catálogo). */
export interface LocalLine {
  value: string | null
  label: string
  disabled: boolean
}

interface TreeNode {
  segment: string
  indexNote?: NaturalidadeOption
  leaves: NaturalidadeOption[]
  children: Map<string, TreeNode>
}

/** fullPath do scan (Atlas/....md) → id do doc no catálogo. */
function docId(o: NaturalidadeOption): string {
  return o.fullPath.replace(/\.md$/, '')
}

function label(o: NaturalidadeOption, depth: number): string {
  const indent = '  '.repeat(Math.max(0, depth))
  const icon = SUBCATEGORIA_ICON[o.subcategoria] ?? ''
  return `${indent}${icon ? `${icon} ` : ''}${o.nome}`
}

/** Árvore por pasta — mesmo agrupamento do buildTree do naturalidade-picker
 *  (nota-índice = nota homônima da pasta). */
function buildTree(opts: NaturalidadeOption[]): TreeNode {
  const root: TreeNode = { segment: '', leaves: [], children: new Map() }
  for (const o of opts) {
    if (!o.fullPath.startsWith(ATLAS_PREFIX)) continue
    const rel = o.fullPath.slice(ATLAS_PREFIX.length).replace(/\.md$/, '')
    const parts = rel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, leaves: [], children: new Map() })
      }
      node = node.children.get(seg)!
    }
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && last === parts[parts.length - 2]) node.indexNote = o
    else if (parts.length === 1) continue
    else node.leaves.push(o)
  }
  return root
}

function flatten(node: TreeNode, depth: number): LocalLine[] {
  const out: LocalLine[] = []
  if (depth >= 0 && node.indexNote) {
    // Nota-índice (Região/Nação) é SELECIONÁVEL aqui — vira o value da pasta.
    out.push({ value: docId(node.indexNote), label: label(node.indexNote, depth), disabled: false })
  } else if (depth >= 0 && node.segment) {
    const indent = '  '.repeat(Math.max(0, depth))
    out.push({ value: null, label: `${indent}${node.segment}`, disabled: true })
  }
  const childKeys = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  for (const k of childKeys) out.push(...flatten(node.children.get(k)!, depth + 1))
  const sortedLeaves = node.leaves.slice().sort((a, b) => {
    const oa = SUBCATEGORIA_ORDER[a.subcategoria] ?? 99
    const ob = SUBCATEGORIA_ORDER[b.subcategoria] ?? 99
    if (oa !== ob) return oa - ob
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
  for (const leaf of sortedLeaves) {
    out.push({ value: docId(leaf), label: label(leaf, depth + 1), disabled: false })
  }
  return out
}

/** Linhas do <select> LOCAL: vazio ("—", sem associação) + árvore do Atlas
 *  com todos os docs de Localização selecionáveis. */
export function locaisSelectLines(catalog: Catalog): LocalLine[] {
  return [{ value: '', label: '—', disabled: false }, ...flatten(buildTree(listLocalizacoes(catalog)), -1)]
}
