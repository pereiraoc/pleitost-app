// TERRENO DO MUNDO (viagem do hexcrawl, 2026-10-05) — o terreno de cada hex é
// DADO DO MUNDO, não do mestre: vive na nota apontada por `viagem.terreno` do
// Contexto-Def ("Terreno do Mundo Livre"), FM `Terreno`: chave do terreno →
// lista de "col,row" nas MESMAS coords da trilha (GroupHex col/row, atlas-grid
// flat-top odd-q). Hex fora das listas = `viagem.padrao`.
//
// Edição só no MODO DEV (pintor da Exploração): cada traço grava UM rascunho
// local do FM do doc (local-draft-store); Config › Modo Dev publica pro overlay
// compartilhado (todos recebem — jogadores, outros mestres, fora da sessão) e
// exporta o .md de volta pra vault (fonte única). A leitura passa pelo doc
// EFETIVO (useDoc → base ⊕ publicado ⊕ rascunho), então tudo isso aplica
// sozinho.
import { useMemo } from 'react'
import type { ViagemCfg } from '../data/context-def'
import { useCatalog } from '../data/CatalogContext'
import { useDoc } from '../data/useDoc'
import { localDraftFor, setLocalDraft } from '../data/local-draft-store'
import type { VaultDoc } from '../data/types'
import { atlasHexVertices } from '../map/atlas-grid'

export type TerrenoFm = Record<string, string[]>

const CHAVE_HEX = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/

const memo = new WeakMap<object, Map<string, string>>()

/** Índice "col,row" → chave do terreno a partir do FM `Terreno` (memoizado no
 *  próprio objeto do FM — o doc efetivo devolve o mesmo objeto enquanto nada
 *  muda). Entradas que não são "col,row" são ignoradas. */
export function indiceTerreno(raw: unknown): Map<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map()
  const hit = memo.get(raw)
  if (hit) return hit
  const out = new Map<string, string>()
  for (const [chave, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue
    for (const item of lista) {
      if (typeof item !== 'string') continue
      const m = CHAVE_HEX.exec(item)
      if (m) out.set(`${Number(m[1])},${Number(m[2])}`, chave)
    }
  }
  memo.set(raw, out)
  return out
}

function ordenar(a: string, b: string): number {
  const [ac, ar] = a.split(',').map(Number) as [number, number]
  const [bc, br] = b.split(',').map(Number) as [number, number]
  return ac - bc || ar - br
}

/** FM `Terreno` novo com os `cells` pintados de `chave` (null ou o terreno
 *  padrão = limpar). Toda chave não-padrão da config aparece (lista vazia se
 *  nada pintado); chaves desconhecidas do FM antigo são preservadas. Listas
 *  ordenadas (col, row) pro export ficar estável. Não muta o original. */
export function pintarTerreno(
  raw: unknown,
  cells: readonly { col: number; row: number }[],
  chave: string | null,
  cfg: ViagemCfg,
): TerrenoFm {
  const alvo = chave && chave !== cfg.padrao ? chave : null
  const tirar = new Set(cells.map((c) => `${c.col},${c.row}`))
  const atual = indiceTerreno(raw)
  const listas = new Map<string, string[]>()
  for (const t of cfg.terrenos) if (t.chave !== cfg.padrao) listas.set(t.chave, [])
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of Object.keys(raw)) if (!listas.has(k)) listas.set(k, [])
  }
  for (const [hex, k] of atual) {
    if (tirar.has(hex)) continue
    if (!listas.has(k)) listas.set(k, [])
    listas.get(k)!.push(hex)
  }
  if (alvo) {
    if (!listas.has(alvo)) listas.set(alvo, [])
    listas.get(alvo)!.push(...tirar)
  }
  const out: TerrenoFm = {}
  for (const [k, l] of listas) out[k] = [...new Set(l)].sort(ordenar)
  return out
}

/** Grava UM rascunho local (Modo Dev) com o traço pintado. Parte do rascunho
 *  atual (o mais novo) ou do FM efetivo do doc. */
export function gravarTracoTerreno(
  doc: VaultDoc,
  cells: readonly { col: number; row: number }[],
  chave: string | null,
  cfg: ViagemCfg,
): void {
  if (cells.length === 0) return
  const fm = (localDraftFor(doc.id)?.frontmatter ?? doc.frontmatter ?? {}) as Record<string, unknown>
  setLocalDraft(doc.id, { frontmatter: { ...fm, Terreno: pintarTerreno(fm.Terreno, cells, chave, cfg) } })
}

/** `d` de um path com TODOS os hexes dados (um subpath por hex) — um elemento
 *  por terreno em vez de um polígono por célula (#573: DOM enxuto no gesto). */
export function hexesPath(cells: Iterable<{ col: number; row: number }>): string {
  let d = ''
  for (const c of cells) {
    const v = atlasHexVertices(c.col, c.row)
    d += `M${v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`
  }
  return d
}

export interface TerrenoMundo {
  /** Doc efetivo da nota de terreno (undefined: sem config/carregando). */
  doc: VaultDoc | undefined
  indice: Map<string, string>
  terrenoDe: (col: number, row: number) => string | undefined
}

const VAZIO = new Map<string, string>()

/** Terreno do mundo pela nota `viagem.terreno` (doc efetivo, overlay-aware). */
export function useTerrenoMundo(cfg: ViagemCfg | null): TerrenoMundo {
  const catalog = useCatalog()
  const docId = useMemo(() => {
    if (!cfg?.terreno) return ''
    const r = catalog.resolve(cfg.terreno)
    return r.kind === 'doc' ? r.id : ''
  }, [catalog, cfg])
  const { doc } = useDoc(docId)
  const raw = doc?.frontmatter?.Terreno
  const indice = raw ? indiceTerreno(raw) : VAZIO
  const terrenoDe = useMemo(() => (col: number, row: number) => indice.get(`${col},${row}`), [indice])
  return { doc, indice, terrenoDe }
}
