// Aba EXPLORAÇÃO do grupo (issue #36; grade hexagonal issue #48) — tela SEM
// design dedicado; extensão sancionada na LINGUAGEM VISUAL do design puxado:
// painel de canto cortado (clip do bits.tsx), kicker mono "// EXPLORAÇÃO"
// (sectionTitleStyle) e pill accent (mesmo skin do badge GRUPO do header,
// dc.html:1114).
//
// Mapa: asset real `Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png`
// (assets/byPath + assetUrl), com pan/zoom simples via CSS transform — drag
// arrasta (pointer events), wheel dá zoom com clamp [1,8] ancorado no cursor
// (listener nativo non-passive: o onWheel do React é passivo na raiz).
//
// Grade hexagonal (issue #48): o mapa é hex-based; um overlay SVG desenha a
// malha flat-top CALIBRADA (exploracao.ts) em coordenadas de pixel da fonte
// (viewBox 0..MAP_W × 0..MAP_H) DENTRO do mesmo transform do mapa, então ela
// escala/desloca junto no zoom/pan (os traços usam non-scaling-stroke pra
// manter a espessura). Marcar um lugar destaca um HEX inteiro: VISITADO =
// preenchimento accent translúcido + borda; ATUAL (último por data) = accent
// forte + glow; hover realça a célula sob o cursor. Trilha tracejada liga os
// centros dos hexes visitados em ordem de data. O hit-test é MATEMÁTICO
// (pixelToHex) — o SVG é pointer-events:none e o clique no mapa resolve a
// célula, sem precisar de ~1.9k polígonos clicáveis.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router-dom'
import { clip } from '../components/ficha/bits'
import { InlineFieldValue } from '../components/compendium/InlineFieldValue'
import { useCatalog } from '../data/CatalogContext'
import { assetUrl, resolveAsset, useAssetIndex } from '../data/assets'
import { useDoc } from '../data/useDoc'
import { docPath } from '../paths'
import {
  addGroupHex,
  getGroupState,
  hexAt,
  hexAtual,
  ordenarHexes,
  removeGroupHex,
  subscribeGroup,
  todayISO,
  updateGroupHex,
  type GroupHex,
} from '../data/group-store'
import {
  fracToHex,
  hexCenter,
  hexGridPath,
  hexPolygonPoints,
  locaisSelectLines,
  MAP_H,
  MAP_W,
  type HexCell,
} from './exploracao'
import { sectionTitleStyle } from './panel-ui'

/** Asset real do mapa (path exato no manifest de assets). */
export const MAPA_MUNDO_LIVRE = 'Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png'

const ZOOM_MIN = 1
const ZOOM_MAX = 8

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

/** Resumo maior do hex ATUAL: imagem do doc (se houver) + FM básico. */
function LocalResumo({ localId }: { localId: string }) {
  const { doc } = useDoc(localId)
  const assets = useAssetIndex()
  if (!doc) return null
  const imgTarget = doc.images[0]?.target
  const imgEntry = imgTarget && assets ? resolveAsset(assets, imgTarget) : null
  const fm = doc.frontmatter
  const geo = typeof fm['Geolocalização'] === 'string' ? (fm['Geolocalização'] as string) : ''
  const recursos = Array.isArray(fm['Recursos'])
    ? (fm['Recursos'] as unknown[]).filter((r): r is string => typeof r === 'string')
    : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {imgEntry ? (
        <img
          src={assetUrl(imgEntry)}
          alt={doc.basename}
          loading="lazy"
          style={{
            width: '100%',
            maxHeight: 220,
            objectFit: 'cover',
            display: 'block',
            clipPath: clip(10),
            border: '1px solid var(--line2)',
          }}
        />
      ) : null}
      {geo ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={fieldLabelStyle}>GEOLOCALIZAÇÃO</span>
          <span style={{ fontSize: 13 }}>
            <InlineFieldValue value={geo} />
          </span>
        </div>
      ) : null}
      {recursos.length ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={fieldLabelStyle}>RECURSOS</span>
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
      ) : null}
    </div>
  )
}

/** Popover do hex selecionado: nome + data + local + link pro doc + resumo do
 *  ATUAL. Reusa o painel de info; a única troca da issue #48 é a fonte da
 *  posição (centro do hex, não x/y solto) — mas a info em si independe disso. */
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
  const nome = hex.localId ? (catalog.entryById.get(hex.localId)?.basename ?? '—') : '—'
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabelStyle}>DATA</span>
          <input
            type="date"
            value={hex.data}
            onChange={(e) => {
              if (e.target.value) updateGroupHex(groupId, hex.id, { data: e.target.value })
            }}
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
      {atual && hex.localId ? <LocalResumo localId={hex.localId} /> : null}
    </div>
  )
}

/** Preenchimento do hex por estado (fill translúcido do design). */
function hexFill(isAtual: boolean): string {
  return isAtual
    ? 'color-mix(in srgb,var(--accent) 46%,transparent)'
    : 'color-mix(in srgb,var(--accent) 20%,transparent)'
}

export function PanelExploracao({ groupId }: { groupId: string }) {
  const assets = useAssetIndex()
  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeGroup(groupId, cb), [groupId]),
    () => getGroupState(groupId),
  )
  const [addMode, setAddMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverHex, setHoverHex] = useState<HexCell | null>(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const movedRef = useRef(false)

  const ordenados = ordenarHexes(state.hexes)
  const atual = hexAtual(state.hexes)
  const selecionado = selectedId ? (state.hexes.find((h) => h.id === selectedId) ?? null) : null

  // A malha inteira é 1 <path> constante (barato; não depende do estado).
  const gridPath = useMemo(() => hexGridPath(), [])

  const mapEntry = assets?.byPath.get(MAPA_MUNDO_LIVRE) ?? null
  useEffect(() => {
    if (assets && !mapEntry) console.warn(`[assets] mapa não encontrado: ${MAPA_MUNDO_LIVRE}`)
  }, [assets, mapEntry])

  // Wheel zoom com clamp, ancorado no cursor — listener NATIVO non-passive
  // (React registra wheel como passivo na raiz; preventDefault lá é no-op).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
        const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor))
        if (scale === v.scale) return v
        if (scale === ZOOM_MIN) return { scale: 1, tx: 0, ty: 0 }
        const rect = mapRef.current?.getBoundingClientRect()
        if (!rect || rect.width <= 0) return { ...v, scale }
        // mantém a MESMA fração da imagem sob o cursor após o zoom
        const u = (e.clientX - rect.left) / rect.width
        const w = (e.clientY - rect.top) / rect.height
        const nextW = (rect.width / v.scale) * scale
        const nextH = (rect.height / v.scale) * scale
        const baseLeft = rect.left - v.tx
        const baseTop = rect.top - v.ty
        return {
          scale,
          tx: e.clientX - u * nextW - baseLeft,
          ty: e.clientY - w * nextH - baseTop,
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // o viewport só monta quando o asset do mapa resolve — reata o listener
  }, [mapEntry])

  /** Célula da grade sob o cursor (ou null fora da imagem) — o rect do mapa
   *  já vem pós-transform, então converter pra fração e daí pra hex casa com
   *  a grade em qualquer zoom/pan. */
  const hexAtClient = (clientX: number, clientY: number): HexCell | null => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return fracToHex(fx, fy)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    movedRef.current = false
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current
    if (start) {
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
      if (movedRef.current) {
        setView((v) => ({ ...v, tx: start.tx + dx, ty: start.ty + dy }))
        if (hoverHex) setHoverHex(null)
        return
      }
    }
    // hover: realça a célula sob o cursor (só re-renderiza ao trocar de hex)
    const h = hexAtClient(e.clientX, e.clientY)
    setHoverHex((prev) =>
      (prev && h && prev.col === h.col && prev.row === h.row) || (!prev && !h) ? prev : h,
    )
  }
  const onPointerUp = () => {
    dragRef.current = null
    setDragging(false)
  }
  const onPointerLeave = () => {
    if (hoverHex) setHoverHex(null)
  }

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) {
      // arrasto de pan — não é clique
      movedRef.current = false
      return
    }
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) {
      if (!addMode) setSelectedId(null)
      return
    }
    const existente = hexAt(state.hexes, cell.col, cell.row)
    if (addMode) {
      if (existente) {
        // toggle: clicar de novo num hex marcado o remove
        removeGroupHex(groupId, existente.id)
        if (selectedId === existente.id) setSelectedId(null)
      } else {
        const criado = addGroupHex(groupId, { col: cell.col, row: cell.row, data: todayISO() })
        setSelectedId(criado.id)
      }
    } else {
      // fora do modo marcar: hex marcado abre o popover; vazio deseleciona
      setSelectedId(existente ? existente.id : null)
    }
  }

  const hoverLivre = hoverHex && !hexAt(state.hexes, hoverHex.col, hoverHex.row)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={sectionTitleStyle}>{'// EXPLORAÇÃO'}</div>
        <span style={{ flex: 1 }} />
        <button aria-pressed={addMode} onClick={() => setAddMode((a) => !a)} style={pillStyle(addMode)}>
          MARCAR HEX
        </button>
      </div>

      {/* Painel do mapa (canto cortado do design) */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
          overflow: 'hidden',
        }}
      >
        {mapEntry ? (
          <div
            ref={viewportRef}
            data-mapa-viewport=""
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            // o clique fica no VIEWPORT (não no [data-mapa]): setPointerCapture
            // redireciona o alvo do click pro elemento que capturou o ponteiro,
            // então um handler no filho não recebe o clique. O hit-test usa o
            // rect do [data-mapa] (mapRef), independente do alvo do evento.
            onClick={onMapClick}
            style={{
              height: 'min(68vh, 620px)',
              display: 'flex',
              justifyContent: 'center',
              overflow: 'hidden',
              touchAction: 'none',
              cursor: addMode ? 'crosshair' : dragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            <div
              ref={mapRef}
              data-mapa=""
              style={{
                position: 'relative',
                height: '100%',
                flex: 'none',
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
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
                {/* Grade hexagonal (mais visível no modo marcar) */}
                <path
                  data-hexgrid=""
                  d={gridPath}
                  fill="none"
                  stroke={
                    addMode
                      ? 'color-mix(in srgb,var(--accent) 34%,transparent)'
                      : 'color-mix(in srgb,var(--accent) 15%,transparent)'
                  }
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Hover: célula livre sob o cursor */}
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
                {/* Trilha em ordem de data ligando os centros dos hexes */}
                {ordenados.length >= 2 ? (
                  <polyline
                    data-trilha=""
                    points={ordenados
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
                {/* Hexes marcados; o ATUAL (último por data) por cima com glow */}
                {ordenados.map((h) => {
                  const isAtual = h.id === atual?.id
                  const isSel = h.id === selectedId
                  return (
                    <polygon
                      key={h.id}
                      data-hex={h.id}
                      data-col={h.col}
                      data-row={h.row}
                      {...(isAtual ? { 'data-atual': '' } : {})}
                      {...(isSel ? { 'data-sel': '' } : {})}
                      points={hexPolygonPoints(h.col, h.row)}
                      fill={hexFill(isAtual)}
                      stroke={isSel ? 'var(--text)' : 'var(--accent)'}
                      strokeWidth={isAtual || isSel ? 2 : 1.5}
                      strokeOpacity={isAtual ? 1 : 0.75}
                      vectorEffect="non-scaling-stroke"
                      style={
                        isAtual
                          ? { filter: 'drop-shadow(0 0 8px color-mix(in srgb,var(--accent) 75%,transparent))' }
                          : undefined
                      }
                    />
                  )
                })}
              </svg>
            </div>
          </div>
        ) : assets ? (
          <div style={{ ...sectionTitleStyle, padding: '16px 18px' }}>MAPA INDISPONÍVEL</div>
        ) : null}
      </div>

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
  )
}
