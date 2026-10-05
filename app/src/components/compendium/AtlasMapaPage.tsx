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
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssetIndex, assetUrl, resolveAsset } from '../../data/assets'
import { useCatalog } from '../../data/CatalogContext'
import { docPath } from '../../paths'
import { LOCALIZACAO_TYPE } from '../../data/atlas-nav'
import { localEntriesOfKind } from '../../data/local-entities'
import { useSettings } from '../../settings'
import { useMesaGrupoPersistenteId } from '../../grupo/use-mesa-group-image'
import { useSrcDoMapa } from '../../map/mapa-src'
import { useMapaAssado } from '../../map/mapa-assado'
import { useCamadasOverlay } from '../../map/camadas-overlay'
import { useMapaDebug } from '../../map/mapa-debug'
import { useMapView } from '../../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'
import {
  DEFAULT_VIEWER,
  addRegiao,
  cellsFromStroke,
  hexEmRegioes,
  normalizeRegioesToHex,
  outlineRingsFromCells,
  pinVisivel,
  regioesDesabilitadas,
  removePin,
  removeRegiao,
  toggleRegiaoHabilitada,
  toggleRegiaoHex,
  type MapaPonto,
} from '../../map/mapa-atlas-store'
import { useDetail } from '../../data/detail-context'
import {
  atlasFracToHex,
  atlasHexPolygonPoints,
  atlasHexVertices,
  type AtlasHexCell,
} from '../../map/atlas-grid'
import { activeContextoDef } from '../../data/reskin'
import { useHexMap } from '../../data/useHexMap'
import {
  areasAt,
  cellAt,
  cellsByLocal,
  cellsOfArea,
  hexHasArea,
  removeHex,
  removeHexArea,
  setHexArea,
  setHexLocal,
  setHexTerrenoBulk,
  type HexMapCell,
} from '../../data/hexmap-store'
import { MAPA_MUNDO_ID } from '../../data/seed-hexmaps'
import { buildAtlasIndex } from '../../data/atlas-nav'
import { useDocs } from '../../data/useDoc'
import { HexInfoBar } from '../../map/HexInfoBar'
import { useHexMapMundoSync } from '../../map/use-hexmapmundo-sync'
import { useMapaAtlasSync } from '../../map/use-mapaatlas-sync'
// Paths dos assets do mapa: agora em map/atlas-grid.ts (módulo neutro — o
// wizard de criação também consome sem importar componente de página);
// re-exportados aqui pra compatibilidade dos consumidores existentes.
import { ATLAS_MAPA_ASSET, ATLAS_OVERLAY_ASSET } from '../../map/atlas-grid'
export { ATLAS_MAPA_ASSET, ATLAS_OVERLAY_ASSET }

/** Dimensões da FONTE do atlas.webp — coordenadas de regiões/pins são px
 *  desta imagem (mesmo contrato do MAP_W/MAP_H da exploração). */
export const ATLAS_MAPA_W = 7440
export const ATLAS_MAPA_H = 5262

type ModoMestre = 'nav' | 'regiao' | 'hexes' | 'hex-lugar' | 'hex-area' | 'terreno'

/** `d` de um path com TODOS os hexes dados (um subpath por hex) — um elemento
 *  por terreno em vez de um polígono por célula (#573: DOM enxuto no gesto). */
function hexesPath(cells: { col: number; row: number }[]): string {
  return cells
    .map((c) => {
      const v = atlasHexVertices(c.col, c.row)
      return `M${v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`
    })
    .join('')
}

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
  const grupoMesa = useMesaGrupoPersistenteId()

  // Adoção + push do mapaAtlas com a mesa (hook compartilhado com a ficha do
  // grupo). `cfg` = jogador conectado lê a mesa; mestre/offline usa o local.
  const { cfg } = useMapaAtlasSync(mestre)

  // Viewer do gating: mestre PREVIEW por seletor; jogador = grupo persistente
  // da mesa; sem grupo → DEFAULT_VIEWER ("(sem grupo)").
  const [previewGrupo, setPreviewGrupo] = useState<string>(DEFAULT_VIEWER)
  const viewerGrupo = mestre ? previewGrupo : (grupoMesa ?? DEFAULT_VIEWER)
  const desabilitadas = useMemo(
    () => regioesDesabilitadas(cfg, viewerGrupo),
    [cfg, viewerGrupo],
  )

  // Feedback do mestre ("marcar sempre hex inteiro"): regiões desenhadas a
  // traço livre são normalizadas UMA vez pro contorno hex-alinhado no load do
  // mestre; o push da mesa propaga o resultado.
  useEffect(() => {
    if (mestre) normalizeRegioesToHex()
  }, [mestre])

  // #420: HEXMAP do mundo — o mapeamento do Mundo Livre (lugares + áreas)
  // portado pela grade calibrada (seed mapa:mundo). Clique num hex mostra o
  // que existe ali, como no mapa da exploração.
  const hexMap = useHexMap(MAPA_MUNDO_ID)
  // #430: mestre empurra o mapa autorado pra mesa; jogador adota — o render
  // usa o store normal (hexMap) já sincronizado.
  useHexMapMundoSync(mestre)
  const [hexSel, setHexSel] = useState<AtlasHexCell | null>(null)

  // ── Autoria (Modo Mestre) ────────────────────────────────────────────────
  const [modo, setModo] = useState<ModoMestre>('nav')
  const [vertices, setVertices] = useState<MapaPonto[]>([])
  const [nomeRegiao, setNomeRegiao] = useState('')
  /** Região em EDIÇÃO por pintura (feedback: "adicionar novos hex"). */
  const [editRegiaoId, setEditRegiaoId] = useState<string | null>(null)
  /** Doc do Atlas em edição no MAPA (hierarquia): lugar pontual ou área. */
  const [alvoDoc, setAlvoDoc] = useState<string | null>(null)
  // TERRENO (viagem do hexcrawl, 2026-10-04): só quando o Contexto-Def do
  // mundo declara `viagem` (Fantasia). Pincel = chave do terreno; null = limpar.
  const viagemCfg = activeContextoDef()?.viagem ?? null
  const [pincel, setPincel] = useState<string | null>(() => viagemCfg?.terrenos[0]?.chave ?? null)
  const [lacoTerreno, setLacoTerreno] = useState(false)
  const terrenoPaths = useMemo(() => {
    if (!viagemCfg) return []
    return viagemCfg.terrenos
      .map((t) => ({ t, cells: hexMap.cells.filter((c) => c.terreno === t.chave) }))
      .filter((x) => x.cells.length > 0)
      .map((x) => ({ chave: x.t.chave, cor: x.t.cor ?? 'var(--muted)', d: hexesPath(x.cells) }))
  }, [viagemCfg, hexMap.cells])

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

  // #572: atlas 7440×5262 px — versão MÉDIA (ver mapa-src)

  const imagemMapa = useSrcDoMapa(mapEntry)

  const overlayEntry = assets ? resolveAsset(assets, ATLAS_OVERLAY_ASSET) : null
  const imagemOverlay = useSrcDoMapa(overlayEntry)
  // #573: mapa + overlay das regiões desabilitadas ASSADOS num bitmap só —
  // o SVG transformado fica só com vetor (no Gecko o <image> clipado era
  // re-rasterizado a cada quadro do gesto). Enquanto não está pronto, o
  // overlay em SVG abaixo continua cobrindo.
  const aneisDesabilitados = useMemo(
    () => desabilitadas.flatMap((r) => r.aneis ?? [r.pontos]),
    [desabilitadas],
  )
  const mapaDebug = useMapaDebug()
  const assado = useMapaAssado({
    srcMapa: mapEntry ? (imagemMapa.src ?? assetUrl(mapEntry)) : null,
    srcOverlay: overlayEntry ? (imagemOverlay.src ?? assetUrl(overlayEntry)) : null,
    fonteW: ATLAS_MAPA_W,
    fonteH: ATLAS_MAPA_H,
    aneis: aneisDesabilitados,
    ativo: !!overlayEntry && desabilitadas.length > 0 && mapaDebug.assar,
  })
  // Anti-spoiler por construção (camadas-overlay): base escondido até o
  // overlay carregar; SVG só sai quando o assado já está na tela.
  const camadas = useCamadasOverlay({
    precisaOverlay: !!overlayEntry && desabilitadas.length > 0,
    srcBase: mapEntry ? (imagemMapa.src ?? assetUrl(mapEntry)) : null,
    srcOverlay: overlayEntry ? (imagemOverlay.src ?? assetUrl(overlayEntry)) : null,
    srcAssado: assado.src,
    exigirAssado: mapaDebug.assar,
  })
  const preparandoMapa = !!overlayEntry && desabilitadas.length > 0 && !camadas.estado.imgVisivel

  /** Clique no mapa em px da FONTE (suprimido após arraste/pinça). */
  const onMapClick = (e: React.MouseEvent) => {
    if (map.consumeMoved()) return
    const f = map.fracAtClient(e.clientX, e.clientY)
    if (!f) return
    const p = { x: Math.round(f.fx * ATLAS_MAPA_W), y: Math.round(f.fy * ATLAS_MAPA_H) }
    if (mestre && (modo === 'regiao' || (modo === 'terreno' && lacoTerreno))) {
      setVertices((v) => [...v, p])
      return
    }
    const hex = atlasFracToHex(f.fx, f.fy)
    if (mestre && modo === 'terreno') {
      setHexTerrenoBulk(MAPA_MUNDO_ID, [hex], pincel)
      return
    }
    if (mestre && modo === 'hexes' && editRegiaoId) {
      // PINTURA: toca pra ligar/desligar o hex na região em edição.
      toggleRegiaoHex(editRegiaoId, hex)
      return
    }
    if (mestre && modo === 'hex-lugar' && alvoDoc) {
      // LUGAR pontual (hierarquia do Atlas): o toque DEFINE/MOVE o hex do doc
      // — semântica do editor do Mundo Livre (um lugar, um hex; remover o
      // antigo preserva as áreas dele).
      const atual = cellsByLocal(hexMap.cells).get(alvoDoc)
      if (atual) removeHex(MAPA_MUNDO_ID, atual.col, atual.row)
      setHexLocal(MAPA_MUNDO_ID, hex.col, hex.row, alvoDoc)
      return
    }
    if (mestre && modo === 'hex-area' && alvoDoc) {
      // ÁREA (hierarquia): toque liga/desliga o hex na área — multi-membership
      // preservada (#82), como no editor do Mundo Livre.
      if (hexHasArea(hexMap.cells, hex.col, hex.row, alvoDoc)) {
        removeHexArea(MAPA_MUNDO_ID, hex.col, hex.row, alvoDoc)
      } else {
        setHexArea(MAPA_MUNDO_ID, hex.col, hex.row, alvoDoc)
      }
      return
    }
    // Modo navegação: clique abre a INFO do hex ("ver a respeito de cada
    // hex") — exceto em região DESABILITADA: nada clicável/sem informação.
    if (hexEmRegioes(hex, desabilitadas)) {
      setHexSel(null)
      return
    }
    const cel = cellAt(hexMap.cells, hex.col, hex.row)
    const areas = areasAt(hexMap.cells, hex.col, hex.row)
    setHexSel(cel?.localId || areas.length ? hex : null)
  }

  const concluirRegiao = () => {
    if (addRegiao(nomeRegiao, vertices)) {
      setVertices([])
      setNomeRegiao('')
      setModo('nav')
    }
  }

  // Feedback do mestre: lugar clicado abre nos DETALHES da barra direita
  // (mesmo caminho da exploração, PanelExploracao:1005); sem provider de
  // detalhes (ex.: teste isolado), navega — padrão do DetailLink.
  const detail = useDetail()
  const abrirDoc = (id: string) => {
    if (detail) detail.open({ kind: 'doc', id })
    else navigate(docPath(id))
  }
  const abrirPin = (localId: string) => {
    if (map.consumeMoved()) return
    abrirDoc(localId)
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
                src={camadas.estado.imgSrc ?? assetUrl(mapEntry)}
                onError={assado.src ? undefined : imagemMapa.onError}
                onLoad={(e) => camadas.onImgLoad(e.currentTarget.currentSrc || e.currentTarget.src)}
                data-mapa-assado={!camadas.estado.mostrarOverlaySvg && assado.src ? '' : undefined}
                alt="Mapa do mundo"
                draggable={false}
                style={{ height: '100%', width: 'auto', display: 'block', visibility: camadas.estado.imgVisivel ? 'visible' : 'hidden' }}
              />
              {/* Camadas em px da FONTE — escalam junto com o transform. */}
              <svg
                viewBox={`0 0 ${ATLAS_MAPA_W} ${ATLAS_MAPA_H}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                {/* Overlay CLIPADO nas regiões desabilitadas do viewer — "o
                    mapa de overlay estará por cima" só onde o GM desabilitou. */}
                {overlayEntry && camadas.estado.mostrarOverlaySvg ? (
                  <>
                    <defs>
                      <clipPath id="mapa-regioes-off">
                        {desabilitadas.flatMap((r) =>
                          (r.aneis ?? [r.pontos]).map((anel, i) => (
                            <polygon
                              key={`${r.id}:${i}`}
                              points={anel.map((p) => `${p.x},${p.y}`).join(' ')}
                            />
                          )),
                        )}
                      </clipPath>
                    </defs>
                    <image
                      data-overlay-desabilitado=""
                      href={imagemOverlay.src ?? assetUrl(overlayEntry)}
                      onError={imagemOverlay.onError}
                      onLoad={camadas.onOverlayLoad}
                      x={0}
                      y={0}
                      width={ATLAS_MAPA_W}
                      height={ATLAS_MAPA_H}
                      clipPath="url(#mapa-regioes-off)"
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                ) : null}
                {/* Contornos das regiões — SÓ no Modo Mestre (autoria).
                    Feedback do mestre: borda QUASE TRANSPARENTE (sem cor de
                    destaque) — o contorno hex-alinhado já se apoia na malha. */}
                {mestre
                  ? cfg.regioes.flatMap((r) =>
                      (r.aneis ?? [r.pontos]).map((anel, i) => (
                        <polygon
                          key={`${r.id}:${i}`}
                          points={anel.map((p) => `${p.x},${p.y}`).join(' ')}
                          fill={
                            editRegiaoId === r.id && modo === 'hexes'
                              ? 'color-mix(in srgb,var(--accent) 14%,transparent)'
                              : 'none'
                          }
                          stroke={
                            editRegiaoId === r.id && modo === 'hexes'
                              ? 'color-mix(in srgb,var(--accent) 55%,transparent)'
                              : 'rgba(120,120,120,0.18)'
                          }
                          strokeWidth={4}
                          style={{ pointerEvents: 'none' }}
                        />
                      )),
                    )
                  : null}
                {/* TERRENOS pintados — tinta leve por terreno, só no modo
                    TERRENO do mestre (cor vem da config `viagem`). */}
                {mestre && modo === 'terreno'
                  ? terrenoPaths.map((tp) => (
                      <path
                        key={`terreno:${tp.chave}`}
                        data-terreno-tinta={tp.chave}
                        d={tp.d}
                        fill={tp.cor}
                        fillOpacity={0.32}
                        stroke={tp.cor}
                        strokeOpacity={0.6}
                        strokeWidth={2}
                        style={{ pointerEvents: 'none' }}
                      />
                    ))
                  : null}
                {/* Hex SELECIONADO (info aberta) — realce discreto. */}
                {hexSel ? (
                  <polygon
                    data-hex-selecionado=""
                    points={atlasHexPolygonPoints(hexSel.col, hexSel.row)}
                    fill="color-mix(in srgb,var(--accent) 22%,transparent)"
                    stroke="var(--accent)"
                    strokeWidth={4}
                    style={{ pointerEvents: 'none' }}
                  />
                ) : null}
                {/* Feedback da edição pela HIERARQUIA: hex atual do LUGAR em
                    definição / contorno da ÁREA em pintura. */}
                {mestre && modo === 'hex-lugar' && alvoDoc
                  ? (() => {
                      const c = cellsByLocal(hexMap.cells).get(alvoDoc)
                      return c ? (
                        <polygon
                          data-hex-lugar-atual=""
                          points={atlasHexPolygonPoints(c.col, c.row)}
                          fill="color-mix(in srgb,var(--blue) 30%,transparent)"
                          stroke="var(--blue)"
                          strokeWidth={5}
                          style={{ pointerEvents: 'none' }}
                        />
                      ) : null
                    })()
                  : null}
                {mestre && modo === 'hex-area' && alvoDoc
                  ? outlineRingsFromCells(cellsOfArea(hexMap.cells, alvoDoc)).map((anel, i) => (
                      <polygon
                        key={`area-edit:${i}`}
                        data-area-em-edicao=""
                        points={anel.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="color-mix(in srgb,var(--blue) 16%,transparent)"
                        stroke="var(--blue)"
                        strokeWidth={4}
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
              </svg>
            </div>
          </div>
        ) : (
          <div style={{ padding: '48px 16px', textAlign: 'center', ...mono9, fontSize: 12 }}>
            mapa indisponível no vault-data
          </div>
        )}
        <MapControls map={map} />
        {preparandoMapa ? <AvisoPreparandoMapa /> : null}
        {/* Barra de INFO do hex — PRIMEIRO o que está NESTE hex (a cidade que
            mora só ali, cor de destaque), depois as áreas/região que o
            englobam. Componente compartilhado com a exploração dos grupos
            (map/HexInfoBar). Clique em região desabilitada nunca chega aqui. */}
        {hexSel ? (
          <HexInfoBar
            cells={hexMap.cells}
            col={hexSel.col}
            row={hexSel.row}
            onOpenDoc={abrirDoc}
            onClose={() => setHexSel(null)}
          />
        ) : null}
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
            <button
              style={pillStyle(modo === 'nav')}
              onClick={() => {
                if (modo === 'terreno') setVertices([])
                setModo('nav')
                setLacoTerreno(false)
              }}
            >
              ✋ NAVEGAR
            </button>
            <button
              style={pillStyle(modo === 'regiao')}
              onClick={() => {
                if (modo === 'terreno') setVertices([])
                setModo('regiao')
                setLacoTerreno(false)
              }}
            >
              ⬡ MARCAR REGIÃO
            </button>
            {viagemCfg ? (
              <button
                data-modo-terreno=""
                style={pillStyle(modo === 'terreno')}
                onClick={() => {
                  setModo('terreno')
                  setVertices([])
                  setAlvoDoc(null)
                  setEditRegiaoId(null)
                }}
              >
                ⛰ TERRENO
              </button>
            ) : null}
          </div>

          {modo === 'terreno' && viagemCfg ? (
            <div data-pintor-terreno="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {viagemCfg.terrenos.map((t) => (
                  <button
                    key={t.chave}
                    data-pincel={t.chave}
                    aria-pressed={pincel === t.chave}
                    onClick={() => setPincel(t.chave)}
                    title={`Custo de movimento ×${t.custo}`}
                    style={{ ...pillStyle(pincel === t.chave), display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 10, height: 10, borderRadius: 2, background: t.cor ?? 'var(--muted)', flex: 'none' }}
                    />
                    {t.nome}
                  </button>
                ))}
                <button
                  data-pincel-limpar=""
                  aria-pressed={pincel === null}
                  onClick={() => setPincel(null)}
                  style={pillStyle(pincel === null)}
                >
                  ⌫ LIMPAR
                </button>
                <button
                  data-laco-terreno=""
                  aria-pressed={lacoTerreno}
                  onClick={() => {
                    setLacoTerreno((l) => !l)
                    setVertices([])
                  }}
                  style={pillStyle(lacoTerreno)}
                >
                  ◌ LAÇO
                </button>
              </div>
              <span style={mono9}>
                {lacoTerreno
                  ? vertices.length < 3
                    ? `Toque no mapa pra desenhar o contorno (${vertices.length}/3+ vértices)`
                    : `${vertices.length} vértices — preencha os hexes de dentro`
                  : 'Toque nos hexes pra pintar com o pincel escolhido'}
                {' · '}
                {pincel === null
                  ? 'pincel: limpar (volta ao padrão)'
                  : `pincel: ${viagemCfg.terrenos.find((t) => t.chave === pincel)?.nome ?? pincel}`}
              </span>
              {lacoTerreno ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    data-laco-preencher=""
                    style={pillStyle(false)}
                    disabled={vertices.length < 3}
                    onClick={() => {
                      setHexTerrenoBulk(MAPA_MUNDO_ID, cellsFromStroke(vertices), pincel)
                      setVertices([])
                    }}
                  >
                    ✓ PREENCHER
                  </button>
                  <button style={pillStyle(false)} onClick={() => setVertices([])}>
                    ↩ LIMPAR CONTORNO
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

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

          {modo === 'hexes' && editRegiaoId ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={mono9}>
                Toque nos hexes pra ADICIONAR/REMOVER da região “
                {cfg.regioes.find((r) => r.id === editRegiaoId)?.nome ?? ''}”
              </span>
              <button
                style={pillStyle(false)}
                onClick={() => {
                  setModo('nav')
                  setEditRegiaoId(null)
                }}
              >
                ✓ CONCLUIR EDIÇÃO
              </button>
            </div>
          ) : null}

          {(modo === 'hex-lugar' || modo === 'hex-area') && alvoDoc ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={mono9}>
                {modo === 'hex-lugar'
                  ? `Toque no hex onde fica “${nomeDe(alvoDoc)}” (toque de novo pra mover)`
                  : `Toque nos hexes pra pintar/despintar a área “${nomeDe(alvoDoc)}”`}
              </span>
              <button
                style={pillStyle(false)}
                onClick={() => {
                  setModo('nav')
                  setAlvoDoc(null)
                }}
              >
                ✓ CONCLUIR
              </button>
            </div>
          ) : null}

          {/* Habilitação POR GRUPO ("poderão ser habilitadas conforme o grupo").
              Pedido do mestre: esta seção se chama MAPAS. */}
          {cfg.regioes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...mono9, fontWeight: 700 }}>MAPAS</div>
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
                      {/* Report "não tem onde clicar": o glifo ✎ sem `color`
                          herdava o buttontext padrão (preto) e sumia no painel
                          escuro — vira pill visível com rótulo. */}
                      <button
                        aria-label={`Editar hexes de ${r.nome}`}
                        title="Adicionar/remover hexes desta região"
                        onClick={() => {
                          setEditRegiaoId(r.id)
                          setModo('hexes')
                          setVertices([])
                        }}
                        style={pillStyle(editRegiaoId === r.id && modo === 'hexes')}
                      >
                        ✎ EDITAR
                      </button>
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

          {/* Pins LEGADOS (o fluxo de lugar virou o hexmap da hierarquia). */}
          {cfg.pins.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ ...mono9, fontWeight: 700 }}>PINS LEGADOS</div>
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

          {/* Pedido do mestre: a HIERARQUIA COMPLETA do Atlas ("os locais e
              tudo mais, de forma hierárquica pra eu ver a lista de tudo") —
              cada item mostra se JÁ está definido no mapa (lugar/área do
              hexmap mapa:mundo) e edita direto: 📍 define/move o hex do
              lugar, ⬡ pinta a área — as capacidades do editor do Mundo
              Livre no mapa-múndi. */}
          <AtlasNoMapa
            hexCells={hexMap.cells}
            alvoDoc={modo === 'hex-lugar' || modo === 'hex-area' ? alvoDoc : null}
            modoAlvo={modo === 'hex-lugar' || modo === 'hex-area' ? modo : null}
            onDefinirLugar={(id) => {
              setAlvoDoc(id)
              setModo('hex-lugar')
              setEditRegiaoId(null)
              setVertices([])
            }}
            onPintarArea={(id) => {
              setAlvoDoc(id)
              setModo('hex-area')
              setEditRegiaoId(null)
              setVertices([])
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

/** Hierarquia do Atlas com o STATUS no mapa-múndi e edição por item. A árvore
 *  vem do FM Geolocalização (buildAtlasIndex — a mesma do AtlasNav). */
function AtlasNoMapa({
  hexCells,
  alvoDoc,
  modoAlvo,
  onDefinirLugar,
  onPintarArea,
}: {
  hexCells: HexMapCell[]
  alvoDoc: string | null
  modoAlvo: 'hex-lugar' | 'hex-area' | null
  onDefinirLugar: (id: string) => void
  onPintarArea: (id: string) => void
}) {
  const catalog = useCatalog()
  const localIds = useMemo(
    () => (catalog.docsByType.get(LOCALIZACAO_TYPE) ?? []).map((e) => e.id),
    [catalog],
  )
  const docs = useDocs(localIds)
  const arvore = useMemo(() => {
    if (!docs) return null
    const { parentOf, childrenOf } = buildAtlasIndex(docs.values(), catalog)
    const nameOf = (id: string) => catalog.entryById.get(id)?.basename ?? id.split('/').pop() ?? id
    const ordena = (ids: string[]) => ids.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR'))
    // Raiz = pai FORA do conjunto de Localização (Mundo Livre etc. apontam
    // Geolocalização → [[Atlas]], que é doc mas não é lugar).
    const ehLugar = new Set(localIds)
    const roots = ordena(localIds.filter((id) => !ehLugar.has(parentOf.get(id) ?? '')))
    return { childrenOf, nameOf, ordena, roots }
  }, [docs, catalog, localIds])
  const porLugar = useMemo(() => cellsByLocal(hexCells), [hexCells])

  if (!arvore) return null

  const linha = (id: string, nivel: number): React.ReactNode => {
    const doc = docs?.get(id)
    const tipo = typeof doc?.subtype === 'string' ? doc.subtype : ''
    const lugar = porLugar.get(id)
    const areaN = cellsOfArea(hexCells, id).length
    const definido = !!lugar || areaN > 0
    const filhos = arvore.ordena(arvore.childrenOf.get(id) ?? [])
    const emEdicao = alvoDoc === id
    return (
      <div key={id} data-atlas-item={id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            paddingLeft: nivel * 18,
            fontSize: 13,
          }}
        >
          <span
            data-status={definido ? 'definido' : 'faltando'}
            title={definido ? 'Definido no mapa' : 'AINDA FORA do mapa'}
            style={{ flex: 'none', fontSize: 11 }}
          >
            {definido ? '🟢' : '🔴'}
          </span>
          <span style={{ fontWeight: 600, color: emEdicao ? 'var(--blue)' : 'var(--text)' }}>
            {arvore.nameOf(id)}
          </span>
          {tipo ? <span style={{ ...mono9, fontSize: 8.5 }}>{tipo.toUpperCase()}</span> : null}
          <span style={mono9}>
            {lugar ? `📍 hex ${lugar.col},${lugar.row}` : ''}
            {lugar && areaN ? ' · ' : ''}
            {areaN ? `⬡ ${areaN} hexes` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button
            aria-label={`Definir lugar de ${arvore.nameOf(id)}`}
            title="Definir/mover o hex deste lugar no mapa"
            onClick={() => onDefinirLugar(id)}
            style={pillStyle(emEdicao && modoAlvo === 'hex-lugar')}
          >
            📍
          </button>
          <button
            aria-label={`Pintar área de ${arvore.nameOf(id)}`}
            title="Pintar/despintar os hexes da área deste lugar"
            onClick={() => onPintarArea(id)}
            style={pillStyle(emEdicao && modoAlvo === 'hex-area')}
          >
            ⬡
          </button>
        </div>
        {filhos.map((f) => linha(f, nivel + 1))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...mono9, fontWeight: 700 }}>ATLAS NO MAPA</div>
      <span style={mono9}>
        🟢 definido no mapa · 🔴 ainda fora — 📍 define o hex do lugar, ⬡ pinta a área
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 420, overflowY: 'auto' }}>
        {arvore.roots.map((id) => linha(id, 0))}
      </div>
    </div>
  )
}

/** Enquanto o bitmap com o overlay anti-spoiler não está na tela, o mapa
 *  fica escondido (nunca o base nu) — este aviso ocupa o lugar. */
export function AvisoPreparandoMapa() {
  return (
    <div
      data-mapa-preparando=""
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '.14em',
        color: 'var(--muted)',
      }}
    >
      PREPARANDO O MAPA…
    </div>
  )
}
