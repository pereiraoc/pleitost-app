import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { regionMapForDoc } from '../../data/region-maps'
import { getHexMapState } from '../../data/hexmap-store'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { HexMapEditor } from './HexMapEditor'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc } from '../../data/useDoc'
import {
  getLocalDoc,
  localEntriesOfKind,
  useLocalStoreVersion,
} from '../../data/local-entities'
import { useSettings } from '../../settings'
import {
  TIER_COLUNA,
  localTypeFromSubtype,
  resolveResourceItems,
  rollShop,
  type LocalType,
  type ShopEntry,
  type Tier,
} from '../../data/commerce'
import {
  decrementShopEntry,
  setShopRoll,
  setShopTravada,
  useShopState,
} from '../../data/commerce-store'
import { buyTreasure, heroOuro } from '../../data/purchase'
import { tokens } from '../ficha/registry'

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

const DETAIL_FIELDS: DetailField[] = [
  { kind: 'subtype', label: 'Tipo' },
  { kind: 'text', label: 'Descrição', key: 'Descrição' },
  { kind: 'recursos', label: 'Recursos' },
  { kind: 'text', label: 'Geolocalização', key: 'Geolocalização' },
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

function DetalhesTab({ doc }: { doc: VaultDoc }) {
  const img = doc.images.find((i) => i.from === 'body') ?? doc.images[0]
  const recursos = locationRecursos(doc)

  const rows: ReactNode[] = []
  for (const field of DETAIL_FIELDS) {
    if (field.kind === 'subtype') {
      const tipo = fieldText(doc.subtype)
      if (tipo) rows.push(<DetailRow key="Tipo" label={field.label}>{tipo}</DetailRow>)
    } else if (field.kind === 'recursos') {
      if (recursos.length) {
        rows.push(
          <DetailRow key="Recursos" label={field.label}>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {recursos.map((r, i) => (
                <span key={i}>
                  <InlineFieldValue value={r} />
                </span>
              ))}
            </span>
          </DetailRow>,
        )
      }
    } else {
      const text = fieldText(doc.frontmatter[field.key])
      if (text != null) {
        rows.push(
          <DetailRow key={field.key} label={field.label}>
            <InlineFieldValue value={text} />
          </DetailRow>,
        )
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {img ? <VaultImage target={img.target} style={HERO_STYLE} /> : null}
      {rows.length ? (
        <table className="inline-fields">
          <tbody>{rows}</tbody>
        </table>
      ) : (
        <EmptyPanel>{'// SEM DETALHES REGISTRADOS'}</EmptyPanel>
      )}
    </div>
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

/** Botão mono no estilo accent (mesmo padrão do CTA "ADICIONAR HEXPLORAÇÃO"). */
function ActionBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '.14em',
        color: disabled ? 'var(--muted)' : 'var(--accent)',
        background: disabled
          ? 'transparent'
          : 'color-mix(in srgb,var(--accent) 12%,transparent)',
        border: `1px solid ${disabled ? 'var(--line2)' : 'color-mix(in srgb,var(--accent) 40%,transparent)'}`,
        padding: '8px 15px',
        clipPath: clip(6),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

const TIER_MEDAL: Record<Tier, string> = { A: 'A', E: 'E', M: 'M' }

/** Linha de um item disponível na loja. */
function ShopRow({
  entry,
  canBuy,
  onBuy,
}: {
  entry: ShopEntry
  canBuy: boolean
  onBuy: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.5fr auto auto auto auto',
        alignItems: 'center',
        gap: 10,
        padding: '10px 4px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{entry.label}</span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.06em',
          color: 'var(--muted)',
          border: '1px solid var(--line2)',
          padding: '2px 6px',
          clipPath: clip(4),
        }}
        title={TIER_COLUNA[entry.tier]}
      >
        {TIER_MEDAL[entry.tier]}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
        ×{entry.quantidade}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
        {entry.preco} PO
      </span>
      <ActionBtn onClick={onBuy} disabled={!canBuy} title={!canBuy ? 'Ouro insuficiente ou sem herói' : undefined}>
        COMPRAR
      </ActionBtn>
    </div>
  )
}

function ComercioTab({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const { mestre, disponibilidade } = useSettings()
  const shop = useShopState(doc.id)
  const heroes = useHeroOptions()
  const [heroId, setHeroId] = useState<string>('')
  const [aviso, setAviso] = useState<string | null>(null)

  // Tipo de local efetivo: o guardado na rolagem (permite override "Iluminada"
  // do GM persistido) ou a projeção da subcategoria.
  const subtypeLocalType = localTypeFromSubtype(doc.subtype)
  const localType: LocalType | null = shop?.localType ?? subtypeLocalType

  // Itens de Recurso (tesouros) resolvidos no catálogo.
  const recursos = useMemo(() => locationRecursos(doc), [doc])
  const [refDocs, setRefDocs] = useState<Map<string, VaultDoc>>()
  useEffect(() => {
    const ids = new Set<string>()
    for (const raw of recursos) {
      const res = catalog.resolve(raw.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim())
      if (res.kind === 'doc') ids.add(res.id)
    }
    let alive = true
    Promise.all([...ids].map((id) => loadDoc(id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byBase = new Map<string, VaultDoc>()
      for (const d of loaded) if (d) byBase.set(d.basename, d)
      setRefDocs(byBase)
    })
    return () => {
      alive = false
    }
  }, [recursos, catalog])

  const resolveDoc = (target: string): VaultDoc | undefined => {
    const res = catalog.resolve(target)
    if (res.kind !== 'doc') return undefined
    return refDocs?.get(target) ?? refDocs?.get(catalog.entryById.get(res.id)?.basename ?? target)
  }

  const items = useMemo(
    () => resolveResourceItems(recursos, resolveDoc),
    // refDocs muda quando os docs chegam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recursos, refDocs, catalog],
  )

  const selectedHero = heroes.find((h) => h.entry.id === heroId)
  const ouro = selectedHero ? heroOuro(selectedHero.entry.id, selectedHero.doc) : null

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
    if (!refDocs) return
    setShopRoll(doc.id, rollShop(items, localType, disponibilidade, Math.random), localType)
    setAviso(null)
  }

  const comprar = (entry: ShopEntry) => {
    if (!selectedHero) {
      setAviso('Escolha um herói para comprar.')
      return
    }
    const r = buyTreasure(selectedHero.entry.id, selectedHero.doc, entry.nome, entry.tier, entry.preco)
    if (!r.ok) {
      setAviso('Ouro insuficiente.')
      return
    }
    decrementShopEntry(doc.id, entry.target, entry.tier)
    setAviso(`Comprado: ${entry.label} (${TIER_COLUNA[entry.tier]}). Ouro restante: ${r.ouroRestante} PO.`)
  }

  const entries = shop?.entries ?? []
  const travada = shop?.travada ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabeçalho: seletor de herói + saldo. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
        }}
      >
        <span style={{ fontSize: 18 }}>{tokens.emojis.subcategoria.Tesouro}</span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.1em',
            color: 'var(--muted)',
            flex: 1,
          }}
        >
          LOJA · {localType.toUpperCase()}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>HERÓI</span>
          <select
            aria-label="Herói comprador"
            value={heroId}
            onChange={(e) => setHeroId(e.target.value)}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              color: 'var(--text)',
              fontFamily: 'var(--body)',
              fontSize: 13,
              padding: '6px 8px',
              clipPath: clip(5),
            }}
          >
            <option value="">— selecionar —</option>
            {heroes.map((h) => (
              <option key={h.entry.id} value={h.entry.id}>
                {h.entry.basename}
              </option>
            ))}
          </select>
        </label>
        {ouro != null ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
            {ouro} PO
          </span>
        ) : null}
      </div>

      {/* Controles do GM (Modo Mestre): re-rolar / travar. */}
      {mestre ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionBtn
            onClick={doRoll}
            disabled={travada || !refDocs}
            title={travada ? 'Rolagem travada — destrave para re-rolar' : undefined}
          >
            {entries.length || shop ? 'RE-ROLAR' : 'ROLAR'}
          </ActionBtn>
          <ActionBtn onClick={() => setShopTravada(doc.id, !travada)} disabled={!shop}>
            {travada ? 'DESTRAVAR' : 'TRAVAR'}
          </ActionBtn>
        </div>
      ) : null}

      {/* Estoque rolado. */}
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
      ) : entries.length === 0 ? (
        <EmptyPanel note="A rolagem não trouxe nenhum tesouro pronto desta vez.">
          {'// SEM ESTOQUE'}
        </EmptyPanel>
      ) : (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(14),
          }}
        >
          {entries.map((e) => (
            <ShopRow
              key={e.target + e.tier}
              entry={e}
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

export function LocationSheet({ doc }: { doc: VaultDoc }) {
  const [tab, setTab] = useState<LocTab['id']>('detalhes')

  return (
    <article className="doc-page page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        <span className="doc-type">
          {LOCATION_CATEGORY}
          {doc.subtype ? ` · ${doc.subtype}` : ''}
        </span>
      </header>

      {/* Fila de abas — mesmo padrão dos grupoTabs (mono/underline accent) com a
          convenção :disabled existente (opacity .38, cursor default). */}
      <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {LOCATION_TABS.map((t) => {
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
        {tab === 'detalhes' ? <DetalhesTab doc={doc} /> : null}
        {tab === 'comercio' ? <ComercioTab doc={doc} /> : null}
        {tab === 'hexploracao' ? <HexploracaoTab doc={doc} /> : null}
      </div>
    </article>
  )
}
