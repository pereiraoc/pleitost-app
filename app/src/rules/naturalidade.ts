// Naturalidade — localidades do Atlas pro dropdown da Biografia. PORTA de:
//   - listLocalizacoes (plugin cola/yaml-block-deps-factory.ts:202-221):
//     scan de notas `categoria: Localização` dentro de Atlas/ (no app o
//     scan lê o índice do vault-data: type/subtype = categoria/subcategoria).
//   - buildTree/flattenTree/hasCityDescendant do naturalidade-picker
//     (plugin render/groups/naturalidade-picker.ts:92-219): árvore por
//     pasta, headers Região/Nação disabled, cidades selecionáveis
//     ordenadas Capital → Grande → Pequena, ramos sem cidade podados.
import type { Catalog } from '../data/catalog'
import { tokens } from '../components/ficha/registry'

/** Espelho de NaturalidadeOption (plugin naturalidade-picker.ts:57-61). */
export interface NaturalidadeOption {
  nome: string
  fullPath: string
  subcategoria: string
}

/** Ícones por subcategoria — espelho de SUBCATEGORIA_ICON
 *  (plugin naturalidade-picker.ts:32-38), registro central de emojis. */
const SUBCATEGORIA_ICON: Record<string, string> = {
  Capital: tokens.emojis.subcategoria.Capital,
  'Pequena Cidade': tokens.emojis.subcategoria.PequenaCidade,
  'Grande Cidade': tokens.emojis.subcategoria.GrandeCidade,
  Região: tokens.emojis.subcategoria.Regiao,
  Nação: tokens.emojis.subcategoria.Nacao,
}

/** Espelho de SELECTABLE (plugin naturalidade-picker.ts:42). */
const SELECTABLE = new Set<string>(['Capital', 'Pequena Cidade', 'Grande Cidade'])

/** Espelho de SUBCATEGORIA_ORDER (plugin naturalidade-picker.ts:48-52). */
const SUBCATEGORIA_ORDER: Record<string, number> = {
  Capital: 0,
  'Grande Cidade': 1,
  'Pequena Cidade': 2,
}

const ATLAS_PREFIX = 'Atlas/'
/** Espelho de OUTRO_VALUE (plugin naturalidade-picker.ts:55). */
export const NATURALIDADE_OUTRO = '__outro__'

/** Scan das localizações — espelho de listLocalizacoes (plugin
 *  yaml-block-deps-factory.ts:202-221): categoria Localização em Atlas/,
 *  TEMPLATE* fora, subcategoria obrigatória, sort por fullPath pt-BR. */
export function listLocalizacoes(catalog: Catalog): NaturalidadeOption[] {
  const out: NaturalidadeOption[] = []
  for (const entry of catalog.docsByType.get('Localização') ?? []) {
    if (!entry.path.startsWith(ATLAS_PREFIX)) continue
    const basename = entry.basename ?? entry.id.split('/').pop() ?? ''
    if (/^TEMPLATE/i.test(basename)) continue
    const sub = (entry.subtype ?? '').trim()
    if (!sub) continue
    out.push({ nome: basename, fullPath: entry.path, subcategoria: sub })
  }
  out.sort((a, b) => a.fullPath.localeCompare(b.fullPath, 'pt-BR'))
  return out
}

interface TreeNode {
  segment: string
  path: string
  indexNote?: NaturalidadeOption
  leaves: NaturalidadeOption[]
  children: Map<string, TreeNode>
}

/** Espelho de buildTree (plugin naturalidade-picker.ts:109-147). */
function buildTree(opts: NaturalidadeOption[]): TreeNode {
  const root: TreeNode = {
    segment: '',
    path: ATLAS_PREFIX.slice(0, -1),
    leaves: [],
    children: new Map(),
  }
  for (const o of opts) {
    if (!o.fullPath.startsWith(ATLAS_PREFIX)) continue
    const rel = o.fullPath.slice(ATLAS_PREFIX.length).replace(/\.md$/, '')
    const parts = rel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, path: `${node.path}/${seg}`, leaves: [], children: new Map() })
      }
      node = node.children.get(seg)!
    }
    const last = parts[parts.length - 1]!
    if (parts.length >= 2 && last === parts[parts.length - 2]) {
      node.indexNote = o
    } else if (parts.length === 1) {
      continue
    } else {
      node.leaves.push(o)
    }
  }
  return root
}

/** Espelho de hasCityDescendant (plugin naturalidade-picker.ts:152-160). */
function hasCityDescendant(node: TreeNode): boolean {
  for (const leaf of node.leaves) {
    if (SELECTABLE.has(leaf.subcategoria)) return true
  }
  for (const child of node.children.values()) {
    if (hasCityDescendant(child)) return true
  }
  return false
}

/** Linha plana do <select> — espelho de OptionLine (naturalidade-picker.ts:163-168). */
export interface NaturalidadeLine {
  value: string | null
  label: string
  disabled: boolean
}

/** Espelho de flattenTree (plugin naturalidade-picker.ts:170-219) —
 *  indentação com 2 NBSP por nível, headers disabled, leaves ordenadas
 *  por SUBCATEGORIA_ORDER + alfabético pt-BR. */
function flattenTree(node: TreeNode, depth: number): NaturalidadeLine[] {
  const out: NaturalidadeLine[] = []
  const indent = '  '.repeat(Math.max(0, depth))
  if (depth >= 0 && node.indexNote) {
    const icon = SUBCATEGORIA_ICON[node.indexNote.subcategoria] ?? ''
    out.push({ value: null, label: `${indent}${icon ? `${icon} ` : ''}${node.indexNote.nome}`, disabled: true })
  } else if (depth >= 0 && node.segment) {
    out.push({ value: null, label: `${indent}${node.segment}`, disabled: true })
  }
  const childKeys = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  for (const k of childKeys) {
    const child = node.children.get(k)!
    if (!hasCityDescendant(child)) continue
    out.push(...flattenTree(child, depth + 1))
  }
  const sortedLeaves = node.leaves.slice().sort((a, b) => {
    const oa = SUBCATEGORIA_ORDER[a.subcategoria] ?? 99
    const ob = SUBCATEGORIA_ORDER[b.subcategoria] ?? 99
    if (oa !== ob) return oa - ob
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
  const leafIndent = '  '.repeat(Math.max(0, depth + 1))
  for (const leaf of sortedLeaves) {
    if (!SELECTABLE.has(leaf.subcategoria)) continue
    const icon = SUBCATEGORIA_ICON[leaf.subcategoria] ?? ''
    out.push({
      value: `[[${leaf.nome}]]`,
      label: `${leafIndent}${icon ? `${icon} ` : ''}${leaf.nome}`,
      disabled: false,
    })
  }
  return out
}

/** Linhas completas do <select> de Naturalidade: vazio ("—") + "Outro
 *  (texto livre)" no topo + árvore — espelho do repopulate em apply()
 *  do naturalidadePicker (plugin naturalidade-picker.ts:252-271). */
export function naturalidadeSelectLines(options: NaturalidadeOption[]): NaturalidadeLine[] {
  const out: NaturalidadeLine[] = [
    { value: '', label: '—', disabled: false },
    { value: NATURALIDADE_OUTRO, label: `${tokens.emojis.ui.Outro} Outro (texto livre)`, disabled: false },
  ]
  out.push(...flattenTree(buildTree(options), -1))
  return out
}
