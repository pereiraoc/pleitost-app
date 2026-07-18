import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { regionMapForDoc } from '../../data/region-maps'
import { getHexMapState } from '../../data/hexmap-store'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { HexMapEditor } from './HexMapEditor'
import { DocRuleElements } from './RuleElements'
import { useAtlasRelations, AtlasBreadcrumb, AtlasChildren, type AtlasRelations } from './AtlasNav'
import { compendioKicker } from '../layout/design-nav'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import {
  getLocalDoc,
  localEntriesOfKind,
  useLocalStoreVersion,
} from '../../data/local-entities'
import { useSettings } from '../../settings'
import {
  TIER_COLUNA,
  DEFAULT_ENCOMENDA_MATRIX,
  localTypeFromSubtype,
  rollShop2,
  type LocalType,
  type ProntaEntry,
  type EncomendaEntry,
  type Tier,
} from '../../data/commerce'
import { buildShopCandidates } from '../../data/commerce-candidates'
import {
  decrementProntaEntry,
  setShopRoll,
  useShopState,
} from '../../data/commerce-store'
import { buyConsumivel, buyTreasure, buyWeapon, heroOuro, type PurchaseResult } from '../../data/purchase'
import { docField } from '../ficha/hero-model'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { TipProvider, TipHover } from '../ficha/tooltips'
import { ItemFigura, useItemFigura, ITEM_CARD_CSS, esc, ItemHover, docTier, docImageUrl } from '../item-card'
import { useAssetIndex, resolveAsset, assetUrl } from '../../data/assets'

// Ficha de Localização do compêndio (issue #66). Substitui o markdown genérico
// (DocView) por uma ficha com abas Detalhes/Comércio/Hexploração na linguagem
// visual do design (mono kicker, borda/clip cortado, aba ativa com underline
// accent — mesmo padrão dos grupoTabs/npcTabs). Comércio e Hexploração são
// fundação das próximas issues de hexcrawl (#72 loja, #67 mapa), aqui só
// scaffolding.

/** Categoria que dispara esta ficha. `doc.type` espelha `frontmatter.categoria`
 *  (extractor/parse-doc.mjs:57), então checar `type` é checar a categoria. */
export const LOCATION_CATEGORY = 'Localização'

export function isLocation(doc: VaultDoc): boolean {
  return doc.type === LOCATION_CATEGORY
}

/** clip-path de canto cortado do design (mesmo polígono de .type-card/.doc-hero). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

// ─────────────────────────── Aba Detalhes ───────────────────────────

/** Campos da aba Detalhes, na ordem de exibição (fonte de verdade do schema
 *  da ficha — os rótulos são declarados aqui, nunca inventados no render).
 *  `subtype` lê doc.subtype (= frontmatter.subcategoria); `text` lê
 *  frontmatter[key]; `recursos` lê a lista frontmatter.Recursos. Campos
 *  ausentes/vazios são omitidos. */
type DetailField =
  | { kind: 'subtype'; label: string }
  | { kind: 'text'; label: string; key: string }
  | { kind: 'recursos'; label: string }

// Feedback do mestre: Tipo e Geolocalização NÃO entram na tabela (já aparecem no
// topo). Recursos saíram da tabela também — viram uma grade de mini-cards com
// imagem + tooltip (RecursosGrid), abaixo.
const DETAIL_FIELDS: DetailField[] = [
  { kind: 'text', label: 'Descrição', key: 'Descrição' },
  { kind: 'text', label: 'Contexto', key: 'Contexto' },
  { kind: 'text', label: 'Organizações Influentes', key: 'Organizações_Influentes' },
  { kind: 'text', label: 'Acontecimento Recente', key: 'Acontecimento_Recente' },
]

/** Valor escalar exibível de um FM (string/número/boolean não-vazio) ou null. */
function fieldText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/** Itens não-vazios da lista Recursos (wikilinks ou strings simples). */
function locationRecursos(doc: VaultDoc): string[] {
  const raw = doc.frontmatter['Recursos']
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
}

const HERO_STYLE: CSSProperties = {
  width: '100%',
  maxHeight: 340,
  objectFit: 'cover',
  display: 'block',
  border: '1px solid var(--line2)',
  clipPath: clip(14),
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  )
}

/** Recurso sem nota no sistema (ex.: "Rubi", "Agricultura (Grãos)") — ícone
 *  genérico, já que não há carta pra mostrar. */
const RECURSO_ICON = '📦'

/** Mini-card de um recurso do lugar (feedback do mestre): quadrado com a imagem
 *  da coisa (arma/imbuição/tesouro), tooltip da carta como as armas mostram
 *  (ItemHover); recurso sem nota cai no ícone genérico + tooltip com o nome. */
function RecursoCard({ name, doc }: { name: string; doc: VaultDoc | undefined }) {
  const assets = useAssetIndex()
  const byName = doc && assets ? resolveAsset(assets, doc.basename) : null
  const img =
    doc && assets ? (docImageUrl(doc, docTier(doc), assets) ?? (byName ? assetUrl(byName) : null)) : null
  const square = (
    <span
      style={{
        width: 54,
        height: 54,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: clip(9),
        fontSize: 24,
      }}
    >
      {img ? (
        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        RECURSO_ICON
      )}
    </span>
  )
  const cell = (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 72, cursor: 'default' }}>
      {square}
      <span
        style={{
          fontSize: 9.5,
          lineHeight: 1.15,
          textAlign: 'center',
          color: 'var(--muted)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {name}
      </span>
    </span>
  )
  return doc ? <ItemHover doc={doc} fullBody>{cell}</ItemHover> : <TipHover html={esc(name)}>{cell}</TipHover>
}

/** Grade de recursos: resolve os wikilinks (arma/imbuição/foco/tesouro) pros
 *  docs e carrega as cartas; texto puro fica como recurso sem nota. */
function RecursosGrid({ recursos }: { recursos: string[] }) {
  const catalog = useCatalog()
  const items = useMemo(
    () =>
      recursos.map((raw) => {
        const inner = /\[\[([^\]]+)\]\]/.exec(raw)?.[1] ?? null
        if (inner) {
          const [target, alias] = inner.split('|')
          const res = catalog.resolve((target ?? '').trim())
          return { id: res.kind === 'doc' ? res.id : null, name: (alias ?? target ?? raw).trim() }
        }
        return { id: null as string | null, name: raw.trim() }
      }),
    [recursos, catalog],
  )
  const ids = useMemo(() => items.map((i) => i.id).filter((x): x is string => !!x), [items])
  const docs = useDocs(ids)
  if (!items.length) return null
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' }}>
        {`// RECURSOS · ${items.length}`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {items.map((it, i) => (
          <RecursoCard key={i} name={it.name} doc={it.id ? docs?.get(it.id) : undefined} />
        ))}
      </div>
    </section>
  )
}

function DetalhesTab({ doc, rel }: { doc: VaultDoc; rel: AtlasRelations }) {
  const recursos = locationRecursos(doc)
  const rows: ReactNode[] = []
  for (const field of DETAIL_FIELDS) {
    if (field.kind !== 'text') continue
    const text = fieldText(doc.frontmatter[field.key])
    if (text != null) {
      rows.push(
        <DetailRow key={field.key} label={field.label}>
          <InlineFieldValue value={text} />
        </DetailRow>,
      )
    }
  }
  const vazio = !rows.length && !recursos.length && rel.children.length === 0
  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rows.length ? (
          <table className="inline-fields">
            <tbody>{rows}</tbody>
          </table>
        ) : null}
        {recursos.length ? <RecursosGrid recursos={recursos} /> : null}
        {vazio ? <EmptyPanel>{'// SEM DETALHES REGISTRADOS'}</EmptyPanel> : null}
        {/* Feedback do mestre: os lugares-filhos moram AQUI (descer na hierarquia). */}
        <AtlasChildren doc={doc} children={rel.children} nameOf={rel.nameOf} subtypeOf={rel.subtypeOf} />
      </div>
    </TipProvider>
  )
}

// ───────────────────── Comércio / Hexploração (scaffold) ─────────────────────

/** Empty state sóbrio na linguagem do design (mono, borda tracejada, muted). */
function EmptyPanel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div
      style={{
        padding: 50,
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.12em',
        color: 'var(--muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        clipPath: clip(14),
      }}
    >
      <div>{children}</div>
      {note ? <div style={{ fontSize: 11, letterSpacing: '.06em', opacity: 0.8 }}>{note}</div> : null}
    </div>
  )
}

// ─────────────────────────── Aba Comércio (loja) ───────────────────────────

const HEROIS_FOLDER = 'Sistema/Criaturas/Heróis'

/** Herói disponível pro seletor de compra: entry (vault/local) + doc carregado
 *  (para ler/escrever o Inventario). */
interface HeroOption {
  entry: IndexDocEntry
  doc: VaultDoc | undefined
}

/** Carrega os heróis disponíveis (pasta de Heróis da vault + heróis locais)
 *  para o seletor de compra. Espelha o useFolderDocs das telas de criatura,
 *  reduzido ao que a loja precisa (id/nome/doc). */
function useHeroOptions(): HeroOption[] {
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  const node = catalog.folderByPath.get(HEROIS_FOLDER)
  const vaultEntries = useMemo(
    () => (node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node],
  )
  const localEntries = useMemo(() => localEntriesOfKind('Heroi'), [version])
  const [vaultDocs, setVaultDocs] = useState<Map<string, VaultDoc>>()

  useEffect(() => {
    if (!vaultEntries.length) return
    let alive = true
    Promise.all(vaultEntries.map((e) => loadDoc(e.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const d of loaded) if (d) byId.set(d.id, d)
      setVaultDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [vaultEntries])

  return useMemo(() => {
    const out: HeroOption[] = []
    for (const e of vaultEntries) out.push({ entry: e, doc: vaultDocs?.get(e.id) })
    for (const e of localEntries) out.push({ entry: e, doc: getLocalDoc(e.id) })
    return out
    // vaultDocs muda quando os docs chegam; version cobre os locais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultEntries, vaultDocs, localEntries, version])
}

/** Sufixo do tier no nome do item — "(A)"/"(E)"/"(M)". */
const tierLabel = (tier: Tier): string => `(${TIER_MEDAL_LETTER[tier]})`
const TIER_MEDAL_LETTER: Record<Tier, string> = { A: 'A', E: 'E', M: 'M' }


/** Ícone de COMPRAR com tooltip (formato do app). */
function BuyButton({ label, preco, canBuy, onBuy }: { label: string; preco: number; canBuy: boolean; onBuy: () => void }) {
  const html = canBuy
    ? `<div class="dv-tooltip-head-row">Comprar</div>${esc(label)} · ${preco} PO`
    : 'Ouro insuficiente ou nenhum herói selecionado'
  return (
    <TipHover html={html}>
      <button
        onClick={canBuy ? onBuy : undefined}
        disabled={!canBuy}
        aria-label={`Comprar ${label}`}
        style={{
          flex: 'none',
          width: 34,
          height: 30,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          background: canBuy ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
          border: `1px solid ${canBuy ? 'color-mix(in srgb,var(--accent) 45%,transparent)' : 'var(--line2)'}`,
          color: canBuy ? 'var(--accent)' : 'var(--muted)',
          clipPath: clip(5),
          cursor: canBuy ? 'pointer' : 'not-allowed',
          opacity: canBuy ? 1 : 0.5,
        }}
      >
        🛒
      </button>
    </TipHover>
  )
}

/** Linha da PRONTA ENTREGA em 2 linhas: figura à esquerda; linha 1 nome+categoria,
 *  linha 2 qtd/preço + comprar. Hover na figura mostra a(s) carta(s) do item. */
function ProntaRow({
  entry,
  docsById,
  canBuy,
  onBuy,
}: {
  entry: ProntaEntry
  docsById: Map<string, VaultDoc>
  canBuy: boolean
  onBuy: () => void
}) {
  const { img, seloImg, cardHtml } = useItemFigura(entry, docsById)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
      <TipHover html={cardHtml}>
        <ItemFigura img={img} seloImg={seloImg} tier={entry.tier} />
      </TipHover>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.label} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{tierLabel(entry.tier)}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>×{entry.quantidade}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{entry.preco} PO</span>
        </div>
      </div>
      <BuyButton label={entry.label} preco={entry.preco} canBuy={canBuy} onBuy={onBuy} />
    </div>
  )
}

/** Linha da ENCOMENDA (GM), 2 linhas sem comprar; hover mostra a carta. */
function EncomendaRow({ entry, docsById }: { entry: EncomendaEntry; docsById: Map<string, VaultDoc> }) {
  const { img, seloImg, cardHtml } = useItemFigura(entry, docsById)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid var(--line)' }}>
      <TipHover html={cardHtml}>
        <ItemFigura img={img} seloImg={seloImg} tier={entry.tier} />
      </TipHover>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.label} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{tierLabel(entry.tier)}</span>
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{entry.preco} PO</span>
      </div>
    </div>
  )
}


/** Caixa (painel cortado) que envolve uma lista da loja. */
const LIST_BOX: CSSProperties = {
  padding: '10px 16px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(14),
}

/** Categoria da entrada p/ as abas: poção (consumível), arma (combo/obra-prima de
 *  arma) ou equipamento (o resto). Usa `isPocao` OU o path /Consumíveis/ (robusto
 *  contra rolagens antigas sem a flag). */
type ShopCat = 'armas' | 'equip' | 'pocoes'
function entryCat(e: { key: string; armaTarget?: string; isPocao?: boolean }): ShopCat {
  if (e.isPocao || e.key.includes('/Consumíveis/')) return 'pocoes'
  if (e.armaTarget) return 'armas'
  return 'equip'
}

/** Toggle pequeno do modo (Pronta / Encomenda) — SÓ o GM vê/alterna. */
function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.04em',
        padding: '3px 7px',
        borderRadius: 4,
        cursor: 'pointer',
        color: active ? 'var(--panel)' : 'var(--muted)',
        background: active ? 'var(--accent)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line2)'}`,
      }}
    >
      {children}
    </button>
  )
}

/** Botão de sub-aba da loja (EQUIPAMENTOS / POÇÕES). */
function SubTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '8px 10px',
        background: active ? 'color-mix(in srgb,var(--accent) 7%,transparent)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        letterSpacing: '.04em',
        color: active ? 'var(--accent)' : 'var(--muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function ComercioTab({ doc, defaultHeroId }: { doc: VaultDoc; defaultHeroId?: string }) {
  const catalog = useCatalog()
  const { mestre, disponibilidade } = useSettings()
  const shop = useShopState(doc.id)
  const heroes = useHeroOptions()
  // #89: na sidebar, o comprador default = herói selecionado (se for opção).
  const selectedCreatureId = useSelectedCreature()
  // Comprador = herói selecionado globalmente (topo direito). Sem seletor aqui.
  const buyerId = selectedCreatureId ?? defaultHeroId ?? ''
  const [aviso, setAviso] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<ShopCat>('armas')
  const [mode, setMode] = useState<'pronta' | 'encomenda'>('pronta')

  // Tipo de local efetivo: o guardado na rolagem (permite override "Iluminada"
  // do GM persistido) ou a projeção da subcategoria.
  const subtypeLocalType = localTypeFromSubtype(doc.subtype)
  const localType: LocalType | null = shop?.localType ?? subtypeLocalType

  // Candidatos da loja (#93): TODOS os tesouros simples + combos das ARMAS
  // TÍPICAS × imbuições + obra-primas + poções, montados do catálogo. Carrega os
  // docs necessários uma vez; guarda os das armas p/ a miniatura.
  const recursos = useMemo(() => locationRecursos(doc), [doc])
  const [built, setBuilt] = useState<ReturnType<typeof buildShopCandidates> | null>(null)
  const [docsById, setDocsById] = useState<Map<string, VaultDoc>>(new Map())
  useEffect(() => {
    const tesIds: string[] = []
    const imbIds: string[] = []
    const qualIds: string[] = []
    const pocIds: string[] = []
    for (const e of catalog.content) {
      const id = e.id
      if (id.includes('/Tesouros/Equipamentos/') || id.includes('/Tesouros/Implementos/')) tesIds.push(id)
      else if (id.includes('/Imbuições e Qualidade/Imbuições/')) imbIds.push(id)
      else if (id.includes('/Imbuições e Qualidade/Qualidade/')) qualIds.push(id)
      else if (id.includes('/Tesouros/Consumíveis/')) pocIds.push(id)
    }
    const armaIds: string[] = []
    for (const raw of recursos) {
      const res = catalog.resolve(raw.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim())
      if (res.kind === 'doc' && res.id.includes('/Equipamento/Armas/')) armaIds.push(res.id)
    }
    const load = (arr: string[]) =>
      Promise.all(arr.map((id) => loadDoc(id).catch(() => null))).then((ds) =>
        ds.filter((d): d is VaultDoc => d != null),
      )
    let alive = true
    Promise.all([load(tesIds), load(imbIds), load(qualIds), load(pocIds), load(armaIds)]).then(
      ([tesourosSimples, imbuicoes, qualidades, pocoes, armasTipicas]) => {
        if (!alive) return
        const all = [...tesourosSimples, ...imbuicoes, ...qualidades, ...pocoes, ...armasTipicas]
        setDocsById(new Map(all.map((d) => [d.id, d])))
        setBuilt(
          buildShopCandidates({ recursos, tesourosSimples, imbuicoes, qualidades, pocoes, armasTipicas }),
        )
      },
    )
    return () => {
      alive = false
    }
  }, [recursos, catalog])

  const selectedHero = heroes.find((h) => h.entry.id === buyerId)
  const ouro = selectedHero ? heroOuro(selectedHero.entry.id, selectedHero.doc) : null

  // AUTO-ABRE a loja na 1ª visita (sem depender do Modo Mestre). Roda uma vez:
  // quando `shop` passa a existir o efeito vira no-op. O GM re-rola/trava.
  useEffect(() => {
    if (shop || !localType || !built) return
    setShopRoll(
      doc.id,
      rollShop2(built.candidates, built.pocoes, localType, disponibilidade, DEFAULT_ENCOMENDA_MATRIX, Math.random),
      localType,
    )
  }, [shop, localType, built, disponibilidade, doc.id])

  // Locais sem regra de disponibilidade (Ponto de Interesse/Região/Nação) não
  // têm loja de tesouros — mostra o empty state honesto.
  if (!localType) {
    return (
      <EmptyPanel note="Só cidades (Pequena Cidade, Grande Cidade, Capital) têm disponibilidade de tesouros na nota de regras.">
        {'// SEM COMÉRCIO DE TESOUROS'}
      </EmptyPanel>
    )
  }

  const doRoll = () => {
    if (!built) return
    setShopRoll(
      doc.id,
      rollShop2(built.candidates, built.pocoes, localType, disponibilidade, DEFAULT_ENCOMENDA_MATRIX, Math.random),
      localType,
    )
    setAviso(null)
  }

  const comprar = (entry: ProntaEntry) => {
    if (!selectedHero) {
      setAviso('Escolha um herói para comprar.')
      return
    }
    const hid = selectedHero.entry.id
    const hdoc = selectedHero.doc
    const finish = (r: PurchaseResult) => {
      if (!r.ok) {
        setAviso('Ouro insuficiente.')
        return
      }
      decrementProntaEntry(doc.id, entry.key, entry.tier)
      setAviso(`Comprado: ${entry.label} (${TIER_COLUNA[entry.tier]}). Ouro restante: ${r.ouroRestante} PO.`)
    }
    const pb = entry.propriedadeBase ?? ''
    // Poção → Consumíveis (soma quantidade), não Tesouros.
    if (entry.isPocao) {
      finish(buyConsumivel(hid, hdoc, entry.nome, entry.tier, entry.preco))
      return
    }
    // #299: combo arma×imbuição/obra-prima é ARMA → Armas.Lista.
    if (entry.armaTarget) {
      const armaId = entry.armaTarget
      const idxEntry = catalog.entryById.get(armaId)
      const armaBasename = idxEntry?.basename ?? armaId.split('/').pop() ?? armaId
      finish(
        buyWeapon(
          hid,
          hdoc,
          {
            armaBasename,
            grupo: idxEntry?.grupo,
            propriedades: docField(docsById.get(armaId), 'propriedades'),
            tier: entry.tier,
            propriedadeBase: entry.propriedadeBase,
          },
          entry.preco,
        ),
      )
      return
    }
    // Armadura/Escudo/Broquel obra-prima → vão pros TESOUROS como peça NÃO
    // EQUIPADA (o herói equipa depois pelo botão "Equipar" no inventário). O
    // nome do tesouro é a BASE (thumbBasename, ex. "Armadura Leve"), que resolve
    // pro doc da peça — o inventário reconhece que é equipável.
    if (
      (pb === 'Armadura Obra-prima' || pb === 'Escudo Obra-prima' || pb === 'Broquel Obra-prima') &&
      entry.thumbBasename
    ) {
      finish(buyTreasure(hid, hdoc, entry.thumbBasename, entry.tier, entry.preco))
      return
    }
    // Demais tesouros (implementos/equipamentos/ferramenta obra-prima).
    finish(buyTreasure(hid, hdoc, entry.nome, entry.tier, entry.preco))
  }

  const pronta = shop?.pronta ?? []
  const encomenda = shop?.encomenda ?? []
  // Jogador fica travado em pronta entrega; só o GM alterna p/ encomenda. Poção
  // é sempre pronta entrega (sem encomenda).
  const effMode: 'pronta' | 'encomenda' = mestre && subTab !== 'pocoes' ? mode : 'pronta'
  const byPreco = (a: { preco: number }, b: { preco: number }) => a.preco - b.preco
  const prontaDe = (cat: ShopCat) => pronta.filter((e) => entryCat(e) === cat).sort(byPreco)
  const encomendaDe = (cat: ShopCat) => encomenda.filter((e) => entryCat(e) === cat).sort(byPreco)
  const prontaTab = prontaDe(subTab)
  const encomendaTab = encomendaDe(subTab)

  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controles do GM (Modo Mestre) em UMA linha acima das abas: RE-ROLAR à
          esquerda; PRONTA/ENCOMENDA à direita. Sem cabeçalho de loja/herói/saldo
          (o tipo já está no topo; as moedas ficam na topbar). Jogador não vê nada. */}
      {mestre ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={doRoll}
            disabled={!built}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              letterSpacing: '.04em',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: built ? 'pointer' : 'not-allowed',
              color: 'var(--accent)',
              background: 'color-mix(in srgb,var(--accent) 14%,transparent)',
              border: '1px solid color-mix(in srgb,var(--accent) 45%,transparent)',
              opacity: built ? 1 : 0.5,
            }}
          >
            {shop ? 'RE-ROLAR' : 'ROLAR'}
          </button>
          <span style={{ flex: 1 }} />
          {shop && subTab !== 'pocoes' ? (
            <>
              <ModeBtn active={effMode === 'pronta'} onClick={() => setMode('pronta')}>PRONTA</ModeBtn>
              <ModeBtn active={effMode === 'encomenda'} onClick={() => setMode('encomenda')}>ENCOMENDA</ModeBtn>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Sub-abas ARMAS | EQUIPAMENTOS | POÇÕES. */}
      {shop ? (
        <div role="tablist" className="tabs-scroll" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
          <SubTabBtn active={subTab === 'armas'} onClick={() => setSubTab('armas')}>ARMAS</SubTabBtn>
          <SubTabBtn active={subTab === 'equip'} onClick={() => setSubTab('equip')}>EQUIPAMENTOS</SubTabBtn>
          <SubTabBtn active={subTab === 'pocoes'} onClick={() => setSubTab('pocoes')}>POÇÕES</SubTabBtn>
        </div>
      ) : null}

      {!shop ? (
        <EmptyPanel
          note={
            mestre
              ? 'Role a disponibilidade para montar a loja.'
              : 'O mestre ainda não abriu a loja deste lugar.'
          }
        >
          {'// LOJA FECHADA'}
        </EmptyPanel>
      ) : effMode === 'encomenda' ? (
        // ENCOMENDA (GM): disponível sob pedido — só referência, sem compra.
        <div style={{ ...LIST_BOX, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              color: 'var(--muted)',
              paddingBottom: 4,
            }}
          >
            DISPONÍVEL POR ENCOMENDA · {encomendaTab.length}
          </span>
          {encomendaTab.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Nada disponível por encomenda desta vez.
            </span>
          ) : (
            encomendaTab.map((e) => <EncomendaRow key={e.key + e.tier} entry={e} docsById={docsById} />)
          )}
          {subTab === 'armas' ? (
            <span style={{ fontSize: 11, color: 'var(--muted)', paddingTop: 6, lineHeight: 1.4 }}>
              Armas fora da região podem ser encomendadas sob consulta (não listadas).
            </span>
          ) : null}
        </div>
      ) : prontaTab.length === 0 ? (
        <EmptyPanel note="A rolagem não trouxe nada pronto desta vez.">{'// SEM ESTOQUE'}</EmptyPanel>
      ) : (
        <div style={LIST_BOX}>
          {prontaTab.map((e) => (
            <ProntaRow
              key={e.key + e.tier}
              entry={e}
              docsById={docsById}
              canBuy={!!selectedHero && (ouro ?? 0) >= e.preco}
              onBuy={() => comprar(e)}
            />
          ))}
        </div>
      )}

      {aviso ? (
        <div
          role="status"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.04em',
            color: 'var(--muted)',
          }}
        >
          {aviso}
        </div>
      ) : null}
      </div>
    </TipProvider>
  )
}

/** Aba HEXPLORAÇÃO (issue #67) — autoria do mapa de hexcrawl da região. Quando
 *  a região tem um mapa configurado (region-maps.ts) mas ainda não há hex
 *  mapeado, mostra o CTA "Adicionar Hexploração" (que abre o editor); com
 *  mapeamentos, abre o editor direto. O editor gere o próprio estado
 *  (hexmap-store) — aqui só o gate do onboarding. */
function HexploracaoTab({ doc }: { doc: VaultDoc }) {
  const region = regionMapForDoc(doc)
  const [aberto, setAberto] = useState(false)
  // region é garantido não-nulo (a aba só habilita se locationHasHexMap(doc)),
  // mas o guard mantém o componente honesto sobre a fonte de verdade.
  if (!region) return <EmptyPanel>{'// SEM MAPA DE HEXCRAWL'}</EmptyPanel>

  const jaTemMapa = getHexMapState(region.regionId).cells.length > 0
  if (jaTemMapa || aberto) return <HexMapEditor region={region} />

  return (
    <EmptyPanel note="Marque os hexes do mapa desta região com as Localizações do Atlas.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div>{'// HEXPLORAÇÃO'}</div>
        <button
          onClick={() => setAberto(true)}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.16em',
            color: 'var(--accent)',
            background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
            border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
            padding: '9px 18px',
            clipPath: clip(6),
            cursor: 'pointer',
          }}
        >
          ADICIONAR HEXPLORAÇÃO
        </button>
      </div>
    </EmptyPanel>
  )
}

// ───────────────────────────── Abas ─────────────────────────────

interface LocTab {
  id: 'detalhes' | 'comercio' | 'hexploracao'
  label: string
  /** Predicado de habilitação; ausente = sempre habilitada. */
  enabled?: (doc: VaultDoc) => boolean
}

/** Issue #67: a Hexploração habilita numa Localização que ANCORA um mapa de
 *  hexcrawl — a nota-raiz de uma região com mapa configurado (region-maps.ts).
 *  Por ora só o Mundo Livre (a nota `Atlas/Mundo Livre/Mundo Livre` embute o
 *  asset real do mapa e a grade de exploracao.ts é calibrada sobre ele). A
 *  detecção é por id do doc (fonte de verdade única), sem heurística de string. */
export function locationHasHexMap(doc: VaultDoc): boolean {
  return regionMapForDoc(doc) != null
}

const HEX_DISABLED_NOTE =
  'Hexploração só é habilitada na nota-raiz de uma região com mapa de hexcrawl configurado (por ora, Mundo Livre).'

const LOCATION_TABS: LocTab[] = [
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'comercio', label: 'Comércio' },
  { id: 'hexploracao', label: 'Hexploração', enabled: locationHasHexMap },
]

export function LocationSheet({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  const [tab, setTab] = useState<LocTab['id']>('detalhes')
  const rel = useAtlasRelations(doc)
  // Na sidebar de DETALHES (aberta do modo Exploração), a aba Hexploração não
  // faz sentido — já estamos na hexploração e o editor não cabe ali.
  const tabs = sidebar ? LOCATION_TABS.filter((t) => t.id !== 'hexploracao') : LOCATION_TABS
  const img = doc.images.find((i) => i.from === 'body') ?? doc.images[0]

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {/* Na sidebar/embutido o kicker "Compêndio do Sistema" só polui — some. */}
      {sidebar || embedded ? null : <div className="kicker">{compendioKicker(LOCATION_CATEGORY)}</div>}
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        {/* Feedback do mestre: só o subtype ("Nação"), sem "Localização · " (a
            categoria já vai no kicker). */}
        <span className="doc-type">{doc.subtype || LOCATION_CATEGORY}</span>
      </header>

      {/* F6 (#250) → feedback do mestre: SÓ o breadcrumb (o caminho) no topo;
          os lugares-filhos viram lista "Lugares dentro de X" na aba Detalhes. */}
      <AtlasBreadcrumb crumbs={rel.crumbs} />

      {/* Imagem do local FIXA — abaixo do tipo e acima das abas, visível em
          qualquer aba (fica muito melhor de ver). Clicar amplia (lightbox). */}
      {img ? <VaultImage target={img.target} style={HERO_STYLE} zoom /> : null}

      {/* Fila de abas — mesmo padrão dos grupoTabs (mono/underline accent) com a
          convenção :disabled existente (opacity .38, cursor default). */}
      <div role="tablist" className="tabs-scroll" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {tabs.map((t) => {
          const enabled = t.enabled ? t.enabled(doc) : true
          const on = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              disabled={!enabled}
              title={!enabled && t.id === 'hexploracao' ? HEX_DISABLED_NOTE : undefined}
              onClick={() => enabled && setTab(t.id)}
              style={{
                padding: '11px 16px',
                background: on ? 'color-mix(in srgb,var(--accent) 7%,transparent)' : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                fontFamily: 'var(--body)',
                fontWeight: 600,
                letterSpacing: '.07em',
                fontSize: 12,
                color: on ? 'var(--accent)' : 'var(--muted)',
                cursor: enabled ? 'pointer' : 'default',
                opacity: enabled ? 1 : 0.38,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 4 }}>
        {tab === 'detalhes' ? <DetalhesTab doc={doc} rel={rel} /> : null}
        {tab === 'comercio' ? <ComercioTab doc={doc} /> : null}
        {tab === 'hexploracao' ? <HexploracaoTab doc={doc} /> : null}
      </div>
      <DocRuleElements doc={doc} />
    </article>
  )
}
