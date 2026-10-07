// TERRENO DO MUNDO (viagem do hexcrawl, 2026-10-05) — o terreno de cada hex é
// DADO DO MUNDO, não do mestre: vive na nota apontada por `viagem.terreno` do
// Contexto-Def ("Terreno do Mundo Livre"), em DUAS CAMADAS (2026-10-06):
// FM `Terreno` (BASE: chave do terreno → lista de "col,row"; hex fora das
// listas = `viagem.padrao`) e FM `Rotas` (por CIMA: estrada, rota marítima →
// lista de "col,row"; um hex tem no máximo uma rota). Coords = as MESMAS da
// trilha (GroupHex col/row, atlas-grid flat-top odd-q).
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
import { ATLAS_HEX_SIZE, atlasHexCenter, atlasHexVertices } from '../map/atlas-grid'

export type TerrenoFm = Record<string, string[]>

const CHAVE_HEX = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/

const memo = new WeakMap<object, Map<string, string>>()

/** Índice "col,row" → chave a partir de um FM de camada (`Terreno` ou `Rotas`; memoizado no
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

/** Lista pintada de uma camada: os `cells` vão pra `alvo` (null = limpar),
 *  saindo de qualquer outra lista. Toda chave `declaradas` aparece (lista
 *  vazia se nada pintado); chaves desconhecidas do FM antigo são preservadas.
 *  Listas ordenadas (col, row) pro export ficar estável. Não muta o original. */
function pintarCamada(
  raw: unknown,
  cells: readonly { col: number; row: number }[],
  alvo: string | null,
  declaradas: readonly string[],
): TerrenoFm {
  const tirar = new Set(cells.map((c) => `${c.col},${c.row}`))
  const atual = indiceTerreno(raw)
  const listas = new Map<string, string[]>()
  for (const k of declaradas) listas.set(k, [])
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

/** FM `Terreno` (camada BASE) novo com os `cells` pintados de `chave` (null
 *  ou o terreno padrão = limpar). Toda chave não-padrão da config aparece. */
export function pintarTerreno(
  raw: unknown,
  cells: readonly { col: number; row: number }[],
  chave: string | null,
  cfg: ViagemCfg,
): TerrenoFm {
  const alvo = chave && chave !== cfg.padrao ? chave : null
  const declaradas = cfg.terrenos.filter((t) => t.chave !== cfg.padrao).map((t) => t.chave)
  return pintarCamada(raw, cells, alvo, declaradas)
}

/** FM `Rotas` (camada de ROTAS) novo com os `cells` na rota `chave` (null =
 *  limpar rota; o terreno-base não muda). Toda rota da config aparece. */
export function pintarRota(
  raw: unknown,
  cells: readonly { col: number; row: number }[],
  chave: string | null,
  cfg: ViagemCfg,
): TerrenoFm {
  return pintarCamada(raw, cells, chave, (cfg.rotas ?? []).map((r) => r.chave))
}

export type CamadaTerreno = 'terreno' | 'rotas'

/** Grava UM rascunho local (Modo Dev) com o traço pintado na camada dada
 *  (`terreno` → FM `Terreno`; `rotas` → FM `Rotas`; a outra fica como está).
 *  Parte do rascunho atual (o mais novo) ou do FM efetivo do doc. */
export function gravarTracoTerreno(
  doc: VaultDoc,
  cells: readonly { col: number; row: number }[],
  chave: string | null,
  cfg: ViagemCfg,
  camada: CamadaTerreno = 'terreno',
): void {
  if (cells.length === 0) return
  const fm = (localDraftFor(doc.id)?.frontmatter ?? doc.frontmatter ?? {}) as Record<string, unknown>
  const novo =
    camada === 'rotas'
      ? { Rotas: pintarRota(fm.Rotas, cells, chave, cfg) }
      : { Terreno: pintarTerreno(fm.Terreno, cells, chave, cfg) }
  setLocalDraft(doc.id, { frontmatter: { ...fm, ...novo } })
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

/** `d` de um path com um PONTO (círculo) no centro de cada hex dado — a
 *  tinta da camada de ROTAS, distinta da tinta do terreno-base (hex cheio). */
export function pontosPath(cells: Iterable<{ col: number; row: number }>, raio = ATLAS_HEX_SIZE * 0.28): string {
  let d = ''
  const r = raio.toFixed(1)
  const dr = (raio * 2).toFixed(1)
  for (const c of cells) {
    const p = atlasHexCenter(c.col, c.row)
    d += `M${(p.x - raio).toFixed(1)},${p.y.toFixed(1)}a${r},${r} 0 1,0 ${dr},0a${r},${r} 0 1,0 -${dr},0Z`
  }
  return d
}

export interface TerrenoMundo {
  /** Doc efetivo da nota de terreno (undefined: sem config/carregando). */
  doc: VaultDoc | undefined
  /** Camada BASE: "col,row" → chave do terreno. */
  indice: Map<string, string>
  /** Camada de ROTAS: "col,row" → chave da rota. */
  indiceRotas: Map<string, string>
  terrenoDe: (col: number, row: number) => string | undefined
  rotaDe: (col: number, row: number) => string | undefined
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
  const rawRotas = doc?.frontmatter?.Rotas
  const indice = raw ? indiceTerreno(raw) : VAZIO
  const indiceRotas = rawRotas ? indiceTerreno(rawRotas) : VAZIO
  const terrenoDe = useMemo(() => (col: number, row: number) => indice.get(`${col},${row}`), [indice])
  const rotaDe = useMemo(() => (col: number, row: number) => indiceRotas.get(`${col},${row}`), [indiceRotas])
  return { doc, indice, indiceRotas, terrenoDe, rotaDe }
}

// ── MODIFICADORES DO MAPA (toggle da Exploração, 2026-10-06) ────────────────
// Marcas pequenas por hex, LIDAS DA CONFIG (nunca da chave): terreno de água
// = onda; terreno com custo > 1 = triângulos (custo − 1, até 3: difícil ▲,
// montanha ▲▲); rota cujos meios só andam na água = anel; as demais rotas,
// na ordem da config: losango, degrau, barra. Terreno no alto do hex, rota
// embaixo (um hex pode ter os dois). UM path por classe, geometria
// concatenada (#573: DOM constante no gesto do Gecko), memoizada nos índices.

export type FormaMarca = 'onda' | 'tri1' | 'tri2' | 'tri3' | 'anel' | 'losango' | 'degrau' | 'barra'

export interface MarcaMapa {
  /** `terreno:<chave>` | `rota:<chave>` — uma por classe. */
  classe: string
  camada: CamadaTerreno
  chave: string
  /** Rótulo da config (legenda). */
  nome: string
  cor: string
  forma: FormaMarca
  /** `d` com a marca de TODOS os hexes da classe (px da fonte do atlas). */
  d: string
}

/** Marca é desenhada com traço (linha) em vez de preenchimento. */
export function marcaDeLinha(forma: FormaMarca): boolean {
  return forma === 'onda' || forma === 'degrau'
}

const f1 = (n: number) => n.toFixed(1)

/** `d` de UMA marca centrada no hex (cx,cy) — px da fonte (hex de raio 55). */
export function marcaPath(forma: FormaMarca, cx: number, cy: number): string {
  const tri = (x: number) => `M${f1(x - 7)},${f1(cy - 5)}L${f1(x)},${f1(cy - 17)}L${f1(x + 7)},${f1(cy - 5)}Z`
  const yr = cy + 13
  switch (forma) {
    case 'tri1':
      return tri(cx)
    case 'tri2':
      return tri(cx - 8) + tri(cx + 8)
    case 'tri3':
      return tri(cx - 15) + tri(cx) + tri(cx + 15)
    case 'onda': {
      const onda = (y: number) => `M${f1(cx - 12)},${f1(y)}q3,-4 6,0t6,0t6,0t6,0`
      return onda(cy - 15) + onda(cy - 8)
    }
    case 'anel':
      return `M${f1(cx - 5)},${f1(yr)}a5,5 0 1,0 10,0a5,5 0 1,0 -10,0Z`
    case 'losango':
      return `M${f1(cx)},${f1(yr - 6)}L${f1(cx + 6)},${f1(yr)}L${f1(cx)},${f1(yr + 6)}L${f1(cx - 6)},${f1(yr)}Z`
    case 'degrau':
      return `M${f1(cx - 9)},${f1(yr + 6)}h5v-4h5v-4h5v-4h3`
    case 'barra':
      return `M${f1(cx - 9)},${f1(yr - 2)}h18v4h-18Z`
  }
}

function formaDoTerreno(t: ViagemCfg['terrenos'][number]): FormaMarca | null {
  if (t.agua) return 'onda'
  const n = Math.min(3, Math.round(t.custo) - 1)
  return n >= 1 ? (`tri${n}` as FormaMarca) : null
}

/** Forma de cada rota da config: anel pra rota só de meios de água; as
 *  outras, na ordem, losango → degrau → barra. */
function formasDasRotas(cfg: ViagemCfg): Map<string, FormaMarca> {
  const agua = new Set(cfg.terrenos.filter((t) => t.agua).map((t) => t.chave))
  const deAgua = (meio: string) => {
    const m = cfg.meios.find((x) => x.nome === meio)
    return !!m && m.em.length > 0 && m.em.every((k) => agua.has(k))
  }
  const seq: FormaMarca[] = ['losango', 'degrau', 'barra']
  const out = new Map<string, FormaMarca>()
  let i = 0
  for (const r of cfg.rotas ?? []) {
    if (r.meios.length > 0 && r.meios.every(deAgua)) out.set(r.chave, 'anel')
    else out.set(r.chave, seq[Math.min(i++, seq.length - 1)]!)
  }
  return out
}

export interface AreaFonte {
  x: number
  y: number
  w: number
  h: number
}

const memoMarcas = new WeakMap<Map<string, string>, WeakMap<Map<string, string>, WeakMap<ViagemCfg, Map<string, MarcaMapa[]>>>>()

/** Marcas dos modificadores (uma por classe presente, na ordem da config:
 *  terrenos, depois rotas). `area` (px da fonte) = só os hexes dentro dela
 *  (+1 hex de folga) — a vista da Exploração. Memoizado pelos índices (o doc
 *  efetivo devolve o mesmo Map enquanto nada muda), config e recorte. */
export function marcasDoMapa(
  indice: Map<string, string>,
  indiceRotas: Map<string, string>,
  cfg: ViagemCfg,
  area?: AreaFonte,
): MarcaMapa[] {
  const chaveArea = area ? `${area.x},${area.y},${area.w},${area.h}` : '*'
  let a = memoMarcas.get(indice)
  if (!a) memoMarcas.set(indice, (a = new WeakMap()))
  let b = a.get(indiceRotas)
  if (!b) a.set(indiceRotas, (b = new WeakMap()))
  let c = b.get(cfg)
  if (!c) b.set(cfg, (c = new Map()))
  const hit = c.get(chaveArea)
  if (hit) return hit
  const folga = ATLAS_HEX_SIZE * 2
  const dentro = (x: number, y: number) =>
    !area ||
    (x >= area.x - folga && x <= area.x + area.w + folga && y >= area.y - folga && y <= area.y + area.h + folga)
  const juntar = (idx: Map<string, string>, formaDe: (chave: string) => FormaMarca | null) => {
    const ds = new Map<string, string>()
    for (const [hex, chave] of idx) {
      const forma = formaDe(chave)
      if (!forma) continue
      const [col, row] = hex.split(',').map(Number) as [number, number]
      const p = atlasHexCenter(col, row)
      if (!dentro(p.x, p.y)) continue
      ds.set(chave, (ds.get(chave) ?? '') + marcaPath(forma, p.x, p.y))
    }
    return ds
  }
  const out: MarcaMapa[] = []
  const formaT = new Map(cfg.terrenos.map((t) => [t.chave, formaDoTerreno(t)]))
  const dsT = juntar(indice, (k) => formaT.get(k) ?? null)
  for (const t of cfg.terrenos) {
    const d = dsT.get(t.chave)
    const forma = formaT.get(t.chave)
    if (d && forma)
      out.push({ classe: `terreno:${t.chave}`, camada: 'terreno', chave: t.chave, nome: t.nome, cor: t.cor ?? 'var(--muted)', forma, d })
  }
  const formaR = formasDasRotas(cfg)
  const dsR = juntar(indiceRotas, (k) => formaR.get(k) ?? null)
  for (const r of cfg.rotas ?? []) {
    const d = dsR.get(r.chave)
    if (d)
      out.push({ classe: `rota:${r.chave}`, camada: 'rotas', chave: r.chave, nome: r.nome, cor: r.cor ?? 'var(--muted)', forma: formaR.get(r.chave)!, d })
  }
  c.set(chaveArea, out)
  return out
}
