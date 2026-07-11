// Aba EXPLORAÇÃO do grupo — hexcrawl do grupo (issues #36/#48 base; #68–#71).
// Tela SEM design dedicado; extensão sancionada na LINGUAGEM VISUAL do design
// puxado: painel de canto cortado (clip do bits.tsx), kicker mono
// "// EXPLORAÇÃO" (sectionTitleStyle), pills accent e barras colapsáveis
// sóbrias (mesmo skin do painel/line2).
//
// #68 REGIÃO ATIVA: um seletor no topo escolhe a REGIÃO do grupo dentre as com
// mapa (REGION_MAPS). O asset do mapa (regionMapById) e o mapeamento
// hex→localização (hexmap-store, namespace da região) exibidos passam a ser os
// DAQUELA região; a escolha persiste por grupo (group-store.regiaoAtiva).
//
// #69 BARRA ESQUERDA (caminho): lista as paradas na ORDEM explícita do caminho.
// "＋ parada" acrescenta ao fim; cada parada tem "inserir acima" e é arrastável
// (HTML5 drag) pra reordenar → a trilha traçada no mapa reflete a ordem.
//
// #70 BARRA DIREITA (info do local): abre ao clicar num hex que TENHA
// localização configurada no mapa da região (cellAt → localId → doc do
// catálogo). Mostra Tipo (subcategoria), Descrição e Recursos — mesma fonte de
// verdade da ficha de Localização (frontmatter), nunca inventado.
//
// #71 TOKEN (moeda): um ícone de grupo com borda arredondada indica o hex ATUAL
// (group-store.atualId, default = última parada). Arrastar o token e SOLTAR num
// hex mostra "Adicionar parada" (→ caminho do #69). Clicar na moeda, se o hex
// atual tiver localização, abre a barra direita com a info do local + a IMAGEM
// da região (que ao clicar abre a página da localização, docPath).
//
// Grade hexagonal (issue #48): overlay SVG da malha flat-top CALIBRADA
// (exploracao.ts) em px da fonte, dentro do mesmo transform (zoom/pan) do mapa.
// O hit-test é MATEMÁTICO (pixelToHex) — o SVG é pointer-events:none.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { clip } from '../components/ficha/bits'
import { InlineFieldValue } from '../components/compendium/InlineFieldValue'
import { useCatalog } from '../data/CatalogContext'
import { assetUrl, resolveAsset, useAssetIndex } from '../data/assets'
import { useDoc, useDocs } from '../data/useDoc'
import { TipProvider, TipHover } from '../components/ficha/tooltips'
import { esc } from '../components/item-card'
import type { VaultDoc } from '../data/types'
import { docPath } from '../paths'
import { REGION_MAPS, regionMapById } from '../data/region-maps'
import { useHexMap } from '../data/useHexMap'
import { useDetail } from '../data/detail-context'
import { cellAt, type HexMapCell } from '../data/hexmap-store'
import { useMapView } from '../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../map/MapControls'
import {
  addGroupHex,
  getGroupState,
  hexAt,
  hexAtual,
  insertGroupHex,
  moveGroupHex,
  removeGroupHex,
  setAtualHex,
  setRegiaoAtiva,
  subscribeGroup,
  todayISO,
  updateGroupHex,
  type GroupHex,
  type GroupState,
} from '../data/group-store'
import {
  fracToHex,
  hexCenter,
  hexGridPath,
  hexPolygonPoints,
  locaisSelectLines,
  MAP_H,
  MAP_W,
  subcategoriaEmoji,
  type HexCell,
} from './exploracao'
import { sectionTitleStyle } from './panel-ui'

/** Asset real do mapa do Mundo Livre (mantido exportado: os testes de
 *  exploração referenciam o path). A fonte de verdade do asset por região é
 *  region-maps.ts (regionMapById). */
export const MAPA_MUNDO_LIVRE = 'Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png'

/** Região ativa efetiva: a escolhida pelo GM ou a primeira com mapa (default). */
/** Cor do ponto/token ATUAL do grupo — AZUL (destaca de tudo que é accent). */
const ATUAL_BLUE = '#3b82f6'

export function activeRegionId(state: GroupState): string {
  return state.regiaoAtiva ?? REGION_MAPS[0]?.regionId ?? ''
}

/** Pill mono do design (skin do badge GRUPO do header, clip 6). */
function pillStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '.16em',
    color: active ? 'var(--panel)' : 'var(--accent)',
    background: active ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 12%,transparent)',
    border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
    padding: '5px 12px',
    clipPath: clip(6),
    cursor: 'pointer',
  }
}

/** Rótulo mono de campo (padrão NOME/APELIDO do design, dc.html:142). */
const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

/** Skin de input/select escuro usado nos campos editáveis. */
const inputStyle: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '6px 8px',
}

/** "[[A/B|C]]"→"C" — rótulo do wikilink, sem o path. */
function wikiStrip(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => (b ?? a).split('/').pop() ?? a)
    .trim()
}

/** Tooltip do LOCAL (#124): descrição (campo) + recursos, fonte de verdade no
 *  frontmatter — igual ao LocalInfo. Null quando o doc não tem nada útil. */
function localTipHtml(doc: VaultDoc | undefined): string | null {
  if (!doc) return null
  const tipo = typeof doc.subtype === 'string' ? doc.subtype.trim() : ''
  const desc = typeof doc.frontmatter['Descrição'] === 'string' ? (doc.frontmatter['Descrição'] as string) : ''
  const recursos = Array.isArray(doc.frontmatter['Recursos'])
    ? (doc.frontmatter['Recursos'] as unknown[]).filter((r): r is string => typeof r === 'string' && !!r.trim())
    : []
  const parts = [`<div class="loc-tip-name">${esc(doc.basename)}</div>`]
  if (tipo) parts.push(`<div class="loc-tip-tipo">${esc(tipo)}</div>`)
  if (desc) parts.push(`<div class="loc-tip-desc">${esc(wikiStrip(desc))}</div>`)
  if (recursos.length)
    parts.push(
      `<div class="loc-tip-rec"><b>Recursos:</b> ${recursos.map((r) => esc(wikiStrip(r))).join(', ')}</div>`,
    )
  return `<div class="loc-tip">${parts.join('')}</div>`
}

const LOC_TIP_CSS = `
.loc-tip{min-width:150px;max-width:280px}
.loc-tip-name{font-weight:800;font-size:12.5px;margin-bottom:2px}
.loc-tip-tipo{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.loc-tip-desc{font-size:11.5px;line-height:1.4;opacity:.92}
.loc-tip-rec{font-size:11px;opacity:.85;margin-top:5px}
.loc-tip-rec b{color:var(--muted)}
`

/** Nome exibível de um hex (localização mapeada na região, ou "hex col,row"). */
function hexLabel(
  hex: GroupHex,
  hexMap: HexMapCell[],
  catalog: ReturnType<typeof useCatalog>,
): string {
  if (hex.label && hex.label.trim()) return hex.label.trim() // #85: rótulo do log
  const cell = cellAt(hexMap, hex.col, hex.row)
  const localId = cell?.localId ?? hex.localId
  if (localId) return catalog.entryById.get(localId)?.basename ?? '—'
  return `Hex ${hex.col},${hex.row}`
}

/** Local ATUAL do grupo (p/ o padrão da sidebar de DETALHES): a localização do
 *  hex atual; se ele não for um lugar nomeado, a última parada nomeada andando
 *  pra trás no caminho; senão a própria região. */
function currentLocalId(
  state: GroupState,
  hexMap: HexMapCell[],
  regionId: string,
): string | undefined {
  const atual = hexAtual(state)
  const hexes = state.hexes
  const start = atual ? hexes.findIndex((h) => h.id === atual.id) : hexes.length - 1
  for (let i = start; i >= 0; i--) {
    const h = hexes[i]
    const id = cellAt(hexMap, h.col, h.row)?.localId ?? h.localId
    if (id) return id
  }
  return regionId || undefined
}

// ─────────────────────────── #70 Barra DIREITA ──────────────────────────────

/** Info real do local (Tipo/Descrição/Recursos) — mesma fonte de verdade da
 *  ficha de Localização (frontmatter), nunca inventada. Opcionalmente com a
 *  IMAGEM da região que ao clicar abre a página da localização (#71). */
function LocalInfo({ localId, withImage }: { localId: string; withImage?: boolean }) {
  const { doc } = useDoc(localId)
  const assets = useAssetIndex()
  if (!doc) return null
  const imgTarget = doc.images.find((i) => i.from === 'body')?.target ?? doc.images[0]?.target
  const imgEntry = imgTarget && assets ? resolveAsset(assets, imgTarget) : null
  const tipo = typeof doc.subtype === 'string' && doc.subtype.trim() ? doc.subtype : ''
  const descricao =
    typeof doc.frontmatter['Descrição'] === 'string' ? (doc.frontmatter['Descrição'] as string) : ''
  const recursos = Array.isArray(doc.frontmatter['Recursos'])
    ? (doc.frontmatter['Recursos'] as unknown[]).filter(
        (r): r is string => typeof r === 'string' && r.trim() !== '',
      )
    : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {withImage && imgEntry ? (
        // #71: a imagem da região abre a página da localização em detalhe.
        <Link to={docPath(localId)} data-local-img="" style={{ display: 'block' }}>
          <img
            src={assetUrl(imgEntry)}
            alt={doc.basename}
            loading="lazy"
            style={{
              width: '100%',
              maxHeight: 200,
              objectFit: 'cover',
              display: 'block',
              clipPath: clip(10),
              border: '1px solid var(--line2)',
              cursor: 'pointer',
            }}
          />
        </Link>
      ) : null}
      {tipo ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={fieldLabelStyle}>TIPO</span>
          <span style={{ fontSize: 13 }}>{tipo}</span>
        </div>
      ) : null}
      {descricao ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={fieldLabelStyle}>DESCRIÇÃO</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, textWrap: 'pretty' }}>
            <InlineFieldValue value={descricao} />
          </span>
        </div>
      ) : null}
      {recursos.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabelStyle}>RECURSOS</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recursos.map((r, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(5),
                }}
              >
                <InlineFieldValue value={r} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Painel colapsável direito: info do local do hex selecionado (#70). */
function RightBar({
  localId,
  collapsed,
  onToggle,
  onClose,
  withImage,
}: {
  localId: string
  collapsed: boolean
  onToggle: () => void
  onClose: () => void
  withImage?: boolean
}) {
  const catalog = useCatalog()
  const nome = catalog.entryById.get(localId)?.basename ?? '—'
  return (
    <aside
      data-info-bar=""
      data-collapsed={collapsed ? '' : undefined}
      style={{
        flex: 'none',
        width: collapsed ? 40 : 300,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width .12s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '10px 6px' : '10px 12px',
          borderBottom: collapsed ? 'none' : '1px solid var(--line)',
        }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir info' : 'Recolher info'}
          style={{
            flex: 'none',
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 22,
            height: 22,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(4),
          }}
        >
          {collapsed ? '‹' : '›'}
        </button>
        {collapsed ? null : (
          <>
            <span style={{ ...sectionTitleStyle, flex: 1 }}>{'// LOCAL'}</span>
            <button
              onClick={onClose}
              aria-label="Fechar info"
              style={{
                flex: 'none',
                background: 'none',
                border: '1px solid var(--line2)',
                color: 'var(--muted)',
                width: 22,
                height: 22,
                lineHeight: 1,
                cursor: 'pointer',
                clipPath: clip(4),
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
      {collapsed ? null : (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{nome}</span>
            <span style={{ flex: 1 }} />
            <Link
              to={docPath(localId)}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '.16em',
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              ABRIR DOC
            </Link>
          </div>
          <LocalInfo localId={localId} withImage={withImage} />
        </div>
      )}
    </aside>
  )
}

// ─────────────────────────── #69 Barra ESQUERDA ─────────────────────────────

/** Modo de marcação no mapa (#85): 'parada' (ponto importante/rotulável) ·
 *  'caminho' (rota: vários hexes seguidos) · 'off'. */
type AddMode = 'off' | 'parada' | 'caminho'

/** Um ponto é PARADA (proeminente) por PADRÃO — só é rota colapsável quando foi
 *  criado explicitamente como `kind: 'caminho'`. Assim, hexes LEGADOS (sem
 *  `kind`, de antes do sistema parada/caminho) permanecem visíveis um a um: cada
 *  hex marcado à mão é um ponto do histórico do grupo. Fonte única p/ mapa e lista. */
function hexIsParada(h: GroupHex): boolean {
  return h.kind !== 'caminho'
}

/** Uma parada é PRINCIPAL quando o hex referencia um LUGAR nomeado (no mapa da
 *  região ou no próprio hex); senão é só um HEX (parada intermediária). */
function paradaLocalId(h: GroupHex, hexMap: HexMapCell[]): string | undefined {
  return cellAt(hexMap, h.col, h.row)?.localId ?? h.localId
}

interface PathSeg {
  principal: GroupHex | null
  principalIdx: number
  children: { h: GroupHex; idx: number }[]
}

/** Agrupa o caminho: cada PRINCIPAL abre um segmento; os HEX-only seguintes
 *  ficam como filhos (indentados sob o último principal por onde passou). Uma
 *  corrida de HEX-only antes do 1º principal vira um segmento sem cabeçalho. */
function buildSegments(hexes: GroupHex[], isPrincipal: (h: GroupHex) => boolean): PathSeg[] {
  const segs: PathSeg[] = []
  hexes.forEach((h, idx) => {
    if (isPrincipal(h)) {
      segs.push({ principal: h, principalIdx: idx, children: [] })
    } else {
      if (segs.length === 0) segs.push({ principal: null, principalIdx: -1, children: [] })
      segs[segs.length - 1].children.push({ h, idx })
    }
  })
  return segs
}

/** Painel colapsável esquerdo: caminho HIERÁRQUICO (#82) — principais
 *  proeminentes, HEX-only colapsados sob eles (3 pontinhos → expande no clique),
 *  reorder por ponteiro (toque) e inserir-entre-partes. */
function LeftBar({
  groupId,
  state,
  hexMap,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  insertAt,
  onInsertAt,
  addMode,
  onSetMode,
}: {
  groupId: string
  state: GroupState
  hexMap: HexMapCell[]
  collapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  insertAt: number | null
  onInsertAt: (index: number) => void
  addMode: AddMode
  onSetMode: (m: AddMode) => void
}) {
  const catalog = useCatalog()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const dragIdRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const atual = hexAtual(state)
  // Docs dos locais das paradas pro tooltip de descrição/recursos (#124).
  const localIds = useMemo(
    () => [...new Set(state.hexes.map((h) => paradaLocalId(h, hexMap)).filter((x): x is string => !!x))],
    [state.hexes, hexMap],
  )
  const localDocs = useDocs(localIds)

  const isPrincipal = (h: GroupHex): boolean => hexIsParada(h)
  const segs = buildSegments(state.hexes, isPrincipal)

  /** Emoji da marca (subcategoria do local mapeado); '⠿' (grip) se não houver. */
  const paradaEmoji = (h: GroupHex): string => {
    const localId = paradaLocalId(h, hexMap)
    const emoji = localId ? subcategoriaEmoji(catalog.entryById.get(localId)?.subtype) : ''
    return emoji || '⠿'
  }

  // Reordenação por PONTEIRO (funciona no TOQUE): arrasta pelo handle; o alvo é
  // o ÍNDICE (data-order) do primeiro item visível cujo meio o dedo cruzou.
  const dropIndexAt = (clientY: number): number => {
    const items = listRef.current ? [...listRef.current.querySelectorAll('[data-parada]')] : []
    for (const el of items) {
      const r = el.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return Number((el as HTMLElement).getAttribute('data-order'))
    }
    return state.hexes.length
  }
  const onHandleDown = (h: GroupHex) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragIdRef.current = h.id
    setDragId(h.id)
    setDropIndex(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragIdRef.current) return
    setDropIndex(dropIndexAt(e.clientY))
  }
  const onHandleUp = (e: React.PointerEvent) => {
    const id = dragIdRef.current
    if (!id) return
    const target = dropIndex ?? dropIndexAt(e.clientY)
    const from = state.hexes.findIndex((x) => x.id === id)
    if (from !== -1) moveGroupHex(groupId, id, target > from ? target - 1 : target)
    dragIdRef.current = null
    setDragId(null)
    setDropIndex(null)
  }

  /** Uma linha de parada (principal proeminente OU filho hex-only pequeno). */
  const paradaRow = (h: GroupHex, idx: number, variant: 'principal' | 'child') => {
    const sel = h.id === selectedId
    const isAtual = h.id === atual?.id
    const dragging = dragId === h.id
    const child = variant === 'child'
    return (
      <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 0, marginLeft: child ? 22 : 0 }}>
        <div
          style={{
            height: dragId && dropIndex === idx ? 3 : 0,
            margin: dragId && dropIndex === idx ? '2px 0' : 0,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'height .08s',
          }}
        />
        <div
          data-parada={h.id}
          data-order={idx}
          {...(sel ? { 'data-sel': '' } : {})}
          onClick={() => onSelect(h.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: child ? '2px 8px' : '4px 9px',
            cursor: 'pointer',
            opacity: dragging ? 0.5 : 1,
            background: sel
              ? 'color-mix(in srgb,var(--accent) 14%,var(--card))'
              : child
                ? 'transparent'
                : 'var(--card)',
            border: `1px solid ${sel ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : child ? 'transparent' : 'var(--line2)'}`,
            clipPath: child ? undefined : clip(6),
          }}
        >
          <span
            data-drag-handle={h.id}
            role="button"
            aria-label={`Reordenar ${hexLabel(h, hexMap, catalog)} (parada ${idx + 1})`}
            title={`Arraste pra reordenar (parada ${idx + 1})`}
            onPointerDown={onHandleDown(h)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 'none',
              width: child ? 18 : 22,
              height: child ? 18 : 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: child ? 11 : 14,
              color: child ? 'var(--muted)' : undefined,
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
              borderRadius: 4,
              background: isAtual ? 'color-mix(in srgb,var(--accent) 22%,transparent)' : 'transparent',
              border: isAtual ? '1px solid color-mix(in srgb,var(--accent) 45%,transparent)' : '1px solid transparent',
            }}
          >
            {paradaEmoji(h)}
          </span>
          <TipHover
            html={localTipHtml(paradaLocalId(h, hexMap) ? localDocs?.get(paradaLocalId(h, hexMap)!) : undefined)}
            style={{ flex: 1, minWidth: 0 }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: child ? 11 : 12.5,
                fontWeight: child ? 400 : 600,
                color: child ? 'var(--muted)' : 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {hexLabel(h, hexMap, catalog)}
            </span>
          </TipHover>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeGroupHex(groupId, h.id)
            }}
            aria-label="Remover parada"
            style={{
              flex: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: child ? 12 : 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  /** Botão fininho de INSERIR parada na posição `index` (#82). Ativo mostra a
   *  dica; some durante um arraste. Só aparece DENTRO de um caminho expandido
   *  (`indent`), pra inserir uma parada num ponto específico da rota. */
  const insertRow = (index: number, indent = false) => (
    <button
      key={`ins-${index}`}
      data-insert-at={index}
      aria-label={`Inserir parada na posição ${index + 1}`}
      onClick={() => onInsertAt(index)}
      style={{
        alignSelf: 'stretch',
        marginLeft: indent ? 22 : 0,
        display: dragId ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: insertAt === index ? 20 : 10,
        padding: 0,
        cursor: 'pointer',
        background: insertAt === index ? 'color-mix(in srgb,var(--accent) 16%,transparent)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        color: insertAt === index ? 'var(--accent)' : 'color-mix(in srgb,var(--muted) 70%,transparent)',
        fontFamily: 'var(--mono)',
        fontSize: insertAt === index ? 10 : 12,
        letterSpacing: '.06em',
      }}
    >
      {insertAt === index ? '+ TOQUE UM HEX' : '+'}
    </button>
  )

  /** Corrida de HEX-only COLAPSADA: 3 pontinhos verticais + contagem; clique
   *  EXPANDE pra mostrar o caminho completo (e só então os "+" de inserir). */
  const collapsedRow = (key: string, children: { h: GroupHex; idx: number }[]) => (
    <button
      key={`col-${key}`}
      data-collapsed-run={key}
      title={`${children.length} hex(es) de caminho — clique pra abrir a rota`}
      onClick={() => setExpanded((s) => new Set(s).add(key))}
      style={{
        marginLeft: 22,
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 9px',
        cursor: 'pointer',
        background: 'transparent',
        border: '1px dashed var(--line2)',
        borderRadius: 6,
        color: 'var(--muted)',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: Math.min(3, children.length) }, (_, k) => (
          <span
            key={k}
            style={{ width: 4, height: 4, borderRadius: '50%', background: 'color-mix(in srgb,var(--accent) 65%,transparent)' }}
          />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em' }}>{children.length} HEX</span>
    </button>
  )

  /** Cabeçalho da rota EXPANDIDA: botão pra RECOLHER de volta (#: pedido do
   *  usuário — expandir tem que ter como fechar). */
  const runCollapseBtn = (key: string, count: number) => (
    <button
      key={`recolher-${key}`}
      data-collapse-run={key}
      title="Recolher a rota"
      onClick={() => setExpanded((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })}
      style={{
        marginLeft: 22,
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 9px',
        cursor: 'pointer',
        background: 'color-mix(in srgb,var(--accent) 10%,transparent)',
        border: '1px solid color-mix(in srgb,var(--accent) 30%,transparent)',
        borderRadius: 6,
        color: 'var(--accent)',
      }}
    >
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>▴</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em' }}>{count} HEX · RECOLHER</span>
    </button>
  )

  return (
    <aside
      data-caminho-bar=""
      data-collapsed={collapsed ? '' : undefined}
      style={{
        flex: 'none',
        width: collapsed ? 40 : 240,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width .12s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '10px 6px' : '10px 12px',
          borderBottom: collapsed ? 'none' : '1px solid var(--line)',
        }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir caminho' : 'Recolher caminho'}
          style={{
            flex: 'none',
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 22,
            height: 22,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(4),
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
        {collapsed ? null : <span style={{ ...sectionTitleStyle, flex: 1 }}>{'// CAMINHO'}</span>}
      </div>
      {collapsed ? null : (
        <div
          ref={listRef}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: 12, overflowY: 'auto' }}
        >
          {state.hexes.length === 0 ? (
            <span style={{ ...fieldLabelStyle, padding: '4px 0' }}>SEM PARADAS</span>
          ) : (
            <>
              {segs.map((seg) => {
                const key = seg.principal?.id ?? 'lead'
                const isExp = expanded.has(key)
                const kids = seg.children
                return (
                  <div key={key} style={{ display: 'contents' }}>
                    {seg.principal ? paradaRow(seg.principal, seg.principalIdx, 'principal') : null}
                    {kids.length
                      ? isExp
                        ? (
                            // Rota ABERTA: botão de recolher + os hexes, com o "+"
                            // de inserir parada SÓ aqui, entre os pontos da rota.
                            <>
                              {runCollapseBtn(key, kids.length)}
                              {kids.map((c) => (
                                <div key={c.h.id} style={{ display: 'contents' }}>
                                  {insertRow(c.idx, true)}
                                  {paradaRow(c.h, c.idx, 'child')}
                                </div>
                              ))}
                              {insertRow(kids[kids.length - 1].idx + 1, true)}
                            </>
                          )
                        : collapsedRow(key, kids)
                      : null}
                  </div>
                )
              })}
              <div
                style={{
                  height: dragId && dropIndex === state.hexes.length ? 3 : 0,
                  margin: dragId && dropIndex === state.hexes.length ? '2px 0' : 0,
                  background: 'var(--accent)',
                  borderRadius: 2,
                }}
              />
            </>
          )}
        </div>
      )}
      {/* RODAPÉ: os botões de marcação vivem AQUI (dentro da barra) pra ficarem
          acessíveis também em TELA CHEIA, onde o cabeçalho some (#82/#85). */}
      {collapsed ? null : (
        <div
          style={{
            flex: 'none',
            padding: 10,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button
            data-marcar-hex=""
            data-add-parada=""
            aria-pressed={addMode === 'parada'}
            onClick={() => onSetMode('parada')}
            style={{
              ...pillStyle(addMode === 'parada'),
              width: '100%',
              justifyContent: 'center',
              padding: '8px 12px',
              fontSize: 11,
            }}
          >
            {addMode === 'parada' ? '✓ PARADA — TOQUE UM HEX' : '+ Adicionar Parada'}
          </button>
          <button
            data-add-caminho=""
            aria-pressed={addMode === 'caminho'}
            onClick={() => onSetMode('caminho')}
            style={{
              ...pillStyle(addMode === 'caminho'),
              width: '100%',
              justifyContent: 'center',
              padding: '8px 12px',
              fontSize: 11,
            }}
          >
            {addMode === 'caminho' ? '✓ CAMINHO — TOQUE OS HEXES' : '+ Adicionar Caminho'}
          </button>
          {addMode !== 'off' ? (
            <span style={{ ...fieldLabelStyle, fontSize: 9, textAlign: 'center' }}>
              {addMode === 'parada'
                ? 'toque um hex e rotule a parada no popover · × remove'
                : 'toque os hexes da rota em sequência (pode repetir) · × remove'}
            </span>
          ) : null}
        </div>
      )}
    </aside>
  )
}

/** Preenchimento do hex por estado (#85): ATUAL forte, PARADA média, ponto de
 *  CAMINHO discreto — pra distinguir na trilha o que é parada do que é rota. */
function hexFill(isAtual: boolean, isParada = false): string {
  if (isAtual) return 'color-mix(in srgb,var(--accent) 46%,transparent)'
  if (isParada) return 'color-mix(in srgb,var(--accent) 32%,transparent)'
  return 'color-mix(in srgb,var(--accent) 20%,transparent)'
}

export function PanelExploracao({ groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeGroup(groupId, cb), [groupId]),
    () => getGroupState(groupId),
  )
  const regionId = activeRegionId(state)
  const hexMapState = useHexMap(regionId)
  const hexMap = hexMapState.cells
  // #89: havendo sidebar de detalhes, a info do local abre NELA (não no bloco
  // lateral do mapa); sem ela (testes) cai no RightBar #70.
  const detail = useDetail()

  // Ao ENTRAR na Exploração, a sidebar de DETALHES mostra por PADRÃO onde o grupo
  // está AGORA (a localização atual). Roda uma vez por montagem; depois o usuário
  // navega livre (clicar em outro hex, ou voltar pra Sessão).
  const didDefaultDetail = useRef(false)
  useEffect(() => {
    if (didDefaultDetail.current || !detail) return
    const id = currentLocalId(state, hexMap, regionId)
    if (id) {
      detail.open({ kind: 'doc', id })
      didDefaultDetail.current = true
    }
  }, [detail, state, hexMap, regionId])

  /** PARADA (proeminente + rótulo na trilha) = criada como parada OU tem lugar
   *  nomeado OU rótulo; senão é ponto de CAMINHO (rota, discreto) — #85. */
  const isParada = (h: GroupHex): boolean => hexIsParada(h)

  // #85: dois modos de marcação — 'parada' (ponto importante, rotulável) e
  // 'caminho' (rota: toca vários hexes seguidos, mesmo sem ponto de interesse).
  const [addMode, setAddMode] = useState<AddMode>('off')
  /** Posição do caminho onde a próxima parada marcada será INSERIDA (#82); null
   *  = anexa no fim. */
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Hex clicado que tem localização mapeada → barra direita (#70). */
  const [infoLocalId, setInfoLocalId] = useState<string | null>(null)
  /** Barra direita mostra a IMAGEM da região (só via clique no token, #71). */
  const [infoWithImage, setInfoWithImage] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [hoverHex, setHoverHex] = useState<HexCell | null>(null)
  // Tooltip do LOCAL no MAPA (#141): o <svg> tem pointer-events:none, então o
  // hover é rastreado no div-pai; mostramos o mesmo card da parada num overlay
  // portado pro body (fixed, no mouse).
  const [mapTip, setMapTip] = useState<{ html: string; x: number; y: number } | null>(null)
  /** Token sendo arrastado: célula atual sob o cursor (mostra "Adicionar parada"). */
  const [tokenDropCell, setTokenDropCell] = useState<HexCell | null>(null)
  const tokenDragRef = useRef(false)
  const pressedRef = useRef(false)

  // Pan / PINÇA / roda / TELA CHEIA compartilhados (#80).
  const map = useMapView()

  const atual = hexAtual(state)
  const selecionado = selectedId ? (state.hexes.find((h) => h.id === selectedId) ?? null) : null

  // A malha inteira é 1 <path> constante (barato; não depende do estado).
  const gridPath = useMemo(() => hexGridPath(), [])

  // Docs dos locais pro TOOLTIP no mapa (#124) — nativo (<title>) já que os
  // hexes são SVG. Descrição (campo) + recursos, fonte de verdade no frontmatter.
  const mapLocalIds = useMemo(
    () => [...new Set(state.hexes.map((h) => paradaLocalId(h, hexMap)).filter((x): x is string => !!x))],
    [state.hexes, hexMap],
  )
  const mapLocalDocs = useDocs(mapLocalIds)
  const localTitleText = (h: GroupHex): string => {
    const lid = paradaLocalId(h, hexMap)
    if (!lid) return ''
    const doc = mapLocalDocs?.get(lid)
    if (!doc) return catalog.entryById.get(lid)?.basename ?? ''
    const parts = [doc.basename]
    const desc =
      typeof doc.frontmatter['Descrição'] === 'string' ? wikiStrip(doc.frontmatter['Descrição'] as string) : ''
    if (desc) parts.push(desc)
    const rec = Array.isArray(doc.frontmatter['Recursos'])
      ? (doc.frontmatter['Recursos'] as unknown[])
          .filter((r): r is string => typeof r === 'string' && !!r.trim())
          .map(wikiStrip)
      : []
    if (rec.length) parts.push('Recursos: ' + rec.join(', '))
    return parts.join('\n')
  }

  const mapAsset = regionMapById(regionId)?.mapAsset ?? MAPA_MUNDO_LIVRE
  const mapEntry = assets?.byPath.get(mapAsset) ?? null

  /** Célula da grade sob o cursor (ou null fora da imagem). */
  const hexAtClient = (clientX: number, clientY: number): HexCell | null => {
    const f = map.fracAtClient(clientX, clientY)
    return f ? fracToHex(f.fx, f.fy) : null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pressedRef.current = true
    if (hoverHex) setHoverHex(null)
    setMapTip(null)
    map.onPointerDown(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    // Arrasto do token (#71): não faz pan/pinça, marca a célula-alvo.
    if (tokenDragRef.current) {
      const cell = hexAtClient(e.clientX, e.clientY)
      setTokenDropCell((prev) =>
        (prev && cell && prev.col === cell.col && prev.row === cell.row) || (!prev && !cell)
          ? prev
          : cell,
      )
      return
    }
    map.onPointerMove(e)
    // Hover só quando NÃO está pressionado (mouse pairando no desktop).
    if (!pressedRef.current) {
      const h = hexAtClient(e.clientX, e.clientY)
      setHoverHex((prev) =>
        (prev && h && prev.col === h.col && prev.row === h.row) || (!prev && !h) ? prev : h,
      )
      // Tooltip do lugar sob o cursor (mesmo card da parada), no mouse.
      const lid = h ? (cellAt(hexMap, h.col, h.row)?.localId ?? undefined) : undefined
      const html = lid ? localTipHtml(mapLocalDocs?.get(lid)) : null
      setMapTip(html ? { html, x: e.clientX, y: e.clientY } : null)
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pressedRef.current = false
    map.onPointerUp(e)
  }
  const onPointerLeave = () => {
    if (hoverHex) setHoverHex(null)
    setMapTip(null)
  }

  /** Info do local do hex mapeado: na sidebar DIREITA global (#89) quando há
   *  DetailContext; senão cai na barra lateral do mapa (#70, fallback). */
  const openInfoForCell = (col: number, row: number, withImage: boolean): boolean => {
    const cell = cellAt(hexMap, col, row)
    if (!cell?.localId) return false
    if (detail) {
      // Abre DIRETO o doc completo do local (nome + imagem + abas), sem o passo
      // intermediário do LocalDetail. A sidebar esconde a aba Hexploração.
      detail.open({ kind: 'doc', id: cell.localId })
    } else {
      setInfoLocalId(cell.localId)
      setInfoWithImage(withImage)
      setRightCollapsed(false)
    }
    return true
  }

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (map.consumeMoved()) return
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) {
      if (addMode === 'off') setSelectedId(null)
      return
    }
    const existente = hexAt(state.hexes, cell.col, cell.row)
    if (addMode !== 'off') {
      // #82/#85: SEMPRE adiciona (revisitar é permitido — allowDup). Remover é
      // pelo × na lista. Com posição de inserção escolhida, insere lá. O `kind`
      // vem do MODO (parada = marco; caminho = rota).
      const nova = { col: cell.col, row: cell.row, data: todayISO(), kind: addMode }
      const criado =
        insertAt !== null
          ? insertGroupHex(groupId, nova, insertAt, true)
          : addGroupHex(groupId, nova, true)
      setInsertAt(null)
      // 'parada': seleciona pra abrir o popover e ROTULAR; 'caminho': segue
      // tocando os hexes da rota sem abrir nada.
      setSelectedId(addMode === 'parada' ? criado.id : null)
    } else {
      // fora do modo marcar: parada abre o popover; qualquer hex com
      // localização mapeada abre a barra direita (#70).
      setSelectedId(existente ? existente.id : null)
      if (!openInfoForCell(cell.col, cell.row, false) && !existente) setInfoLocalId(null)
    }
  }

  // ── Token / moeda (#71) — arrastar e soltar ────────────────────────────────
  const onTokenPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    tokenDragRef.current = true
    setTokenDropCell(atual ? { col: atual.col, row: atual.row } : null)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onTokenPointerUp = (e: React.PointerEvent) => {
    if (!tokenDragRef.current) return
    e.stopPropagation()
    tokenDragRef.current = false
    // Mantém tokenDropCell (o botão "Adicionar parada" aparece até confirmar
    // ou clicar fora). Só limpa se soltou fora da imagem.
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) setTokenDropCell(null)
    else setTokenDropCell(cell)
  }
  const onTokenClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Clique (sem arraste real) na moeda: abre a info do local ATUAL + imagem.
    if (atual && cellAt(hexMap, atual.col, atual.row)) {
      openInfoForCell(atual.col, atual.row, true)
      setSelectedId(atual.id)
    }
  }
  const confirmarParada = () => {
    if (!tokenDropCell) return
    const nova = { col: tokenDropCell.col, row: tokenDropCell.row, data: todayISO(), kind: 'parada' as const }
    // allowDup: revisitar o mesmo lugar é permitido (#82).
    const criado =
      insertAt !== null
        ? insertGroupHex(groupId, nova, insertAt, true)
        : addGroupHex(groupId, nova, true)
    setInsertAt(null)
    setAtualHex(groupId, criado.id)
    setSelectedId(criado.id)
    setTokenDropCell(null)
  }

  // hover realça QUALQUER hex (todos podem virar parada, inclusive revisita #82).
  const hoverLivre = hoverHex
  const tokenCell = tokenDropCell ?? (atual ? { col: atual.col, row: atual.row } : null)
  const tokenCenter = tokenCell ? hexCenter(tokenCell.col, tokenCell.row) : null
  // "Adicionar parada" aparece quando o token foi arrastado pra uma célula
  // DIFERENTE do hex atual (#82: pode ser um lugar já visitado = revisita).
  const podeAdicionar =
    !!tokenDropCell &&
    (!atual || tokenDropCell.col !== atual.col || tokenDropCell.row !== atual.row)

  return (
    <TipProvider>
      <style>{LOC_TIP_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={sectionTitleStyle}>{'// EXPLORAÇÃO'}</div>
        {/* #68: seletor de REGIÃO (dentre as com mapa). */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={fieldLabelStyle}>REGIÃO</span>
          <select
            aria-label="Região do grupo"
            value={regionId}
            onChange={(e) => setRegiaoAtiva(groupId, e.target.value)}
            style={inputStyle}
          >
            {REGION_MAPS.map((m) => (
              <option key={m.regionId} value={m.regionId}>
                {catalog.entryById.get(m.regionId)?.basename ?? m.regionId}
              </option>
            ))}
          </select>
        </label>
        {/* O botão de adicionar parada vive no RODAPÉ da barra de CAMINHO
            (visível em tela cheia) — não mais aqui no cabeçalho (#82). */}
      </div>

      {/* Layout: barra esquerda (caminho) · mapa · barra direita (info).
          Em tela cheia (#80) a LINHA inteira vira overlay — as barras vão
          junto (a de caminhos fica acessível na tela cheia). */}
      <div
        ref={map.containerRef}
        style={fullscreenContainerStyle(
          // Em tela normal a LINHA tem a MESMA altura do mapa (min(68vh,620px)):
          // assim a barra de caminho não estica além do mapa — a lista rola por
          // dentro e o rodapé (Adicionar parada/caminho) fica fixo embaixo. Em
          // tela cheia, fullscreenContainerStyle sobrescreve com 100dvh.
          { display: 'flex', gap: 10, alignItems: 'stretch', height: 'min(68vh, 620px)' },
          map.fullscreen,
        )}
      >
        <LeftBar
          groupId={groupId}
          state={state}
          hexMap={hexMap}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((c) => !c)}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            const h = state.hexes.find((x) => x.id === id)
            if (h) openInfoForCell(h.col, h.row, false)
          }}
          insertAt={insertAt}
          onInsertAt={(i) => {
            // escolhe a posição e liga o modo PARADA: o próximo hex tocado no
            // mapa entra AÍ (#82).
            setInsertAt((cur) => (cur === i ? null : i))
            setAddMode('parada')
          }}
          addMode={addMode}
          onSetMode={(m) =>
            setAddMode((cur) => {
              const next = cur === m ? 'off' : m // toca de novo no mesmo botão desliga
              if (next === 'off') setInsertAt(null)
              return next
            })
          }
        />

        {/* Painel do mapa (canto cortado do design) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: map.fullscreen ? 'none' : clip(14),
            overflow: 'hidden',
          }}
        >
          {mapEntry ? (
            <div
              ref={map.viewportRef}
              data-mapa-viewport=""
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
              onClick={onMapClick}
              style={{
                height: map.fullscreen ? '100%' : 'min(68vh, 620px)',
                display: 'flex',
                justifyContent: 'center',
                overflow: 'hidden',
                touchAction: 'none',
                cursor: addMode !== 'off' ? 'crosshair' : map.dragging ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
            >
              <div
                ref={map.mapRef}
                data-mapa=""
                style={{
                  position: 'relative',
                  height: '100%',
                  flex: 'none',
                  transform: map.transform,
                  transformOrigin: '0 0',
                }}
              >
                <img
                  src={assetUrl(mapEntry)}
                  alt={mapEntry.basename}
                  draggable={false}
                  style={{ height: '100%', width: 'auto', display: 'block' }}
                />
                {/* Overlay em px da FONTE (escala junto com o transform do mapa) */}
                <svg
                  viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  <path
                    data-hexgrid=""
                    d={gridPath}
                    fill="none"
                    stroke={
                      addMode !== 'off'
                        ? 'color-mix(in srgb,var(--accent) 34%,transparent)'
                        : 'color-mix(in srgb,var(--accent) 15%,transparent)'
                    }
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Hexes COM localização configurada na região (#70): realce
                      sutil pra sinalizar que têm info clicável. */}
                  {hexMap.map((c) => (
                    <polygon
                      key={`loc-${c.col},${c.row}`}
                      data-hex-local={`${c.col},${c.row}`}
                      points={hexPolygonPoints(c.col, c.row)}
                      fill="color-mix(in srgb,var(--accent) 8%,transparent)"
                      stroke="color-mix(in srgb,var(--accent) 30%,transparent)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {hoverLivre ? (
                    <polygon
                      data-hex-hover=""
                      points={hexPolygonPoints(hoverHex!.col, hoverHex!.row)}
                      fill="color-mix(in srgb,var(--accent) 12%,transparent)"
                      stroke="color-mix(in srgb,var(--accent) 55%,transparent)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* Trilha ligando os centros das paradas na ORDEM do caminho (#69) */}
                  {state.hexes.length >= 2 ? (
                    <polyline
                      data-trilha=""
                      points={state.hexes
                        .map((h) => {
                          const c = hexCenter(h.col, h.row)
                          return `${c.x},${c.y}`
                        })
                        .join(' ')}
                      fill="none"
                      stroke="var(--accent)"
                      strokeOpacity={0.55}
                      strokeWidth={1.6}
                      strokeDasharray="6 5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* PARADA = marcador hex forte; CAMINHO = bolinha discreta na
                      rota; ATUAL em AZUL com glow. SEM rótulo no mapa — o nome
                      já está escrito na própria arte do mapa (#85). */}
                  {state.hexes.map((h) => {
                    const isAtual = h.id === atual?.id
                    const isSel = h.id === selectedId
                    const parada = isParada(h)
                    const center = hexCenter(h.col, h.row)
                    const glow = isAtual
                      ? { filter: `drop-shadow(0 0 8px color-mix(in srgb,${ATUAL_BLUE} 80%,transparent))` }
                      : undefined
                    // ponto de CAMINHO (rota): bolinha pequena
                    const titleText = localTitleText(h)
                    if (!parada) {
                      return (
                        <circle
                          key={h.id}
                          data-hex={h.id}
                          data-col={h.col}
                          data-row={h.row}
                          {...(isAtual ? { 'data-atual': '' } : {})}
                          {...(isSel ? { 'data-sel': '' } : {})}
                          cx={center.x}
                          cy={center.y}
                          r={isAtual ? 16 : 10}
                          fill={isAtual ? ATUAL_BLUE : 'color-mix(in srgb,var(--accent) 45%,transparent)'}
                          stroke={isAtual ? ATUAL_BLUE : isSel ? 'var(--text)' : 'var(--accent)'}
                          strokeWidth={isAtual || isSel ? 2.5 : 1.5}
                          vectorEffect="non-scaling-stroke"
                          style={glow}
                        >
                          {titleText ? <title>{titleText}</title> : null}
                        </circle>
                      )
                    }
                    // PARADA: hex marcador proeminente (sem rótulo)
                    return (
                      <polygon
                        key={h.id}
                        data-hex={h.id}
                        data-col={h.col}
                        data-row={h.row}
                        {...(isAtual ? { 'data-atual': '' } : {})}
                        {...(isSel ? { 'data-sel': '' } : {})}
                        data-parada-mapa=""
                        points={hexPolygonPoints(h.col, h.row)}
                        fill={isAtual ? `color-mix(in srgb,${ATUAL_BLUE} 55%,transparent)` : hexFill(false, true)}
                        stroke={isAtual ? ATUAL_BLUE : isSel ? 'var(--text)' : 'var(--accent)'}
                        strokeWidth={isAtual || isSel ? 2.5 : 2}
                        vectorEffect="non-scaling-stroke"
                        style={glow}
                      >
                        {titleText ? <title>{titleText}</title> : null}
                      </polygon>
                    )
                  })}
                  {/* Célula-alvo do token durante o arraste (#71) */}
                  {tokenDropCell ? (
                    <polygon
                      data-token-alvo=""
                      points={hexPolygonPoints(tokenDropCell.col, tokenDropCell.row)}
                      fill="color-mix(in srgb,var(--accent) 22%,transparent)"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* #71 Token do grupo (moeda) no hex ATUAL/alvo do arraste */}
                  {tokenCenter ? (
                    <g
                      data-token=""
                      transform={`translate(${tokenCenter.x},${tokenCenter.y})`}
                      style={{ pointerEvents: 'auto', cursor: 'grab' }}
                      onPointerDown={onTokenPointerDown}
                      onPointerUp={onTokenPointerUp}
                      onClick={onTokenClick}
                    >
                      <circle
                        r={30}
                        fill={ATUAL_BLUE}
                        stroke="var(--panel)"
                        strokeWidth={5}
                        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={30}
                        style={{ userSelect: 'none' }}
                      >
                        ⚔️
                      </text>
                    </g>
                  ) : null}
                </svg>
              </div>
            </div>
          ) : assets ? (
            <div style={{ ...sectionTitleStyle, padding: '16px 18px' }}>MAPA INDISPONÍVEL</div>
          ) : null}

          {/* #80 Controles de tela cheia + zoom sobrepostos */}
          {mapEntry ? <MapControls map={map} /> : null}

          {/* #71 Botão "Adicionar parada" (após soltar o token numa célula nova) */}
          {podeAdicionar ? (
            <button
              data-add-parada=""
              onClick={confirmarParada}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 14,
                transform: 'translateX(-50%)',
                zIndex: 4,
                ...pillStyle(true),
                padding: '8px 16px',
                fontSize: 11,
              }}
            >
              + ADICIONAR PARADA
            </button>
          ) : null}
        </div>

        {infoLocalId ? (
          <RightBar
            key={infoLocalId}
            localId={infoLocalId}
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((c) => !c)}
            onClose={() => setInfoLocalId(null)}
            withImage={infoWithImage}
          />
        ) : null}
      </div>

      {/* Popover da parada selecionada (edição de data/local) */}
      {selecionado ? (
        <HexInfo
          key={selecionado.id}
          groupId={groupId}
          hex={selecionado}
          atual={selecionado.id === atual?.id}
          onRemove={() => {
            removeGroupHex(groupId, selecionado.id)
            setSelectedId(null)
          }}
        />
      ) : null}
      </div>
      {mapTip
        ? createPortal(
            <div
              className="dv-breakdown-tip floating"
              style={{ left: mapTip.x + 16, top: mapTip.y + 18, maxWidth: 300, position: 'fixed', zIndex: 80 }}
              dangerouslySetInnerHTML={{ __html: mapTip.html }}
            />,
            document.body,
          )
        : null}
    </TipProvider>
  )
}

/** Popover da parada selecionada: nome + data + local + link pro doc.
 *  Edição da associação de Localização (dropdown do Atlas). */
function HexInfo({
  groupId,
  hex,
  atual,
  onRemove,
}: {
  groupId: string
  hex: GroupHex
  atual: boolean
  onRemove: () => void
}) {
  const catalog = useCatalog()
  const lines = useMemo(() => locaisSelectLines(catalog), [catalog])
  const nome =
    (hex.label && hex.label.trim()) ||
    (hex.localId ? (catalog.entryById.get(hex.localId)?.basename ?? '—') : `Hex ${hex.col},${hex.row}`)
  return (
    <div
      data-hex-info=""
      style={{
        padding: '14px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{nome}</span>
        {atual ? (
          <span style={{ ...pillStyle(false), cursor: 'default', padding: '3px 9px' }}>ATUAL</span>
        ) : null}
        <span style={{ flex: 1 }} />
        {hex.localId ? (
          <Link
            to={docPath(hex.localId)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.16em',
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            ABRIR DOC
          </Link>
        ) : null}
        <button
          onClick={onRemove}
          aria-label="Remover hex"
          style={{
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 24,
            height: 24,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(5),
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* #85: rótulo livre da parada pro LOG do grupo (o que fizeram ali). */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 100%', minWidth: 220 }}>
          <span style={fieldLabelStyle}>RÓTULO (LOG DO GRUPO)</span>
          <input
            data-hex-label=""
            type="text"
            placeholder="ex.: acampamos aqui · emboscada · encontramos o mercador"
            value={hex.label ?? ''}
            onChange={(e) => updateGroupHex(groupId, hex.id, { label: e.target.value || undefined })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabelStyle}>DATA</span>
          <input
            type="date"
            value={hex.data ?? ''}
            onChange={(e) => updateGroupHex(groupId, hex.id, { data: e.target.value || undefined })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 220 }}>
          <span style={fieldLabelStyle}>LOCAL</span>
          <select
            value={hex.localId ?? ''}
            onChange={(e) => updateGroupHex(groupId, hex.id, { localId: e.target.value || undefined })}
            style={inputStyle}
          >
            {lines.map((line, i) => (
              <option key={i} value={line.value ?? ''} disabled={line.disabled}>
                {line.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
