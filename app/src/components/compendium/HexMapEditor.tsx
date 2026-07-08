// EDITOR DO MAPA DE HEXCRAWL (issue #67) — dentro da aba Hexploração da ficha
// de Localização. O GM associa cada HEX da grade sobreposta ao mapa da região
// a uma Localização do Atlas. Duas formas de marcar:
//   1) clicar num hex → selecionar uma Localização na lista filtrável (ou
//      clicar na Localização e depois no hex);
//   2) ARRASTAR uma Localização da lista pra cima de um hex.
// Hexes já mapeados ficam destacados com o nome do lugar; re-associar
// sobrescreve, o × remove.
//
// TERRITÓRIO: recria um viewer LEVE de mapa+grade AQUI (não reusa o
// PanelExploracao, que é do grupo), mas REUSA a geometria pura de exploracao.ts
// (hexGridPath/hexPolygonPoints/hexCenter/fracToHex) — a mesma grade calibrada,
// path único (barato mesmo com ~1.9k hexes), overlay em px da fonte dentro do
// transform do mapa (pan/zoom simples). O hit-test é matemático (fracToHex),
// o SVG é pointer-events:none.
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
import { useCatalog } from '../../data/CatalogContext'
import { assetUrl, useAssetIndex } from '../../data/assets'
import { docPath } from '../../paths'
import { listLocalizacoes } from '../../rules/naturalidade'
import type { RegionMap } from '../../data/region-maps'
import {
  cellAt,
  cellsByLocal,
  getHexMapState,
  removeHex,
  setHexLocal,
  subscribeHexMap,
} from '../../data/hexmap-store'
import {
  fracToHex,
  hexCenter,
  hexGridPath,
  hexPolygonPoints,
  MAP_H,
  MAP_W,
  type HexCell,
} from '../../grupo/exploracao'

const ZOOM_MIN = 1
const ZOOM_MAX = 8

/** clip-path de canto cortado (mesmo polígono do design). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Kicker mono do design (mesma família de // EXPLORAÇÃO / rótulos NOME). */
const kickerStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.18em',
  color: 'var(--muted)',
}

const inputStyle: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '7px 9px',
}

/** Linha da lista filtrável: uma Localização real do catálogo. */
interface LocalOption {
  id: string
  nome: string
  subcategoria: string
}

/** As 47 Localizações reais (scan das regras) como opções planas ordenadas por
 *  nome — a lista de origem do arrastar/selecionar. */
function useLocalOptions(): LocalOption[] {
  const catalog = useCatalog()
  return useMemo(
    () =>
      listLocalizacoes(catalog)
        .map((o) => ({ id: o.fullPath.replace(/\.md$/, ''), nome: o.nome, subcategoria: o.subcategoria }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [catalog],
  )
}

export function HexMapEditor({ region }: { region: RegionMap }) {
  const regionId = region.regionId
  const assets = useAssetIndex()
  const catalog = useCatalog()
  const options = useLocalOptions()

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeHexMap(regionId, cb), [regionId]),
    () => getHexMapState(regionId),
  )
  const byLocal = useMemo(() => cellsByLocal(state.cells), [state.cells])

  const [filtro, setFiltro] = useState('')
  const [pendingLocal, setPendingLocal] = useState<string | null>(null)
  const [dragLocal, setDragLocal] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null)
  const [hoverHex, setHoverHex] = useState<HexCell | null>(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const movedRef = useRef(false)

  const gridPath = useMemo(() => hexGridPath(), [])
  const mapEntry = assets?.byPath.get(region.mapAsset) ?? null
  useEffect(() => {
    if (assets && !mapEntry) console.warn(`[assets] mapa não encontrado: ${region.mapAsset}`)
  }, [assets, mapEntry, region.mapAsset])

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLocaleLowerCase('pt-BR')
    if (!q) return options
    return options.filter((o) => o.nome.toLocaleLowerCase('pt-BR').includes(q))
  }, [options, filtro])

  const nomeDe = (id: string): string => catalog.entryById.get(id)?.basename ?? id
  const selCell = selectedCell ? cellAt(state.cells, selectedCell.col, selectedCell.row) : null

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
  }, [mapEntry])

  /** Célula da grade sob o cursor (ou null fora da imagem). */
  const hexAtClient = (clientX: number, clientY: number): HexCell | null => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return fracToHex(fx, fy)
  }

  /** Associa a célula ao local (usado por clique e por drop). */
  const associar = (cell: HexCell, localId: string) => {
    setHexLocal(regionId, cell.col, cell.row, localId)
    setSelectedCell(cell)
    setPendingLocal(null)
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
      movedRef.current = false
      return
    }
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) {
      setSelectedCell(null)
      return
    }
    // Com uma Localização pendente selecionada, o clique no hex associa.
    if (pendingLocal) {
      associar(cell, pendingLocal)
      return
    }
    // Senão, seleciona a célula (mostra o painel de detalhe: mapeada ou vazia).
    setSelectedCell(cell)
  }

  /** Drop de uma Localização arrastada da lista sobre o mapa → associa ao hex. */
  const onMapDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const localId = e.dataTransfer.getData('text/plain') || dragLocal
    setDragLocal(null)
    if (!localId) return
    const cell = hexAtClient(e.clientX, e.clientY)
    if (cell) associar(cell, localId)
  }

  const hoverMapeado = hoverHex ? cellAt(state.cells, hoverHex.col, hoverHex.row) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={kickerStyle}>{'// MAPA DE HEXCRAWL'}</div>
        <span style={{ flex: 1 }} />
        <span style={{ ...kickerStyle, fontSize: 10 }}>
          {state.cells.length}/{options.length} MAPEADOS
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Lista filtrável das Localizações reais (origem do arrastar/selecionar) */}
        <div
          data-hex-lista=""
          style={{
            flex: '1 1 240px',
            minWidth: 220,
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(12),
            padding: 12,
          }}
        >
          <input
            type="search"
            placeholder="Filtrar Localização…"
            aria-label="Filtrar Localização"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            style={inputStyle}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              overflowY: 'auto',
              maxHeight: 'min(60vh, 560px)',
            }}
          >
            {filtradas.map((o) => {
              const mapeado = byLocal.has(o.id)
              const pend = pendingLocal === o.id
              return (
                <button
                  key={o.id}
                  data-local-item={o.id}
                  aria-pressed={pend}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', o.id)
                    e.dataTransfer.effectAllowed = 'copy'
                    setDragLocal(o.id)
                  }}
                  onDragEnd={() => setDragLocal(null)}
                  onClick={() => setPendingLocal((cur) => (cur === o.id ? null : o.id))}
                  title={mapeado ? 'Já mapeado — clique num hex pra re-associar' : 'Clique e depois num hex, ou arraste'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    padding: '6px 8px',
                    background: pend
                      ? 'color-mix(in srgb,var(--accent) 16%,transparent)'
                      : 'transparent',
                    border: `1px solid ${pend ? 'var(--accent)' : 'transparent'}`,
                    color: 'var(--text)',
                    fontFamily: 'var(--body)',
                    fontSize: 12.5,
                    cursor: 'grab',
                    clipPath: clip(5),
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      flex: 'none',
                      borderRadius: '50%',
                      background: mapeado ? 'var(--accent)' : 'var(--line2)',
                    }}
                  />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.nome}
                  </span>
                  <span style={{ ...kickerStyle, fontSize: 9 }}>{o.subcategoria}</span>
                </button>
              )
            })}
            {filtradas.length === 0 ? (
              <div style={{ ...kickerStyle, padding: '10px 4px' }}>SEM RESULTADOS</div>
            ) : null}
          </div>
          {pendingLocal ? (
            <div style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)' }}>
              CLIQUE NUM HEX PRA ASSOCIAR
            </div>
          ) : null}
        </div>

        {/* Mapa + grade (canto cortado do design) */}
        <div
          style={{
            flex: '2 1 420px',
            minWidth: 300,
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
              onClick={onMapClick}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={onMapDrop}
              style={{
                height: 'min(64vh, 580px)',
                display: 'flex',
                justifyContent: 'center',
                overflow: 'hidden',
                touchAction: 'none',
                cursor: pendingLocal ? 'crosshair' : dragging ? 'grabbing' : 'grab',
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
                  {/* Grade hexagonal — 1 único path (barato) */}
                  <path
                    data-hexgrid=""
                    d={gridPath}
                    fill="none"
                    stroke={
                      pendingLocal
                        ? 'color-mix(in srgb,var(--accent) 34%,transparent)'
                        : 'color-mix(in srgb,var(--accent) 18%,transparent)'
                    }
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Hover: célula sob o cursor */}
                  {hoverHex ? (
                    <polygon
                      data-hex-hover=""
                      points={hexPolygonPoints(hoverHex.col, hoverHex.row)}
                      fill={
                        hoverMapeado
                          ? 'color-mix(in srgb,var(--accent) 8%,transparent)'
                          : 'color-mix(in srgb,var(--accent) 12%,transparent)'
                      }
                      stroke="color-mix(in srgb,var(--accent) 55%,transparent)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* Hexes mapeados: preenchimento accent + nome do lugar */}
                  {state.cells.map((c) => {
                    const isSel =
                      selCell != null && c.col === selCell.col && c.row === selCell.row
                    const center = hexCenter(c.col, c.row)
                    return (
                      <g key={`${c.col},${c.row}`}>
                        <polygon
                          data-hex={`${c.col},${c.row}`}
                          data-col={c.col}
                          data-row={c.row}
                          data-local={c.localId}
                          {...(isSel ? { 'data-sel': '' } : {})}
                          points={hexPolygonPoints(c.col, c.row)}
                          fill="color-mix(in srgb,var(--accent) 32%,transparent)"
                          stroke={isSel ? 'var(--text)' : 'var(--accent)'}
                          strokeWidth={isSel ? 2.2 : 1.6}
                          strokeOpacity={isSel ? 1 : 0.85}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={center.x}
                          y={center.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="var(--text)"
                          fontSize={30}
                          fontFamily="var(--mono)"
                          style={{ paintOrder: 'stroke' }}
                          stroke="var(--panel)"
                          strokeWidth={5}
                        >
                          {nomeDe(c.localId)}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          ) : assets ? (
            <div style={{ ...kickerStyle, padding: '18px 20px' }}>MAPA INDISPONÍVEL</div>
          ) : null}
        </div>
      </div>

      {/* Detalhe da célula selecionada: associada (nome + trocar/remover) ou vazia */}
      {selectedCell ? (
        <div
          data-hex-detalhe=""
          style={{
            padding: '14px 16px',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(12),
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...kickerStyle, fontSize: 10 }}>
            HEX {selectedCell.col},{selectedCell.row}
          </span>
          {selCell ? (
            <>
              <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>
                {nomeDe(selCell.localId)}
              </span>
              <span style={{ flex: 1 }} />
              <Link
                to={docPath(selCell.localId)}
                style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}
              >
                ABRIR DOC
              </Link>
              <button
                data-hex-remover=""
                onClick={() => {
                  removeHex(regionId, selCell.col, selCell.row)
                  setSelectedCell(null)
                }}
                aria-label="Remover associação"
                style={{
                  background: 'none',
                  border: '1px solid var(--line2)',
                  color: 'var(--muted)',
                  width: 26,
                  height: 26,
                  lineHeight: 1,
                  cursor: 'pointer',
                  clipPath: clip(5),
                }}
              >
                ×
              </button>
            </>
          ) : (
            <span style={{ ...kickerStyle, fontSize: 11, color: 'var(--muted)' }}>
              VAZIO — {pendingLocal ? 'clique de novo no hex pra associar' : 'selecione uma Localização e clique aqui, ou arraste'}
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
