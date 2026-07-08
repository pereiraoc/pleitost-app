// EDITOR DO MAPA DE HEXCRAWL (issue #67; áreas + tela cheia em #79/#80) — dentro
// da aba Hexploração da ficha de Localização. O GM associa hexes da grade a
// Localizações, em DOIS MODOS ortogonais (o eixo de cada célula é independente:
// marcar região nunca apaga o lugar já marcado, e vice-versa):
//   • LUGARES — um LUGAR pontual por hex (Capital/Cidade/POI): clicar num hex e
//     escolher a Localização na lista filtrável, ou ARRASTAR a Localização da
//     lista pro hex (#67, inalterado);
//   • REGIÕES — uma ÁREA grande (Região/Nação/Ponto de Interesse) cobrindo
//     MUITOS hexes: escolher a área na lista e marcar UM POR UM (toque) OU com o
//     LAÇO (arrastar um polígono que seleciona todos os hexes por dentro, #79).
//
// Interação do mapa (pan/PINÇA/roda/TELA CHEIA) vem do hook compartilhado
// useMapView (#80); a geometria pura (grade/união/polígono) de exploracao.ts.
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { assetUrl, useAssetIndex } from '../../data/assets'
import { docPath } from '../../paths'
import { listLocalizacoes } from '../../rules/naturalidade'
import type { RegionMap } from '../../data/region-maps'
import { useHexMap } from '../../data/useHexMap'
import {
  areaAt,
  cellAt,
  cellsByLocal,
  cellsOfArea,
  exportAllHexMaps,
  importAllHexMaps,
  removeArea,
  removeHex,
  removeHexArea,
  setHexArea,
  setHexAreaBulk,
  setHexLocal,
} from '../../data/hexmap-store'
import {
  fracToHex,
  hexCenter,
  hexesInPolygon,
  hexGridPath,
  hexPolygonPoints,
  hexUnionPath,
  MAP_H,
  MAP_W,
  type HexCell,
  type Pt,
} from '../../grupo/exploracao'
import { useMapView } from '../../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'

/** Subcategorias que contam como ÁREA (marcação em massa no modo Regiões). */
const AREA_SUBCATS = new Set(['Região', 'Nação', 'Ponto de Interesse'])

/** clip-path de canto cortado (mesmo polígono do design). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Kicker mono do design. */
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

/** Pill mono (skin do badge do design). */
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

/** Hue determinística por área (tint decorativo de zona, não rótulo). */
function areaHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}
function areaColor(id: string, alpha: number): string {
  return `hsl(${areaHue(id)} 68% 55% / ${alpha})`
}

interface LocalOption {
  id: string
  nome: string
  subcategoria: string
}

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

type Mode = 'lugares' | 'regioes'

export function HexMapEditor({ region }: { region: RegionMap }) {
  const regionId = region.regionId
  const assets = useAssetIndex()
  const catalog = useCatalog()
  const options = useLocalOptions()
  const state = useHexMap(regionId)

  const byLocal = useMemo(() => cellsByLocal(state.cells), [state.cells])
  const placeCells = useMemo(() => state.cells.filter((c) => c.localId), [state.cells])
  const areaIds = useMemo(() => {
    const out: string[] = []
    for (const c of state.cells) if (c.areaId && !out.includes(c.areaId)) out.push(c.areaId)
    return out
  }, [state.cells])

  const [mode, setMode] = useState<Mode>('lugares')
  const [filtro, setFiltro] = useState('')
  // LUGARES
  const [pendingLocal, setPendingLocal] = useState<string | null>(null)
  const [dragLocal, setDragLocal] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null)
  // REGIÕES
  const [pendingArea, setPendingArea] = useState<string | null>(null)
  const [lasso, setLasso] = useState(false)
  const [lassoPts, setLassoPts] = useState<Pt[]>([])
  const lassoActiveRef = useRef(false)

  const [hoverHex, setHoverHex] = useState<HexCell | null>(null)
  const pressedRef = useRef(false)
  const [backupMsg, setBackupMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Backup (#81): exportar/importar todos os mapas salvos ────────────────
  const onExport = () => {
    try {
      const json = exportAllHexMaps()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pleitost-mapas.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setBackupMsg('Backup baixado')
    } catch {
      setBackupMsg('Falha ao exportar')
    }
  }
  const onImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const n = importAllHexMaps(String(reader.result ?? ''))
        setBackupMsg(`${n} região(ões) restaurada(s)`)
      } catch {
        setBackupMsg('Arquivo inválido')
      }
    }
    reader.readAsText(file)
  }

  const map = useMapView()
  const gridPath = useMemo(() => hexGridPath(), [])
  const mapEntry = assets?.byPath.get(region.mapAsset) ?? null

  const drawingLasso = mode === 'regioes' && lasso && !!pendingArea

  const filtradas = useMemo(() => {
    const base = mode === 'regioes' ? options.filter((o) => AREA_SUBCATS.has(o.subcategoria)) : options
    const q = filtro.trim().toLocaleLowerCase('pt-BR')
    if (!q) return base
    return base.filter((o) => o.nome.toLocaleLowerCase('pt-BR').includes(q))
  }, [options, filtro, mode])

  const nomeDe = (id: string): string => catalog.entryById.get(id)?.basename ?? id
  const selCell = selectedCell ? cellAt(state.cells, selectedCell.col, selectedCell.row) : null

  /** Célula da grade sob o cursor (ou null fora da imagem). */
  const hexAtClient = (clientX: number, clientY: number): HexCell | null => {
    const f = map.fracAtClient(clientX, clientY)
    return f ? fracToHex(f.fx, f.fy) : null
  }
  /** Ponto da imagem em px da FONTE sob o cursor (clamp nas bordas p/ o laço). */
  const srcPtAtClient = (clientX: number, clientY: number): Pt | null => {
    const rect = map.mapRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    const fx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const fy = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    return { x: fx * MAP_W, y: fy * MAP_H }
  }

  const associarLocal = (cell: HexCell, localId: string) => {
    setHexLocal(regionId, cell.col, cell.row, localId)
    setSelectedCell(cell)
    setPendingLocal(null)
  }

  const toggleAreaHex = (cell: HexCell) => {
    if (!pendingArea) return
    if (areaAt(state.cells, cell.col, cell.row) === pendingArea) {
      removeHexArea(regionId, cell.col, cell.row)
    } else {
      setHexArea(regionId, cell.col, cell.row, pendingArea)
    }
  }

  // ── Ponteiros: laço (regiões) OU pan/pinça (hook) ─────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    pressedRef.current = true
    setHoverHex(null)
    if (drawingLasso) {
      lassoActiveRef.current = true
      const p = srcPtAtClient(e.clientX, e.clientY)
      setLassoPts(p ? [p] : [])
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      return
    }
    map.onPointerDown(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (lassoActiveRef.current) {
      const p = srcPtAtClient(e.clientX, e.clientY)
      if (p) setLassoPts((prev) => [...prev, p])
      return
    }
    map.onPointerMove(e)
    if (!pressedRef.current) {
      const h = hexAtClient(e.clientX, e.clientY)
      setHoverHex((prev) =>
        (prev && h && prev.col === h.col && prev.row === h.row) || (!prev && !h) ? prev : h,
      )
    }
  }
  const finishLasso = () => {
    lassoActiveRef.current = false
    const pts = lassoPts
    setLassoPts([])
    if (pendingArea && pts.length >= 3) {
      const cells = hexesInPolygon(pts)
      if (cells.length) setHexAreaBulk(regionId, cells, pendingArea)
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pressedRef.current = false
    if (lassoActiveRef.current) {
      finishLasso()
      return
    }
    map.onPointerUp(e)
  }
  const onPointerLeave = () => {
    if (hoverHex) setHoverHex(null)
  }

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (map.consumeMoved()) return
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) {
      setSelectedCell(null)
      return
    }
    if (mode === 'regioes') {
      if (pendingArea && !lasso) toggleAreaHex(cell)
      setSelectedCell(cell)
      return
    }
    if (pendingLocal) {
      associarLocal(cell, pendingLocal)
      return
    }
    setSelectedCell(cell)
  }

  const onMapDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const localId = e.dataTransfer.getData('text/plain') || dragLocal
    setDragLocal(null)
    if (!localId) return
    const cell = hexAtClient(e.clientX, e.clientY)
    if (cell) associarLocal(cell, localId)
  }

  const hoverMapeado = hoverHex ? cellAt(state.cells, hoverHex.col, hoverHex.row) : null
  const selArea = selCell?.areaId ?? (selectedCell ? areaAt(state.cells, selectedCell.col, selectedCell.row) : null)

  const panelStyle: CSSProperties = {
    flex: '2 1 420px',
    minWidth: 300,
    position: 'relative',
    background: 'var(--panel)',
    border: '1px solid var(--line2)',
    clipPath: clip(14),
    overflow: 'hidden',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={kickerStyle}>{'// MAPA DE HEXCRAWL'}</div>
        {/* #79: seletor de MODO — marcar LUGARES ou marcar REGIÕES */}
        <div data-modo="" role="group" aria-label="Modo de marcação" style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            data-modo-lugares=""
            aria-pressed={mode === 'lugares'}
            onClick={() => {
              setMode('lugares')
              setPendingArea(null)
              setLasso(false)
            }}
            style={pillStyle(mode === 'lugares')}
          >
            LUGARES
          </button>
          <button
            type="button"
            data-modo-regioes=""
            aria-pressed={mode === 'regioes'}
            onClick={() => {
              setMode('regioes')
              setPendingLocal(null)
              setFiltro('')
            }}
            style={pillStyle(mode === 'regioes')}
          >
            REGIÕES
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {/* Backup (#81): segurança + diagnóstico do que está salvo */}
        <button type="button" data-export="" onClick={onExport} title="Baixar backup dos mapas" style={pillStyle(false)}>
          EXPORTAR
        </button>
        <button
          type="button"
          data-import=""
          onClick={() => fileInputRef.current?.click()}
          title="Restaurar de um backup"
          style={pillStyle(false)}
        >
          IMPORTAR
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportFile(f)
            e.target.value = ''
          }}
        />
        {backupMsg ? <span style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)' }}>{backupMsg}</span> : null}
        <span style={{ ...kickerStyle, fontSize: 10 }}>
          {mode === 'regioes'
            ? `${areaIds.length} ÁREAS`
            : `${placeCells.length}/${options.length} MAPEADOS · ${state.cells.length} HEX`}
        </span>
      </div>

      <div
        ref={map.containerRef}
        style={fullscreenContainerStyle(
          { display: 'flex', gap: 14, flexWrap: map.fullscreen ? 'nowrap' : 'wrap', alignItems: 'stretch' },
          map.fullscreen,
        )}
      >
        {/* Lista filtrável (Localizações no modo Lugares · Áreas no modo Regiões) */}
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
            placeholder={mode === 'regioes' ? 'Filtrar Área…' : 'Filtrar Localização…'}
            aria-label={mode === 'regioes' ? 'Filtrar Área' : 'Filtrar Localização'}
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
              const isArea = mode === 'regioes'
              const mapeado = isArea ? areaIds.includes(o.id) : byLocal.has(o.id)
              const pend = isArea ? pendingArea === o.id : pendingLocal === o.id
              const count = isArea ? cellsOfArea(state.cells, o.id).length : 0
              return (
                <button
                  key={o.id}
                  data-local-item={o.id}
                  {...(isArea ? { 'data-area-item': o.id } : {})}
                  aria-pressed={pend}
                  draggable={!isArea}
                  onDragStart={
                    isArea
                      ? undefined
                      : (e) => {
                          e.dataTransfer.setData('text/plain', o.id)
                          e.dataTransfer.effectAllowed = 'copy'
                          setDragLocal(o.id)
                        }
                  }
                  onDragEnd={isArea ? undefined : () => setDragLocal(null)}
                  onClick={() =>
                    isArea
                      ? setPendingArea((cur) => (cur === o.id ? null : o.id))
                      : setPendingLocal((cur) => (cur === o.id ? null : o.id))
                  }
                  title={
                    isArea
                      ? 'Selecione e toque nos hexes, ou use o LAÇO'
                      : mapeado
                        ? 'Já mapeado — clique num hex pra re-associar'
                        : 'Clique e depois num hex, ou arraste'
                  }
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
                    cursor: isArea ? 'pointer' : 'grab',
                    clipPath: clip(5),
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 9,
                      height: 9,
                      flex: 'none',
                      borderRadius: isArea ? 2 : '50%',
                      background: isArea
                        ? areaColor(o.id, mapeado ? 0.95 : 0.4)
                        : mapeado
                          ? 'var(--accent)'
                          : 'var(--line2)',
                    }}
                  />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.nome}
                  </span>
                  {isArea && count ? (
                    <span style={{ ...kickerStyle, fontSize: 9 }}>{count} HEX</span>
                  ) : (
                    <span style={{ ...kickerStyle, fontSize: 9 }}>{o.subcategoria}</span>
                  )}
                </button>
              )
            })}
            {filtradas.length === 0 ? (
              <div style={{ ...kickerStyle, padding: '10px 4px' }}>SEM RESULTADOS</div>
            ) : null}
          </div>
          {mode === 'regioes' && pendingArea ? (
            <div style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)' }}>
              {lasso ? 'ARRASTE UM LAÇO PELOS HEXES' : 'TOQUE NOS HEXES PRA MARCAR/DESMARCAR'}
            </div>
          ) : mode === 'lugares' && pendingLocal ? (
            <div style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)' }}>
              CLIQUE NUM HEX PRA ASSOCIAR
            </div>
          ) : null}
        </div>

        {/* Mapa + grade (canto cortado do design) */}
        <div style={{ ...panelStyle, clipPath: map.fullscreen ? 'none' : clip(14) }}>
          {mapEntry ? (
            <>
              <div
                ref={map.viewportRef}
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
                  height: map.fullscreen ? '100%' : 'min(64vh, 580px)',
                  display: 'flex',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  touchAction: 'none',
                  cursor: drawingLasso
                    ? 'crosshair'
                    : pendingLocal || (mode === 'regioes' && pendingArea)
                      ? 'crosshair'
                      : map.dragging
                        ? 'grabbing'
                        : 'grab',
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
                    {/* Áreas (união de hexes por zona) — um path por área (#79) */}
                    {areaIds.map((aid) => {
                      const cells = cellsOfArea(state.cells, aid)
                      const isPend = aid === pendingArea
                      return (
                        <path
                          key={`area-${aid}`}
                          data-area={aid}
                          {...(isPend ? { 'data-area-pend': '' } : {})}
                          d={hexUnionPath(cells)}
                          fill={areaColor(aid, isPend ? 0.42 : 0.24)}
                          stroke={areaColor(aid, isPend ? 1 : 0.7)}
                          strokeWidth={isPend ? 2.4 : 1.4}
                          vectorEffect="non-scaling-stroke"
                        />
                      )
                    })}
                    {/* Rótulo da área no centroide dos seus hexes */}
                    {areaIds.map((aid) => {
                      const cells = cellsOfArea(state.cells, aid)
                      if (!cells.length) return null
                      let sx = 0
                      let sy = 0
                      for (const c of cells) {
                        const ct = hexCenter(c.col, c.row)
                        sx += ct.x
                        sy += ct.y
                      }
                      return (
                        <text
                          key={`area-lbl-${aid}`}
                          x={sx / cells.length}
                          y={sy / cells.length}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="var(--text)"
                          fontSize={40}
                          fontFamily="var(--mono)"
                          style={{ paintOrder: 'stroke' }}
                          stroke="var(--panel)"
                          strokeWidth={7}
                        >
                          {nomeDe(aid)}
                        </text>
                      )
                    })}

                    {/* Grade hexagonal — 1 único path (barato) */}
                    <path
                      data-hexgrid=""
                      d={gridPath}
                      fill="none"
                      stroke={
                        pendingLocal || (mode === 'regioes' && pendingArea)
                          ? 'color-mix(in srgb,var(--accent) 34%,transparent)'
                          : 'color-mix(in srgb,var(--accent) 18%,transparent)'
                      }
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Laço em desenho (#79) */}
                    {lassoPts.length >= 2 ? (
                      <polyline
                        data-lasso=""
                        points={lassoPts.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill={pendingArea ? areaColor(pendingArea, 0.16) : 'none'}
                        stroke={pendingArea ? areaColor(pendingArea, 1) : 'var(--accent)'}
                        strokeWidth={2}
                        strokeDasharray="6 5"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
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
                    {/* Hexes com LUGAR: preenchimento accent + nome do lugar */}
                    {placeCells.map((c) => {
                      const isSel = selCell != null && c.col === selCell.col && c.row === selCell.row
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
                            {nomeDe(c.localId!)}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>
              <MapControls
                map={map}
                extra={
                  mode === 'regioes' ? (
                    <button
                      type="button"
                      data-lasso-toggle=""
                      aria-pressed={lasso}
                      disabled={!pendingArea}
                      title={pendingArea ? 'Laço: arraste um polígono' : 'Selecione uma área primeiro'}
                      onClick={() => setLasso((l) => !l)}
                      style={{
                        ...pillStyle(lasso),
                        height: 36,
                        opacity: pendingArea ? 1 : 0.5,
                        cursor: pendingArea ? 'pointer' : 'not-allowed',
                      }}
                    >
                      LAÇO
                    </button>
                  ) : null
                }
              />
            </>
          ) : assets ? (
            <div style={{ ...kickerStyle, padding: '18px 20px' }}>MAPA INDISPONÍVEL</div>
          ) : null}
        </div>
      </div>

      {/* Detalhe da célula selecionada */}
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
          {selCell?.localId ? (
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
          ) : selArea ? (
            <>
              <span
                aria-hidden
                style={{ width: 12, height: 12, flex: 'none', borderRadius: 2, background: areaColor(selArea, 0.95) }}
              />
              <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>
                {nomeDe(selArea)}
              </span>
              <span style={{ ...kickerStyle, fontSize: 10 }}>
                ÁREA · {cellsOfArea(state.cells, selArea).length} HEX
              </span>
              <span style={{ flex: 1 }} />
              <Link
                to={docPath(selArea)}
                style={{ ...kickerStyle, fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}
              >
                ABRIR DOC
              </Link>
              <button
                data-area-remover=""
                onClick={() => {
                  removeArea(regionId, selArea)
                  setSelectedCell(null)
                }}
                style={{ ...pillStyle(false), color: 'var(--muted)', border: '1px solid var(--line2)', background: 'none' }}
              >
                APAGAR ÁREA
              </button>
            </>
          ) : (
            <span style={{ ...kickerStyle, fontSize: 11, color: 'var(--muted)' }}>
              VAZIO —{' '}
              {mode === 'regioes'
                ? pendingArea
                  ? 'toque de novo pra marcar nesta área'
                  : 'selecione uma Área na lista'
                : pendingLocal
                  ? 'clique de novo no hex pra associar'
                  : 'selecione uma Localização e clique aqui, ou arraste'}
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
