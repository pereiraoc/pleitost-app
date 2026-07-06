// Aba EXPLORAÇÃO do grupo (issue #36) — tela SEM design dedicado; extensão
// sancionada na LINGUAGEM VISUAL do design puxado: painel de canto cortado
// (clip do bits.tsx), kicker mono "// EXPLORAÇÃO" (sectionTitleStyle) e pill
// accent (mesmo skin do badge GRUPO do header, dc.html:1114).
//
// Mapa: asset real `Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png`
// (assets/byPath + assetUrl), com pan/zoom simples via CSS transform — drag
// arrasta (pointer events), wheel dá zoom com clamp [1,8] ancorado no cursor
// (listener nativo non-passive: o onWheel do React é passivo na raiz).
//
// Trilha: pontos {x,y} relativos à imagem persistidos por grupo no
// group-store (`pleitost.groupState.<groupId>`), ligados em ordem de data
// por linha tracejada sutil; o ATUAL (último por data) é destacado em accent
// com glow. Losangos contra-escalam (scale(1/zoom)) pra manter o tamanho.
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
  addGroupPoint,
  getGroupState,
  ordenarPontos,
  pontoAtual,
  removeGroupPoint,
  subscribeGroup,
  todayISO,
  updateGroupPoint,
  type GroupPoint,
} from '../data/group-store'
import { locaisSelectLines } from './exploracao'
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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Resumo maior do ponto ATUAL: imagem do doc (se houver) + FM básico. */
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

/** Painel/popover do ponto selecionado: nome + data + local + link pro doc. */
function PontoInfo({
  groupId,
  ponto,
  atual,
  onRemove,
}: {
  groupId: string
  ponto: GroupPoint
  atual: boolean
  onRemove: () => void
}) {
  const catalog = useCatalog()
  const lines = useMemo(() => locaisSelectLines(catalog), [catalog])
  const nome = ponto.localId ? (catalog.entryById.get(ponto.localId)?.basename ?? '—') : '—'
  return (
    <div
      data-ponto-info=""
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
        {ponto.localId ? (
          <Link
            to={docPath(ponto.localId)}
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
          aria-label="Remover ponto"
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
            value={ponto.data}
            onChange={(e) => {
              if (e.target.value) updateGroupPoint(groupId, ponto.id, { data: e.target.value })
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 220 }}>
          <span style={fieldLabelStyle}>LOCAL</span>
          <select
            value={ponto.localId ?? ''}
            onChange={(e) => updateGroupPoint(groupId, ponto.id, { localId: e.target.value || undefined })}
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
      {atual && ponto.localId ? <LocalResumo localId={ponto.localId} /> : null}
    </div>
  )
}

export function PanelExploracao({ groupId }: { groupId: string }) {
  const assets = useAssetIndex()
  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeGroup(groupId, cb), [groupId]),
    () => getGroupState(groupId),
  )
  const [addMode, setAddMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const movedRef = useRef(false)

  const ordenados = ordenarPontos(state.pontos)
  const atual = pontoAtual(state.pontos)
  const selecionado = selectedId ? (state.pontos.find((p) => p.id === selectedId) ?? null) : null

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

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    movedRef.current = false
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    if (!movedRef.current) return
    setView((v) => ({ ...v, tx: start.tx + dx, ty: start.ty + dy }))
  }
  const onPointerUp = () => {
    dragRef.current = null
    setDragging(false)
  }

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) {
      // arrasto de pan — não é clique
      movedRef.current = false
      return
    }
    if (!addMode) {
      setSelectedId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = clamp01((e.clientX - rect.left) / rect.width)
    const y = clamp01((e.clientY - rect.top) / rect.height)
    const criado = addGroupPoint(groupId, { x, y, data: todayISO() })
    setSelectedId(criado.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={sectionTitleStyle}>{'// EXPLORAÇÃO'}</div>
        <span style={{ flex: 1 }} />
        <button aria-pressed={addMode} onClick={() => setAddMode((a) => !a)} style={pillStyle(addMode)}>
          ADICIONAR PONTO
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
              onClick={onMapClick}
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
              {/* Trilha em ordem de data (tracejado sutil) */}
              {ordenados.length >= 2 ? (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                >
                  <polyline
                    data-trilha=""
                    points={ordenados.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity={0.55}
                    strokeWidth={1.4}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}
              {/* Losangos da trilha; o ATUAL em accent com glow */}
              {ordenados.map((p) => {
                const isAtual = p.id === atual?.id
                const isSel = p.id === selectedId
                return (
                  <button
                    key={p.id}
                    data-ponto={p.id}
                    {...(isAtual ? { 'data-atual': '' } : {})}
                    aria-label={`Ponto ${p.data}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedId(p.id)
                    }}
                    style={{
                      position: 'absolute',
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      width: 13,
                      height: 13,
                      padding: 0,
                      transform: `translate(-50%,-50%) scale(${1 / view.scale}) rotate(45deg)`,
                      background: isAtual ? 'var(--accent)' : 'var(--panel)',
                      border: `1.5px solid ${isSel ? 'var(--text)' : isAtual ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 60%,var(--line2))'}`,
                      boxShadow: isAtual
                        ? '0 0 12px color-mix(in srgb,var(--accent) 75%,transparent)'
                        : 'none',
                      cursor: 'pointer',
                    }}
                  />
                )
              })}
            </div>
          </div>
        ) : assets ? (
          <div style={{ ...sectionTitleStyle, padding: '16px 18px' }}>MAPA INDISPONÍVEL</div>
        ) : null}
      </div>

      {selecionado ? (
        <PontoInfo
          key={selecionado.id}
          groupId={groupId}
          ponto={selecionado}
          atual={selecionado.id === atual?.id}
          onRemove={() => {
            removeGroupPoint(groupId, selecionado.id)
            setSelectedId(null)
          }}
        />
      ) : null}
    </div>
  )
}
