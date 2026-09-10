// MAPA DA LOCALIZAÇÃO (#519, extraído do LocationSheet em 2026-09-09) — o bloco
// ```leaflet``` da nota como visualizador com pan/pinça/zoom/tela cheia
// (useMapView/MapControls, os mesmos do mapa do mundo).
//
// Duas camadas de conteúdo, e as duas vêm da vault:
//
//  1. ÁREAS DE BAIRRO. Bairro não é pino: é a REGIÃO PINTADA do mapa (pedido
//     2026-09-09). O marcador `Bairro` semeia a cor (map/bairros-cor.ts), então
//     clicar em qualquer ponto do bairro abre a nota dele e passar o mouse
//     acende exatamente a mancha de cor. O nome do bairro fica onde o marcador
//     está — o autor escolheu aquele ponto. Bairro cuja cor não é região (o
//     Delta Radioativo, na água) segue como pino comum.
//  2. MARCADORES. Pontos de interesse com CAMADA POR ZOOM, a semântica do
//     obsidian-leaflet que a própria nota declara (Bairro com maxZoom aparece
//     afastado, PoI com minZoom só aproximado). Ícone por tipo no registro
//     map/leaflet-local; clicar abre a nota que o catálogo resolver.
//
// Posições em % dos bounds (lat cresce pra CIMA; top% = 1 − lat/latMax) e
// rótulos contra-escalam pra manter o tamanho na tela.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { docPath } from '../paths'
import { reskinName } from '../data/reskin'
import { useDetail } from '../data/detail-context'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex, assetUrl, resolveAsset } from '../data/assets'
import type { VaultDoc } from '../data/types'
import { leafletZoom, markerVisivel, markerGlyph } from './leaflet-local'
import { MapControls, fullscreenContainerStyle } from './MapControls'
import { useMapView, type MapView } from './useMapView'
import { bairroEmFracao, realceDaArea, type SementeBairro } from './bairros-cor'
import { distanciaAoVizinho, posicionarRotulos, rotuloCabe, type RotuloPosto } from './rotulos'
import { useIndiceBairros } from './bairros-imagem'

export type Leaflet = NonNullable<NonNullable<VaultDoc['locationBody']>['leaflet']>
export type MarcadorLeaflet = Leaflet['markers'][number]

/** clip-path de canto cortado do design. */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Realce da área sob o ponteiro: accent do tema em meio tom. */
const REALCE: readonly [number, number, number, number] = [255, 122, 0, 92]

/** Largura aproximada de um caractere do rótulo de bairro (mono 9.5px). */
const CHAR_PX = 6
/** Altura da caixa do rótulo de bairro, em px de tela. */
const ALTURA_ROTULO = 12
/** Espaço na tela (px) que o pino precisa ter à volta pro nome dele entrar.
 *  Não é a largura do nome inteiro: rótulo de mapa pode passar por cima do
 *  vizinho, o que não pode é virar parede de texto. Com 210 lugares na POA,
 *  isto faz o nome aparecer aos poucos conforme se aproxima. */
const FOLGA_NOME_PINO = 22
/** Raio (px de tela) em que o clique/ponteiro pega um marcador. */
const RAIO_CLIQUE = 22

/** Ponto de uma coordenada do bloco, em fração da imagem (0..1). */
export interface Enquadramento {
  latMax: number
  longMax: number
  /** (lat, long) do bloco → fração da imagem. */
  fracao: (p: { lat: number; long: number }) => { fx: number; fy: number }
}

export function enquadramento(leaflet: Leaflet): Enquadramento | null {
  if (!leaflet.bounds) return null
  const latMax = leaflet.bounds[1][0] - leaflet.bounds[0][0]
  const longMax = leaflet.bounds[1][1] - leaflet.bounds[0][1]
  if (!latMax || !longMax) return null
  return {
    latMax,
    longMax,
    fracao: (p) => ({ fx: p.long / longMax, fy: 1 - p.lat / latMax }),
  }
}

/** O que o `overlay` recebe pra desenhar por cima do mapa. */
export interface CamadaMapa extends Enquadramento {
  /** Escala atual do viewer — rótulo próprio deve contra-escalar por 1/escala. */
  escala: number
}

export function MapaLocal({
  leaflet,
  onMarker,
  marcadores,
  nomearMarcador,
  overlay,
  altura,
}: {
  leaflet: Leaflet
  /** Formato de Aventura (2026-09-05): a aventura reusa o viewer com markers
   *  que são REGISTROS da própria nota (não docs). Devolve true quando tratou
   *  o clique; senão cai no resolve do catálogo (abre a nota). */
  onMarker?: (nome: string) => boolean
  /** Quais marcadores entram no mapa. Recebe o marcador, se o gate de zoom da
   *  NOTA (minZoom/maxZoom) o deixaria passar e a escala DE TELA (px na tela ÷
   *  px da fonte); ausente = só o gate da nota. A aba TRANSPORTE ignora o gate
   *  e mostra as paradas da malha conforme a aproximação. */
  marcadores?: (
    m: MarcadorLeaflet,
    ctx: { gateDeZoom: boolean; escalaTela: number },
  ) => boolean
  /** Marcadores que mostram o NOME em qualquer zoom (a rota escolhida, a linha
   *  selecionada). Os outros só ganham nome quando o mapa está aproximado. */
  nomearMarcador?: (m: MarcadorLeaflet) => boolean
  /** Camada extra por cima do mapa, em coordenadas do bloco. */
  overlay?: (camada: CamadaMapa) => ReactNode
  /** Altura do viewport fora da tela cheia. */
  altura?: string
}) {
  const assets = useAssetIndex()
  const catalog = useCatalog()
  const detail = useDetail()
  const navigate = useNavigate()
  const map = useMapView()
  // O que está sob o ponteiro: a mancha do bairro segue acesa mesmo quando o
  // ponteiro cruza um pino (o chip é que troca pro nome do pino, que é o que o
  // clique abriria).
  const [realce, setRealce] = useState<string | null>(null)
  const [pinoSob, setPinoSob] = useState<string | null>(null)
  // Largura de LAYOUT da camada do mapa (sem o transform): com ela sai a
  // escala de tela real (px na tela ÷ px da fonte), que decide o que cabe de
  // rótulo. Sem medir, o mapa retrato desenhado a 0,48× parecia ter espaço.
  const [larguraNaTela, setLarguraNaTela] = useState(0)
  const entry = assets ? resolveAsset(assets, leaflet.image) : null
  const url = entry ? assetUrl(entry) : null
  useEffect(() => {
    const el = map.mapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setLarguraNaTela(e?.contentRect.width ?? 0))
    ro.observe(el)
    setLarguraNaTela(el.getBoundingClientRect().width)
    return () => ro.disconnect()
    // `url` como dep: no primeiro render o mapa ainda não montou (o índice de
    // assets está carregando) e o ref é nulo — sem isto o efeito media zero e
    // nunca mais rodava, e aí nenhum rótulo passava do teste de espaço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.mapRef, url])
  const quadro = enquadramento(leaflet)

  // SEMENTES das áreas: os marcadores `Bairro` do próprio bloco.
  const sementes = useMemo<SementeBairro[]>(() => {
    if (!quadro) return []
    return leaflet.markers
      .filter((m) => m.tipo === 'Bairro')
      .map((m) => ({ nome: m.nome, ...quadro.fracao(m) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaflet, quadro?.latMax, quadro?.longMax])
  const idxBairros = useIndiceBairros(url, sementes)
  const comArea = useMemo(
    () => new Set(idxBairros?.areas.map((a) => a.nome) ?? []),
    [idxBairros],
  )

  // px na tela por px da fonte, já com o zoom do viewer
  const escalaTela = idxBairros && larguraNaTela ? (larguraNaTela / idxBairros.largura) * map.view.scale : 0
  const zoom = leafletZoom(leaflet.defaultZoom ?? null, map.view.scale)
  const visiveis = leaflet.markers.filter((m) => {
    // bairro com área não vira pino: a mancha de cor + o nome são o bairro
    if (m.tipo === 'Bairro' && comArea.has(m.nome)) return false
    const gate = markerVisivel({ minZoom: m.minZoom ?? null, maxZoom: m.maxZoom ?? null }, zoom)
    return marcadores ? marcadores(m, { gateDeZoom: gate, escalaTela }) : gate
  })

  // O nome do pino só entra quando CABE: com 210 lugares no mapa da POA, os
  // vizinhos de rua ficam a ~5 px da fonte um do outro e afastado seriam
  // nomes empilhados. A régua é a mesma do rótulo de bairro — espaço
  // disponível (distância ao vizinho × escala de tela) contra o tamanho do
  // texto. Em cacho, ficam os ícones; o nome sai no chip do que está sob o
  // ponteiro (e no title nativo).
  // `visiveis` é um array novo a cada render (o filtro roda sempre), e a conta
  // é O(n²) com n=210: memoizar pela LISTA DE NOMES evita refazê-la a cada
  // movimento do ponteiro.
  const chaveVisiveis = visiveis.map((m) => m.nome).join('|')
  const vizinho = useMemo(
    () => distanciaAoVizinho(visiveis.map((m) => ({ nome: m.nome, x: m.long, y: m.lat }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveVisiveis],
  )

  // NOME DE BAIRRO: nenhum some (report 2026-09-10 — "no zoom out não tá
  // mostrando alguns nomes de bairros"). Quem não cabe na própria mancha sai
  // de lado e ganha um fio até ela; os bairros GRANDES entram primeiro na
  // fila, então ficam com o lugar de honra e quem se mexe é o miudinho do
  // centro. Medidas em px da FONTE: o texto na tela tem tamanho fixo, então a
  // caixa dele encolhe na fonte conforme se aproxima.
  const rotulosDeBairro = useMemo<RotuloPosto[]>(() => {
    if (!idxBairros || !quadro) return []
    const escala = escalaTela || idxBairros.largura / 620 // palpite antes de medir
    const porArea = new Map(idxBairros.areas.map((a) => [a.nome, a.px]))
    const pedidos = sementes
      .filter((s) => comArea.has(s.nome))
      .sort((a, b) => (porArea.get(b.nome) ?? 0) - (porArea.get(a.nome) ?? 0))
      .map((s) => ({
        nome: s.nome,
        x: s.fx * idxBairros.largura,
        y: s.fy * idxBairros.altura,
        largura: (reskinName(s.nome).length * CHAR_PX) / escala,
        altura: ALTURA_ROTULO / escala,
      }))
    return posicionarRotulos(pedidos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idxBairros, comArea, escalaTela, sementes])

  const abrir = (nome: string) => {
    if (onMarker?.(nome)) return
    const r = catalog.resolve(nome)
    if (r.kind !== 'doc') return
    if (detail) detail.open({ kind: 'doc', id: r.id })
    else navigate(docPath(r.id))
  }

  /** Fração da imagem sob um ponto do cliente, ou null fora do mapa. */
  const fracaoNoCliente = (clientX: number, clientY: number) => {
    const rect = map.mapRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    return fx < 0 || fy < 0 || fx > 1 || fy > 1 ? null : { fx, fy }
  }

  // Clique tratado no VIEWPORT com hit-test por coordenada (padrão do
  // onMapClick do mapa-múndi): o useMapView captura o ponteiro
  // (setPointerCapture), então o click sintetizado nunca chega no span do
  // marker — onClick no marker era código morto. Marcador tem precedência
  // sobre a área do bairro: o ponto é mais específico que a mancha.
  /** Marcador visível mais perto do ponteiro (dentro do raio de clique). */
  const marcadorSob = (clientX: number, clientY: number): string | null => {
    const rect = map.mapRef.current?.getBoundingClientRect()
    if (!rect?.width || !quadro) return null
    let melhor: string | null = null
    let melhorD = Infinity
    for (const m of visiveis) {
      const p = quadro.fracao(m)
      const mx = rect.left + p.fx * rect.width
      const my = rect.top + p.fy * rect.height
      // âncora é a BASE do marker (ícone+label ficam acima dela)
      const d = Math.hypot(mx - clientX, my - 10 - clientY)
      if (d < melhorD) {
        melhorD = d
        melhor = m.nome
      }
    }
    return melhorD <= RAIO_CLIQUE ? melhor : null
  }

  const onViewportClick = (e: React.MouseEvent) => {
    if (map.consumeMoved()) return
    const f = fracaoNoCliente(e.clientX, e.clientY)
    if (!f || !quadro) return
    const marcador = marcadorSob(e.clientX, e.clientY)
    if (marcador) {
      abrir(marcador)
      return
    }
    const bairro = idxBairros ? bairroEmFracao(idxBairros, f.fx, f.fy) : null
    if (bairro) abrir(bairro)
  }

  const onViewportMove = (e: React.PointerEvent) => {
    map.onPointerMove(e)
    if (map.dragging) return
    const f = fracaoNoCliente(e.clientX, e.clientY)
    if (!f) {
      setRealce(null)
      setPinoSob(null)
      return
    }
    // marcador tem precedência (é o que o clique abriria); senão, o bairro
    setPinoSob(marcadorSob(e.clientX, e.clientY))
    setRealce(idxBairros ? bairroEmFracao(idxBairros, f.fx, f.fy) : null)
  }

  if (!assets || !entry) return null
  return (
    <section
      ref={map.containerRef}
      data-mapa-local=""
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
        onPointerMove={onViewportMove}
        onPointerUp={map.onPointerUp}
        onPointerCancel={map.onPointerUp}
        onPointerLeave={() => {
          setRealce(null)
          setPinoSob(null)
        }}
        onClick={onViewportClick}
        style={{
          height: map.fullscreen ? '100%' : (altura ?? 'min(64vh, 560px)'),
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
          {idxBairros ? <RealceBairro idx={idxBairros} bairro={realce} /> : null}
          {quadro && overlay ? overlay({ ...quadro, escala: map.view.scale }) : null}
          {idxBairros
            ? rotulosDeBairro.map((r) => (
                <NomeDoBairro
                  key={r.nome}
                  rotulo={r}
                  largura={idxBairros.largura}
                  altura={idxBairros.altura}
                  escala={map.view.scale}
                  aceso={realce === r.nome}
                />
              ))
            : null}
          {idxBairros && rotulosDeBairro.some((r) => r.deslocado) ? (
            <FiosDosRotulos
              rotulos={rotulosDeBairro}
              largura={idxBairros.largura}
              altura={idxBairros.altura}
              escalaTela={escalaTela}
            />
          ) : null}
          {quadro
            ? visiveis.map((m) => {
                const p = quadro.fracao(m)
                return (
                  <Pino
                    key={`${m.tipo}|${m.nome}|${m.lat}|${m.long}`}
                    marcador={m}
                    fx={p.fx}
                    fy={p.fy}
                    escala={map.view.scale}
                    comNome={
                      (nomearMarcador?.(m) ?? false) ||
                      pinoSob === m.nome ||
                      rotuloCabe(vizinho.get(m.nome), escalaTela, FOLGA_NOME_PINO)
                    }
                  />
                )
              })
            : null}
        </div>
      </div>
      {pinoSob ?? realce ? (
        <span
          data-sob-ponteiro={pinoSob ?? realce ?? ''}
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            padding: '5px 10px',
            background: 'color-mix(in srgb,var(--panel) 92%,transparent)',
            border: '1px solid color-mix(in srgb,var(--accent) 55%,var(--line2))',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--text)',
            pointerEvents: 'none',
            clipPath: clip(6),
          }}
        >
          {reskinName(pinoSob ?? realce ?? '').toUpperCase()}
        </span>
      ) : null}
      <MapControls map={map} />
    </section>
  )
}

/** Mancha de cor do bairro sob o ponteiro, pixel a pixel — é a "marcação real
 *  das cores" do mapa, não um contorno aproximado. */
function RealceBairro({ idx, bairro }: { idx: ReturnType<typeof useIndiceBairros>; bairro: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !idx) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, idx.largura, idx.altura)
    if (!bairro) return
    const rgba = realceDaArea(idx, bairro, REALCE)
    if (!rgba) return
    const img = ctx.createImageData(idx.largura, idx.altura)
    img.data.set(rgba)
    ctx.putImageData(img, 0, 0)
  }, [idx, bairro])
  if (!idx) return null
  return (
    <canvas
      ref={ref}
      data-realce-bairro={bairro ?? ''}
      width={idx.largura}
      height={idx.altura}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

/** Fio ligando o rótulo deslocado à mancha dele. Sem isso, um nome fora da
 *  área vira nome órfão. */
function FiosDosRotulos({
  rotulos,
  largura,
  altura,
  escalaTela,
}: {
  rotulos: RotuloPosto[]
  largura: number
  altura: number
  escalaTela: number
}) {
  return (
    <svg
      data-fios-rotulo=""
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {rotulos
        .filter((r) => r.deslocado)
        .map((r) => (
          <line
            key={r.nome}
            data-fio={r.nome}
            x1={r.x}
            y1={r.y}
            x2={r.tx}
            y2={r.ty}
            stroke="#2b2b2b"
            strokeOpacity={0.55}
            strokeWidth={Math.max(0.4, 1 / (escalaTela || 1))}
          />
        ))}
    </svg>
  )
}

/** Nome do bairro — na mancha dele, ou ao lado (com fio) quando não cabe. */
function NomeDoBairro({
  rotulo,
  largura,
  altura,
  escala,
  aceso,
}: {
  rotulo: RotuloPosto
  largura: number
  altura: number
  escala: number
  aceso: boolean
}) {
  const nome = rotulo.nome
  return (
    <span
      data-area-bairro={nome}
      data-deslocado={rotulo.deslocado ? '' : undefined}
      title={nome}
      style={{
        position: 'absolute',
        left: `${(rotulo.tx / largura) * 100}%`,
        top: `${(rotulo.ty / altura) * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / escala})`,
        transformOrigin: '50% 50%',
        fontFamily: 'var(--mono)',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '.1em',
        whiteSpace: 'nowrap',
        color: aceso ? '#111' : '#2b2b2b',
        // rótulo de mapa de papel: tinta escura com halo claro (a mesma
        // convenção do mapa da malha), legível sobre os pastéis das regiões
        textShadow:
          '0 0 3px rgba(255,255,255,.95), 0 0 3px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.8)',
        pointerEvents: 'none',
      }}
    >
      {reskinName(nome).toUpperCase()}
    </span>
  )
}

/** Pino de um marcador: glifo do tipo + nome, contra-escalados. */
function Pino({
  marcador,
  fx,
  fy,
  escala,
  comNome,
}: {
  marcador: MarcadorLeaflet
  fx: number
  fy: number
  escala: number
  comNome: boolean
}) {
  return (
    <span
      data-marker={marcador.nome}
      title={`${marcador.tipo}: ${reskinName(marcador.nome)}`}
      style={{
        position: 'absolute',
        left: `${fx * 100}%`,
        top: `${fy * 100}%`,
        transform: `translate(-50%, -100%) scale(${1 / escala})`,
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
        {markerGlyph(marcador.tipo).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      {comNome ? (
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
          {reskinName(marcador.nome)}
        </span>
      ) : null}
    </span>
  )
}

export type { MapView }
