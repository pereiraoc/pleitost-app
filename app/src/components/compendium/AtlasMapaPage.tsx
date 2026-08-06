// MAPA DO MUNDO — atlas navegável (fases 1+2, #418/#419).
//
// Fase 1: visualizador pan/pinça/zoom/fullscreen (useMapView/MapControls, os
// mesmos da exploração) do atlas.webp completo (7440×5262).
// Fase 2 (pedido do mestre): REGIÕES marcadas pelo GM (polígonos em px da
// fonte) habilitáveis POR GRUPO; região desabilitada fica coberta pelo
// atlas-overlay.webp (clipado no polígono) e nenhum lugar por baixo é
// clicável/visível. LUGARES são pins ligados a docs de Localização — clicar
// navega pra página do lugar (o "mapa navegável" que o AtlasNav anunciava).
//
// Autoria (Modo Mestre, padrão HexMapEditor): tudo local-first em
// pleitost.mapaAtlas (mapa-atlas-store). Propagação viva pros jogadores da
// mesa via sessions.state.mapaAtlas (jsonb, mesmo veículo da exploração #5):
// o MESTRE empurra a cada mudança; o jogador conectado LÊ o state direto no
// render (nunca grava — GM é o único autor, sem loop de merge).
// A vault não é tocada.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssetIndex, assetUrl, resolveAsset } from '../../data/assets'
import { useCatalog } from '../../data/CatalogContext'
import { docPath } from '../../paths'
import { LOCALIZACAO_TYPE } from '../../data/atlas-nav'
import { localEntriesOfKind } from '../../data/local-entities'
import { useSettings } from '../../settings'
import { useLiveSession } from '../../data/session-repo/live-session'
import { useSessionRepo } from '../../data/session-repo/provider'
import { useMesaGrupoPersistenteId } from '../../grupo/use-mesa-group-image'
import { useMapView } from '../../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'
import {
  DEFAULT_VIEWER,
  addPin,
  addRegiao,
  mapaAtlasJson,
  pinVisivel,
  regioesDesabilitadas,
  removePin,
  removeRegiao,
  sanitize,
  toggleRegiaoHabilitada,
  useMapaAtlas,
  type MapaPonto,
} from '../../map/mapa-atlas-store'

/** Paths EXATOS dos assets no manifest (byPath — sem resolução por basename). */
export const ATLAS_MAPA_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas.webp'
export const ATLAS_OVERLAY_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas-overlay.webp'

/** Dimensões da FONTE do atlas.webp — coordenadas de regiões/pins são px
 *  desta imagem (mesmo contrato do MAP_W/MAP_H da exploração). */
export const ATLAS_MAPA_W = 7440
export const ATLAS_MAPA_H = 5262

type ModoMestre = 'nav' | 'regiao' | 'pin'

function clip(n: number): string {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

const mono9: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9.5,
  letterSpacing: '.1em',
  color: 'var(--muted)',
}

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: '6px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '.05em',
    cursor: 'pointer',
    clipPath: clip(6),
    color: active ? 'var(--ink)' : 'var(--accent)',
    background: active ? 'var(--accent)' : 'var(--card)',
    border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
  }
}

export function AtlasMapaPage() {
  const assets = useAssetIndex()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const map = useMapView()
  const { mestre } = useSettings()
  const live = useLiveSession()
  const repo = useSessionRepo()
  const grupoMesa = useMesaGrupoPersistenteId()
  const local = useMapaAtlas()

  // Jogador conectado lê o state da MESA (autor = GM); mestre/offline usa o
  // local. Nunca gravamos o remoto no store local — sem loop de merge.
  const remoto = (live?.state as Record<string, unknown> | null | undefined)?.['mapaAtlas']
  const cfg = useMemo(() => (!mestre && remoto ? sanitize(remoto) : local), [mestre, remoto, local])

  // MESTRE conectado EMPURRA o blob a cada mudança local (veículo da
  // exploração #5: sessions.state jsonb; updateSessionState mescla top-level).
  const pushedRef = useRef('')
  useEffect(() => {
    if (!mestre || !repo || !live?.sessionId) return
    const json = mapaAtlasJson(local)
    if (json === pushedRef.current) return
    pushedRef.current = json
    void repo.updateSessionState(live.sessionId, { mapaAtlas: JSON.parse(json) }).catch(() => {})
  }, [mestre, repo, live?.sessionId, local])

  // Viewer do gating: mestre PREVIEW por seletor; jogador = grupo persistente
  // da mesa; sem grupo → DEFAULT_VIEWER ("(sem grupo)").
  const [previewGrupo, setPreviewGrupo] = useState<string>(DEFAULT_VIEWER)
  const viewerGrupo = mestre ? previewGrupo : (grupoMesa ?? DEFAULT_VIEWER)
  const desabilitadas = useMemo(
    () => regioesDesabilitadas(cfg, viewerGrupo),
    [cfg, viewerGrupo],
  )

  // ── Autoria (Modo Mestre) ────────────────────────────────────────────────
  const [modo, setModo] = useState<ModoMestre>('nav')
  const [vertices, setVertices] = useState<MapaPonto[]>([])
  const [nomeRegiao, setNomeRegiao] = useState('')
  const [pinPendente, setPinPendente] = useState<MapaPonto | null>(null)
  const [pinLocalId, setPinLocalId] = useState('')

  const localizacoes = useMemo(
    () =>
      (catalog.docsByType.get(LOCALIZACAO_TYPE) ?? [])
        .slice()
        .sort((a, b) => (a.basename ?? a.id).localeCompare(b.basename ?? b.id, 'pt-BR')),
    [catalog],
  )
  // Grupos do gating: docs de Grupo da vault + grupos locais criados no app.
  const grupos = useMemo(() => {
    const vault = (catalog.docsByType.get('Grupo') ?? []).map((e) => ({
      id: e.id,
      nome: e.basename ?? e.id,
    }))
    const locais = localEntriesOfKind('Grupo').map((e) => ({
      id: e.id,
      nome: e.basename ?? e.id,
    }))
    return [...vault, ...locais].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [catalog])
  const [grupoGating, setGrupoGating] = useState<string>(DEFAULT_VIEWER)

  const nomeDe = (localId: string) =>
    catalog.entryById.get(localId)?.basename ?? localId.split('/').pop() ?? localId

  const mapEntry = assets ? resolveAsset(assets, ATLAS_MAPA_ASSET) : null
  const overlayEntry = assets ? resolveAsset(assets, ATLAS_OVERLAY_ASSET) : null

  /** Clique no mapa em px da FONTE (suprimido após arraste/pinça). */
  const onMapClick = (e: React.MouseEvent) => {
    if (map.consumeMoved()) return
    if (!mestre || modo === 'nav') return
    const f = map.fracAtClient(e.clientX, e.clientY)
    if (!f) return
    const p = { x: Math.round(f.fx * ATLAS_MAPA_W), y: Math.round(f.fy * ATLAS_MAPA_H) }
    if (modo === 'regiao') setVertices((v) => [...v, p])
    else if (modo === 'pin') setPinPendente(p)
  }

  const concluirRegiao = () => {
    if (addRegiao(nomeRegiao, vertices)) {
      setVertices([])
      setNomeRegiao('')
      setModo('nav')
    }
  }

  const confirmarPin = () => {
    if (pinPendente && pinLocalId) {
      addPin(pinLocalId, pinPendente.x, pinPendente.y)
      setPinPendente(null)
      setPinLocalId('')
    }
  }

  const abrirPin = (localId: string) => {
    if (map.consumeMoved()) return
    navigate(docPath(localId))
  }

  const pinsVisiveis = cfg.pins.filter((p) => pinVisivel(p, desabilitadas))

  return (
    <section className="page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...mono9, fontSize: 12, fontWeight: 700, letterSpacing: '.12em' }}>
        {'// MAPA DO MUNDO'}
      </div>
      <div
        ref={map.containerRef}
        style={fullscreenContainerStyle(
          {
            position: 'relative',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: map.fullscreen ? 'none' : clip(14),
            overflow: 'hidden',
          },
          map.fullscreen,
        )}
      >
        {mapEntry ? (
          <div
            ref={map.viewportRef}
            data-mapa-viewport=""
            onPointerDown={map.onPointerDown}
            onPointerMove={map.onPointerMove}
            onPointerUp={map.onPointerUp}
            onPointerCancel={map.onPointerUp}
            onClick={onMapClick}
            style={{
              height: map.fullscreen ? '100%' : 'min(74vh, 720px)',
              display: 'flex',
              justifyContent: 'center',
              overflow: 'hidden',
              touchAction: 'none',
              cursor:
                mestre && modo !== 'nav' ? 'crosshair' : map.dragging ? 'grabbing' : 'grab',
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
                alt="Mapa do mundo"
                draggable={false}
                style={{ height: '100%', width: 'auto', display: 'block' }}
              />
              {/* Camadas em px da FONTE — escalam junto com o transform. */}
              <svg
                viewBox={`0 0 ${ATLAS_MAPA_W} ${ATLAS_MAPA_H}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                {/* Overlay CLIPADO nas regiões desabilitadas do viewer — "o
                    mapa de overlay estará por cima" só onde o GM desabilitou. */}
                {overlayEntry && desabilitadas.length > 0 ? (
                  <>
                    <defs>
                      <clipPath id="mapa-regioes-off">
                        {desabilitadas.map((r) => (
                          <polygon
                            key={r.id}
                            points={r.pontos.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                        ))}
                      </clipPath>
                    </defs>
                    <image
                      data-overlay-desabilitado=""
                      href={assetUrl(overlayEntry)}
                      x={0}
                      y={0}
                      width={ATLAS_MAPA_W}
                      height={ATLAS_MAPA_H}
                      clipPath="url(#mapa-regioes-off)"
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                ) : null}
                {/* Contornos das regiões — SÓ no Modo Mestre (autoria). */}
                {mestre
                  ? cfg.regioes.map((r) => (
                      <polygon
                        key={r.id}
                        points={r.pontos.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={8}
                        strokeDasharray="24 16"
                        opacity={0.8}
                        style={{ pointerEvents: 'none' }}
                      />
                    ))
                  : null}
                {/* Polígono EM DESENHO (modo região). */}
                {mestre && vertices.length > 0 ? (
                  <polyline
                    points={vertices.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(255,255,255,0.08)"
                    stroke="var(--red)"
                    strokeWidth={10}
                    style={{ pointerEvents: 'none' }}
                  />
                ) : null}
                {/* PINS de lugar — clicáveis; some/inerte em região desabilitada. */}
                {pinsVisiveis.map((pin) => (
                  <g
                    key={pin.id}
                    data-pin={pin.localId}
                    transform={`translate(${pin.x},${pin.y})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      abrirPin(pin.localId)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{nomeDe(pin.localId)}</title>
                    <circle r={34} fill="color-mix(in srgb,var(--accent) 30%,transparent)" />
                    <circle r={16} fill="var(--accent)" stroke="var(--ink)" strokeWidth={4} />
                  </g>
                ))}
                {/* Pin PENDENTE (modo lugar). */}
                {pinPendente ? (
                  <circle
                    cx={pinPendente.x}
                    cy={pinPendente.y}
                    r={20}
                    fill="var(--red)"
                    style={{ pointerEvents: 'none' }}
                  />
                ) : null}
              </svg>
            </div>
          </div>
        ) : (
          <div style={{ padding: '48px 16px', textAlign: 'center', ...mono9, fontSize: 12 }}>
            mapa indisponível no vault-data
          </div>
        )}
        <MapControls map={map} />
      </div>

      {/* ── Painel do MESTRE: marcar regiões/lugares + habilitação por grupo ── */}
      {mestre ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(12),
          }}
        >
          <div style={{ ...mono9, fontWeight: 700 }}>FERRAMENTAS DO MESTRE</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={pillStyle(modo === 'nav')} onClick={() => setModo('nav')}>
              ✋ NAVEGAR
            </button>
            <button
              style={pillStyle(modo === 'regiao')}
              onClick={() => {
                setModo('regiao')
                setPinPendente(null)
              }}
            >
              ⬡ MARCAR REGIÃO
            </button>
            <button
              style={pillStyle(modo === 'pin')}
              onClick={() => {
                setModo('pin')
                setVertices([])
              }}
            >
              📍 MARCAR LUGAR
            </button>
          </div>

          {modo === 'regiao' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={mono9}>
                {vertices.length < 3
                  ? `Toque no mapa pra desenhar o contorno (${vertices.length}/3+ vértices)`
                  : `${vertices.length} vértices — dê um nome e conclua`}
              </span>
              <input
                aria-label="Nome da região"
                placeholder="Nome da região"
                value={nomeRegiao}
                onChange={(e) => setNomeRegiao(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              <button
                style={pillStyle(false)}
                disabled={vertices.length < 3 || !nomeRegiao.trim()}
                onClick={concluirRegiao}
              >
                ✓ CONCLUIR REGIÃO
              </button>
              <button style={pillStyle(false)} onClick={() => setVertices([])}>
                ↩ LIMPAR
              </button>
            </div>
          ) : null}

          {modo === 'pin' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={mono9}>
                {pinPendente ? 'Escolha a Localização do pin:' : 'Toque no mapa pra posicionar o lugar'}
              </span>
              {pinPendente ? (
                <>
                  <select
                    aria-label="Localização do pin"
                    value={pinLocalId}
                    onChange={(e) => setPinLocalId(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--card)',
                      border: '1px solid var(--line2)',
                      color: 'var(--text)',
                      fontSize: 13,
                      maxWidth: 260,
                    }}
                  >
                    <option value="">— Localização —</option>
                    {localizacoes.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.basename ?? l.id}
                      </option>
                    ))}
                  </select>
                  <button style={pillStyle(false)} disabled={!pinLocalId} onClick={confirmarPin}>
                    ✓ FIXAR LUGAR
                  </button>
                  <button style={pillStyle(false)} onClick={() => setPinPendente(null)}>
                    ↩ CANCELAR
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {/* Habilitação POR GRUPO ("poderão ser habilitadas conforme o grupo"). */}
          {cfg.regioes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...mono9, fontWeight: 700 }}>REGIÕES HABILITADAS</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  aria-label="Grupo do gating"
                  value={grupoGating}
                  onChange={(e) => {
                    setGrupoGating(e.target.value)
                    setPreviewGrupo(e.target.value)
                  }}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    color: 'var(--text)',
                    fontSize: 13,
                    maxWidth: 260,
                  }}
                >
                  <option value={DEFAULT_VIEWER}>(sem grupo)</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
                <span style={mono9}>o mapa acima mostra o PREVIEW deste grupo</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cfg.regioes.map((r) => {
                  const on = (cfg.habilitadas[grupoGating] ?? []).includes(r.id)
                  return (
                    <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label
                        style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Habilitar ${r.nome}`}
                          checked={on}
                          onChange={() => toggleRegiaoHabilitada(grupoGating, r.id)}
                        />
                        <span style={{ fontWeight: 600 }}>{r.nome}</span>
                      </label>
                      <span style={mono9}>{on ? 'visível' : 'coberta pelo overlay'}</span>
                      <span style={{ flex: 1 }} />
                      <button
                        aria-label={`Remover região ${r.nome}`}
                        onClick={() => removeRegiao(r.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
                      >
                        🗑️
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Lugares marcados (remover). */}
          {cfg.pins.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ ...mono9, fontWeight: 700 }}>LUGARES NO MAPA</div>
              {cfg.pins.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span>📍 {nomeDe(p.localId)}</span>
                  <span style={{ flex: 1 }} />
                  <button
                    aria-label={`Remover lugar ${nomeDe(p.localId)}`}
                    onClick={() => removePin(p.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
