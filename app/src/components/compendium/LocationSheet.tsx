import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { docPath } from '../../paths'
import { reskinName, reskinText } from '../../data/reskin'
import { useDetail } from '../../data/detail-context'
import { leafletZoom, markerVisivel, markerGlyph } from '../../map/leaflet-local'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'
import { useMapView } from '../../map/useMapView'
import type { IndexDocEntry, LocationBody, VaultDoc } from '../../data/types'
import { regionMapForDoc } from '../../data/region-maps'
import { getHexMapState } from '../../data/hexmap-store'
import { InlineFieldValue } from './InlineFieldValue'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { VaultImage } from './VaultImage'
import { HexMapEditor } from './HexMapEditor'
import { useWheelScrollX } from '../ficha/bits'
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
import { podeComerciar, useGroupStoreVersion } from '../../data/group-store'
import {
  TIER_COLUNA,
  DEFAULT_ENCOMENDA_MATRIX,
  localTypeOfDoc,
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
 *  `text` lê frontmatter[key] com fallback para `locationBody[fallback]`
 *  (o template da vault escreve a prosa dentro de um callout do body — o
 *  FM tem placeholder vazio, o parser popula `locationBody`). Campos
 *  ausentes/vazios são omitidos. */
type DetailField = { kind: 'text'; label: string; key: string; fallback?: Exclude<keyof LocationBody, 'leaflet'> }

// Feedback do mestre: Tipo e Geolocalização NÃO entram nos detalhes (já aparecem
// no topo). Recursos viraram uma grade de mini-cards com imagem + tooltip
// (RecursosGrid), abaixo. Descrição/Aparência/População foram pedidos do mestre
// pra aparecerem no compêndio; hoje moram no body em callout e chegam por
// `locationBody`. Ordem: População (contexto rápido do lugar) → Descrição
// (o que é) → Aparência (como é visualmente) → resto.
const DETAIL_FIELDS: DetailField[] = [
  { kind: 'text', label: 'População', key: 'População', fallback: 'populacao' },
  { kind: 'text', label: 'Descrição', key: 'Descrição', fallback: 'descricao' },
  { kind: 'text', label: 'Aparência do Local', key: 'Aparência_do_Local', fallback: 'aparencia' },
  // #519: a prosa destes três também vive nos callouts (template POA 1987)
  { kind: 'text', label: 'Contexto', key: 'Contexto', fallback: 'contexto' },
  { kind: 'text', label: 'Organizações Influentes', key: 'Organizações_Influentes', fallback: 'organizacoesInfluentes' },
  { kind: 'text', label: 'Acontecimento Recente', key: 'Acontecimento_Recente', fallback: 'acontecimentoRecente' },
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

/** Bloco stacked: label em mono kicker em cima, prosa embaixo — usa toda a
 *  largura disponível em vez da tabela 2-colunas (a coluna de label reservava
 *  1/3 da tela do celular pra dizer "DESCRIÇÃO"). */
function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="local-field local-field-col">
      <span className="local-field-label">{label.toUpperCase()}</span>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </section>
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
        {reskinName(name)}
      </span>
    </span>
  )
  // Card COMPACTO no hover (sem fullBody): mostra os campos do item (dano/mãos/
  // valor/propriedades) + a descrição curta. fullBody trazia também a PROSA do
  // corpo com uma tabela (shc-tbl) que REPETIA mãos/valor já mostrados em cima —
  // redundante no contexto de recurso da Localização. Feedback do mestre.
  return doc ? <ItemHover doc={doc}>{cell}</ItemHover> : <TipHover html={esc(reskinName(name))}>{cell}</TipHover>
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

/** Mapa da localização (#519): bloco leaflet do template POA — viewer com
 *  pan/pinça/zoom/fullscreen (useMapView/MapControls, os mesmos do mapa do
 *  mundo) e CAMADAS POR ZOOM (report 2026-08-31): a nota já define os gates
 *  no formato do obsidian-leaflet — Bairros (maxZoom) só no zoom afastado,
 *  pontos de interesse (minZoom) só no aproximado. Ícone por tipo no registro
 *  map/leaflet-local; clicar num marker abre a nota correspondente quando o
 *  catálogo a resolve. Posições em % dos bounds (lat cresce pra CIMA;
 *  top% = 1 − lat/latMax); labels contra-escalam pra manter o tamanho. */
function MapaLocal({ leaflet }: { leaflet: NonNullable<NonNullable<VaultDoc['locationBody']>['leaflet']> }) {
  const assets = useAssetIndex()
  const catalog = useCatalog()
  const detail = useDetail()
  const navigate = useNavigate()
  const map = useMapView()
  if (!assets) return null
  const entry = resolveAsset(assets, leaflet.image)
  if (!entry) return null
  const latMax = leaflet.bounds ? leaflet.bounds[1][0] - leaflet.bounds[0][0] : null
  const longMax = leaflet.bounds ? leaflet.bounds[1][1] - leaflet.bounds[0][1] : null
  const zoom = leafletZoom(leaflet.defaultZoom ?? null, map.view.scale)
  const visiveis = leaflet.markers.filter((m) =>
    markerVisivel({ minZoom: m.minZoom ?? null, maxZoom: m.maxZoom ?? null }, zoom),
  )
  const abrir = (nome: string) => {
    const r = catalog.resolve(nome)
    if (r.kind !== 'doc') return
    if (detail) detail.open({ kind: 'doc', id: r.id })
    else navigate(docPath(r.id))
  }
  // Clique tratado no VIEWPORT com hit-test por coordenada (padrão do
  // onMapClick do mapa-múndi): o useMapView captura o ponteiro
  // (setPointerCapture), então o click sintetizado nunca chega no span do
  // marker — onClick no marker era código morto.
  const onViewportClick = (e: React.MouseEvent) => {
    if (map.consumeMoved()) return
    if (!latMax || !longMax) return
    const rect = map.mapRef.current?.getBoundingClientRect()
    if (!rect) return
    let melhor: string | null = null
    let melhorD = Infinity
    for (const m of visiveis) {
      const mx = rect.left + (m.long / longMax) * rect.width
      const my = rect.top + (1 - m.lat / latMax) * rect.height
      // âncora é a BASE do marker (ícone+label ficam acima dela)
      const d = Math.hypot(mx - e.clientX, my - 10 - e.clientY)
      if (d < melhorD) {
        melhorD = d
        melhor = m.nome
      }
    }
    if (melhor && melhorD <= 22) abrir(melhor)
  }
  return (
    <section
      ref={map.containerRef}
      style={fullscreenContainerStyle(
        {
          position: 'relative',
          maxWidth: 620,
          alignSelf: 'center',
          width: '100%',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: map.fullscreen ? 'none' : clip(10),
          overflow: 'hidden',
        },
        map.fullscreen,
      )}
    >
      <div
        ref={map.viewportRef}
        data-mapa-local-viewport=""
        onPointerDown={map.onPointerDown}
        onPointerMove={map.onPointerMove}
        onPointerUp={map.onPointerUp}
        onPointerCancel={map.onPointerUp}
        onClick={onViewportClick}
        style={{
          height: map.fullscreen ? '100%' : 'min(64vh, 560px)',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: map.dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div
          ref={map.mapRef}
          style={{
            position: 'relative',
            height: '100%',
            flex: 'none',
            transform: map.transform,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={assetUrl(entry)}
            alt={`Mapa: ${leaflet.image}`}
            draggable={false}
            style={{ height: '100%', width: 'auto', display: 'block' }}
          />
          {latMax && longMax
            ? visiveis.map((m) => (
                <span
                  key={`${m.tipo}|${m.nome}|${m.lat}|${m.long}`}
                  data-marker={m.nome}
                  title={`${m.tipo}: ${reskinName(m.nome)}`}
                  style={{
                    position: 'absolute',
                    left: `${(m.long / longMax) * 100}%`,
                    top: `${(1 - m.lat / latMax) * 100}%`,
                    transform: `translate(-50%, -100%) scale(${1 / map.view.scale})`,
                    transformOrigin: '50% 100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    lineHeight: 1,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width={14}
                    height={14}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      color: 'rgba(235,235,235,.95)',
                      filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.9))',
                    }}
                  >
                    {markerGlyph(m.tipo).map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </svg>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 7.5,
                      fontWeight: 700,
                      letterSpacing: '.04em',
                      color: '#fff',
                      textShadow: '0 1px 2px rgba(0,0,0,.9)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {reskinName(m.nome)}
                  </span>
                </span>
              ))
            : null}
        </div>
      </div>
      <MapControls map={map} />
    </section>
  )
}

function DetalhesTab({ doc, rel }: { doc: VaultDoc; rel: AtlasRelations }) {
  const recursos = locationRecursos(doc)
  const blocks: ReactNode[] = []
  for (const field of DETAIL_FIELDS) {
    // FM primeiro (permite override manual); se vazio, cai no locationBody
    // parseado do callout do template. Nunca inventa — se as duas fontes
    // são vazias, o campo é omitido.
    const fmText = fieldText(doc.frontmatter[field.key])
    const bodyText = field.fallback ? doc.locationBody?.[field.fallback] ?? null : null
    const text = fmText ?? bodyText
    if (text != null && text !== '') {
      // Valor MULTILINHA (ex.: Influências como bullets `- [[Org]] …` do
      // template, report 2026-08-29) renderiza como markdown — mesma via do
      // LocaisInteresseTab (lista de verdade, wikilinks navegáveis); valor de
      // uma linha segue inline.
      blocks.push(
        <DetailBlock key={field.key} label={field.label}>
          {text.includes('\n') ? (
            <MarkdownBody doc={{ ...doc, body: text }} />
          ) : (
            <InlineFieldValue value={text} />
          )}
        </DetailBlock>,
      )
    }
  }
  const vazio =
    !blocks.length && !recursos.length && rel.children.length === 0 && !doc.locationBody?.leaflet
  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {doc.locationBody?.leaflet ? <MapaLocal leaflet={doc.locationBody.leaflet} /> : null}
        {blocks.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{blocks}</div>
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
    ? `<div class="dv-tooltip-head-row">Comprar</div>${esc(reskinName(label))} · ${preco} ${esc(reskinText('PO'))}`
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
          {reskinName(entry.label)} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{tierLabel(entry.tier)}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>×{entry.quantidade}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{entry.preco} {reskinText('PO')}</span>
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
          {reskinName(entry.label)} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{tierLabel(entry.tier)}</span>
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{entry.preco} {reskinText('PO')}</span>
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
  const subtypeLocalType = localTypeOfDoc(doc)
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
    // Bases de armadura/escudo → "<base> Obra-prima" em qualquer cidade (#341).
    // "Sem Armadura"/"Sem Escudo" ficam de fora (não há obra-prima do nada).
    const armaduraIds: string[] = []
    const escudoIds: string[] = []
    for (const e of catalog.content) {
      const id = e.id
      if (id.includes('/Tesouros/Equipamentos/') || id.includes('/Tesouros/Implementos/')) tesIds.push(id)
      else if (id.includes('/Imbuições e Qualidade/Imbuições/')) imbIds.push(id)
      else if (id.includes('/Imbuições e Qualidade/Qualidade/')) qualIds.push(id)
      else if (id.includes('/Tesouros/Consumíveis/')) pocIds.push(id)
      else if (id.includes('/Equipamento/Armaduras/') && e.subtype === 'Armadura' && e.basename && !/^Sem /.test(e.basename))
        armaduraIds.push(id)
      else if (id.includes('/Equipamento/Escudos/') && e.subtype === 'Escudo' && e.basename && !/^Sem /.test(e.basename))
        escudoIds.push(id)
    }
    // #341: TODAS as armas vendáveis (fora especiais/naturais, que só vêm por
    // habilidade). A nota "Disponibilidade de Tesouros" prevê armas INCOMUNS com %
    // reduzido — então não são mais gateadas pelos Recursos; a tipicidade (∈
    // Recursos) é decidida dentro do buildShopCandidates.
    const armaIds: string[] = []
    for (const e of catalog.content) {
      if (!e.id.startsWith('Sistema/Equipamento/Armas/') || e.subtype !== 'Arma') continue
      const g = (typeof e.grupo === 'string' ? e.grupo : '').toLowerCase()
      if (g !== 'natural' && g !== 'especial') armaIds.push(e.id)
    }
    const load = (arr: string[]) =>
      Promise.all(arr.map((id) => loadDoc(id).catch(() => null))).then((ds) =>
        ds.filter((d): d is VaultDoc => d != null),
      )
    let alive = true
    Promise.all([
      load(tesIds),
      load(imbIds),
      load(qualIds),
      load(pocIds),
      load(armaIds),
      load(armaduraIds),
      load(escudoIds),
    ]).then(([tesourosSimples, imbuicoes, qualidades, pocoes, armas, armaduras, escudos]) => {
      if (!alive) return
      const all = [...tesourosSimples, ...imbuicoes, ...qualidades, ...pocoes, ...armas, ...armaduras, ...escudos]
      setDocsById(new Map(all.map((d) => [d.id, d])))
      setBuilt(
        buildShopCandidates({ recursos, tesourosSimples, imbuicoes, qualidades, pocoes, armas, armaduras, escudos }),
      )
    })
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
      setAviso(`Comprado: ${reskinName(entry.label)} (${TIER_COLUNA[entry.tier]}). Saldo: ${r.ouroRestante} ${reskinText('PO')}.`)
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

  // roda do mouse rola as sub-abas de lado (pedido 2026-08-15)
  const shopTabsRef = useRef<HTMLDivElement>(null)
  useWheelScrollX(shopTabsRef)
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
        <div ref={shopTabsRef} role="tablist" className="tabs-scroll" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
          <SubTabBtn active={subTab === 'armas'} onClick={() => setSubTab('armas')}>ARMAS</SubTabBtn>
          <SubTabBtn active={subTab === 'equip'} onClick={() => setSubTab('equip')}>EQUIPAMENTOS</SubTabBtn>
          <SubTabBtn active={subTab === 'pocoes'} onClick={() => setSubTab('pocoes')}>{reskinText('Poções').toUpperCase()}</SubTabBtn>
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

// ─────────────────────── Aba Locais de Interesse ───────────────────────

/** Aba de LOCAIS DE INTERESSE: renderiza o markdown do callout
 *  `[!info] Distritos e Locais de Interesse` (parseado no extractor e
 *  guardado em `doc.locationBody.locaisInteresse`). Reusa o pipeline
 *  markdown do compêndio via doc sintético — mantém wikilinks navegáveis,
 *  ícones supercharged e o estilo do resto do app. */
function LocaisInteresseTab({ doc }: { doc: VaultDoc }) {
  const raw = doc.locationBody?.locaisInteresse ?? null
  if (!raw) return <EmptyPanel>{'// SEM DISTRITOS OU LOCAIS DE INTERESSE'}</EmptyPanel>
  const synthetic: VaultDoc = { ...doc, body: raw }
  return <MarkdownBody doc={synthetic} />
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
  id: 'detalhes' | 'comercio' | 'locais-interesse' | 'hexploracao'
  label: string
  /** Predicado de habilitação; ausente = sempre habilitada. */
  enabled?: (doc: VaultDoc) => boolean
}

/** A aba "Locais de Interesse" só faz sentido quando o doc TEM o callout
 *  `[!info] Distritos e Locais de Interesse` no body (parseado no extractor
 *  para `locationBody.locaisInteresse`). Regiões/Nações sem esse callout
 *  ficam com a aba desabilitada — não inventar conteúdo vazio. */
function hasLocaisInteresse(doc: VaultDoc): boolean {
  return !!doc.locationBody?.locaisInteresse
}

/** Issue #67: a Hexploração habilita numa Localização que ANCORA um mapa de
 *  hexcrawl — a nota-raiz de uma região com mapa configurado (region-maps.ts).
 *  Por ora só o Mundo Livre (a nota `Atlas/Mundo Livre/Mundo Livre` embute o
 *  asset real do mapa e a grade de exploracao.ts é calibrada sobre ele). A
 *  detecção é por id do doc (fonte de verdade única), sem heurística de string. */
export function locationHasHexMap(doc: VaultDoc): boolean {
  return regionMapForDoc(doc) != null
}

const COMERCIO_DISABLED_NOTE =
  'O comércio abre quando o grupo está PARADO neste local (parada atual da exploração). O Modo Mestre sempre pode.'

const HEX_DISABLED_NOTE =
  'Hexploração só é habilitada na nota-raiz de uma região com mapa de hexcrawl configurado (por ora, Mundo Livre).'

const LOCAIS_INTERESSE_DISABLED_NOTE =
  'Este lugar não tem distritos ou locais de interesse registrados no callout do body.'

const LOCATION_TABS: LocTab[] = [
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'comercio', label: 'Comércio' },
  { id: 'locais-interesse', label: 'Locais de Interesse', enabled: hasLocaisInteresse },
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
  // F7 (#347): gate do comércio pela parada atual — mestre sempre pode; a
  // versão global do group-store re-renderiza quando o grupo se move. Review
  // C3: o scan do storage (podeComerciar) roda SÓ quando a versão muda, não
  // em todo render.
  const { mestre } = useSettings()
  const groupVersion = useGroupStoreVersion()
  const podeComerciarAqui = useMemo(
    () => mestre || podeComerciar(doc.id),
    [mestre, doc.id, groupVersion],
  )
  // Na sidebar de DETALHES (aberta do modo Exploração), a aba Hexploração não
  // faz sentido — já estamos na hexploração e o editor não cabe ali.
  const tabs = sidebar ? LOCATION_TABS.filter((t) => t.id !== 'hexploracao') : LOCATION_TABS
  // Report 2026-08-29 (Porto Alegre): se a imagem-hero é a MESMA do bloco
  // leaflet, ela some — o MapaLocal logo abaixo já a mostra (com os pins);
  // duas cópias da mesma imagem só empurravam o conteúdo. Retrato próprio
  // (imagem distinta do mapa) continua aparecendo.
  const heroCandidate = doc.images.find((i) => i.from === 'body') ?? doc.images[0]
  const img =
    heroCandidate && heroCandidate.target === doc.locationBody?.leaflet?.image
      ? undefined
      : heroCandidate

  // roda do mouse rola a fila de abas de lado (pedido 2026-08-15)
  const locTabsRef = useRef<HTMLDivElement>(null)
  useWheelScrollX(locTabsRef)
  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {/* Na sidebar/embutido o kicker "Compêndio do Sistema" só polui — some. */}
      {sidebar || embedded ? null : <div className="kicker">{compendioKicker(LOCATION_CATEGORY)}</div>}
      <header className="doc-header">
        <h1>{reskinName(doc.basename)}</h1>
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
      <div ref={locTabsRef} role="tablist" className="tabs-scroll" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {tabs.map((t) => {
          // F7 (#347): Comércio gateado pela PARADA ATUAL do grupo — só a
          // posição libera a compra; mestre sempre pode. Informação do
          // compêndio segue aberta (só a AÇÃO é gateada).
          const gateComercio = t.id === 'comercio' && !podeComerciarAqui
          const enabled = (t.enabled ? t.enabled(doc) : true) && !gateComercio
          const on = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              disabled={!enabled}
              title={
                !enabled && t.id === 'hexploracao'
                  ? HEX_DISABLED_NOTE
                  : !enabled && t.id === 'locais-interesse'
                    ? LOCAIS_INTERESSE_DISABLED_NOTE
                    : gateComercio
                      ? COMERCIO_DISABLED_NOTE
                      : undefined
              }
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
        {tab === 'locais-interesse' ? <LocaisInteresseTab doc={doc} /> : null}
        {tab === 'hexploracao' ? <HexploracaoTab doc={doc} /> : null}
      </div>
      <DocRuleElements doc={doc} />
    </article>
  )
}
