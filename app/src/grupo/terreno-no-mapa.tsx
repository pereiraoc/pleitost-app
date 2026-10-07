// TERRENO NO MAPA (2026-10-07) — peças do terreno do mundo sobre um mapa do
// atlas, compartilhadas entre o Atlas (Compêndio) e a Exploração do grupo:
//   • MODIFICADORES (pra todos): toggle por aparelho + marcas por classe
//     (bitmap assado; paths no SVG enquanto assa — #573) + legenda;
//   • PINTOR DE TERRENO (Modo Dev, SÓ no Atlas — "é lá que definimos o
//     mundo"): pincéis da config, traço acumulado num ref (preview por
//     setAttribute, sem re-render por pointermove) e UM rascunho local por
//     traço. Botão esquerdo/dedo pinta; botão do meio (ou outro que não o
//     principal) segue pro pan do mapa.
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clip } from '../components/ficha/bits'
import { btnStyle as mapBtnStyle } from '../map/MapControls'
import { hexLine, type ViagemCfg } from './viagem'
import {
  gravarTracoTerreno,
  hexesPath,
  marcaDeLinha,
  marcaPath,
  marcasDoMapa,
  pontosPath,
  type AreaFonte,
  type CamadaTerreno,
  type MarcaMapa,
  type TerrenoMundo,
} from './terreno-mundo'
import { useMarcasAssadas } from './marcas-assadas'

/** Pill mono do design (mesma skin da Exploração). */
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

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

const CHAVE_MODIFICADORES = 'pleitost.exploracao.modificadores'
export const SEM_MARCAS: MarcaMapa[] = []

/** Toggle dos modificadores: por APARELHO (localStorage; sem storage = desligado). */
function lerModificadores(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_MODIFICADORES) === '1'
  } catch {
    return false
  }
}
function gravarModificadores(v: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_MODIFICADORES, v ? '1' : '0')
  } catch {
    /* storage bloqueado: fica só nesta sessão */
  }
}

/** Pintura de uma classe de marca: forma de LINHA (onda, degrau) = traço
 *  escurecido da cor da config; forma CHEIA = cor da config com contorno
 *  escuro fino (legível sobre o pergaminho e sobre o mar). Traço em px da
 *  FONTE (sem non-scaling-stroke): o zoom da camada é transform CSS, que
 *  engrossaria um traço "fixo" até a marca virar borrão — assim a marca
 *  inteira escala junto, sempre na mesma proporção. */
export function estiloMarca(m: Pick<MarcaMapa, 'forma' | 'cor'>): React.SVGProps<SVGPathElement> {
  return marcaDeLinha(m.forma)
    ? {
        fill: 'none',
        stroke: `color-mix(in srgb,${m.cor} 55%,#000)`,
        strokeWidth: 2.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }
    : { fill: m.cor, stroke: 'rgba(0,0,0,.6)', strokeWidth: 1.2, strokeLinejoin: 'round' }
}

/** Ícone do botão: um ▲ sobre uma onda. */
export function IconModificadores() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M4 8 7 3l3 5Z" />
      <path d="M2 12.5q1.5-2 3 0t3 0 3 0 3 0" />
    </svg>
  )
}

/** Legenda (rótulo mono + a própria marca), nomes da config; abaixo dos
 *  controles do mapa. */
export function LegendaModificadores({ marcas }: { marcas: MarcaMapa[] }) {
  return (
    <div
      data-modificadores-legenda=""
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 58,
        right: 14,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '6px 8px',
        background: 'color-mix(in srgb,var(--panel) 90%,transparent)',
        border: '1px solid var(--line2)',
        clipPath: clip(6),
        pointerEvents: 'auto',
      }}
    >
      {marcas.map((m) => (
        <span
          key={m.classe}
          data-modificadores-item={m.classe}
          style={{ ...fieldLabelStyle, fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <svg width={22} height={16} viewBox="-21 -24 42 30" aria-hidden style={{ flex: 'none', overflow: 'visible' }}>
            <path
              d={marcaPath(m.forma, 0, m.camada === 'rotas' ? -24 : 0)}
              {...estiloMarca(m)}
            />
          </svg>
          {m.nome}
        </span>
      ))}
    </div>
  )
}

/** Pincel do pintor: a CAMADA (terreno-base ou rotas) + a chave (null =
 *  limpar aquela camada). */
export interface Pincel {
  camada: CamadaTerreno
  chave: string | null
}

/** Barra do PINTOR DE TERRENO (Modo Dev): toggle + um pincel por terreno da
 *  config (amostra de cor + nome) + Limpar; e, numa linha separada, os
 *  pincéis da camada de ROTAS (estrada, rota marítima) + Limpar rota.
 *  Sobreposta ao mapa (vale também em tela cheia). Grava rascunho LOCAL —
 *  publicar/exportar é na Config. */
export function PintorTerreno({
  cfg,
  ligado,
  onToggle,
  pincel,
  onPincel,
}: {
  cfg: ViagemCfg
  ligado: boolean
  onToggle: () => void
  pincel: Pincel
  onPincel: (p: Pincel) => void
}) {
  const on = (camada: CamadaTerreno, chave: string | null) => pincel.camada === camada && pincel.chave === chave
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 4,
        maxWidth: 'calc(100% - 90px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <button
        data-pintor-terreno-toggle=""
        aria-pressed={ligado}
        onClick={onToggle}
        style={{ ...pillStyle(ligado), padding: '5px 10px', fontSize: 10 }}
      >
        ✎ TERRENO
      </button>
      {ligado ? (
        <div
          data-pintor-terreno=""
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 10px',
            background: 'color-mix(in srgb,var(--panel) 92%,transparent)',
            border: '1px solid var(--line2)',
            clipPath: clip(8),
          }}
        >
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {cfg.terrenos.map((t) => (
              <button
                key={t.chave}
                data-pincel={t.chave}
                aria-pressed={on('terreno', t.chave)}
                aria-label={t.nome}
                title={`Custo de movimento ×${t.custo}`}
                onClick={() => onPincel({ camada: 'terreno', chave: t.chave })}
                style={{ ...pillStyle(on('terreno', t.chave)), padding: '3px 8px', fontSize: 9.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <span
                  aria-hidden
                  style={{ width: 9, height: 9, borderRadius: 2, background: t.cor ?? 'var(--muted)', flex: 'none' }}
                />
                {t.nome}
              </button>
            ))}
            <button
              data-pincel-limpar=""
              aria-pressed={on('terreno', null)}
              onClick={() => onPincel({ camada: 'terreno', chave: null })}
              style={{ ...pillStyle(on('terreno', null)), padding: '3px 8px', fontSize: 9.5 }}
            >
              ⌫ Limpar
            </button>
          </div>
          {cfg.rotas?.length ? (
            <div data-pintor-rotas="" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {cfg.rotas.map((r) => (
                <button
                  key={r.chave}
                  data-pincel-rota={r.chave}
                  aria-pressed={on('rotas', r.chave)}
                  aria-label={r.nome}
                  title={`Rota: +${r.bonus} hex/dia pra ${r.meios.join(', ')}`}
                  onClick={() => onPincel({ camada: 'rotas', chave: r.chave })}
                  style={{ ...pillStyle(on('rotas', r.chave)), padding: '3px 8px', fontSize: 9.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span
                    aria-hidden
                    style={{ width: 7, height: 7, borderRadius: '50%', background: r.cor ?? 'var(--muted)', border: '1px solid var(--line2)', flex: 'none' }}
                  />
                  {r.nome}
                </button>
              ))}
              <button
                data-pincel-rota-limpar=""
                aria-pressed={on('rotas', null)}
                onClick={() => onPincel({ camada: 'rotas', chave: null })}
                style={{ ...pillStyle(on('rotas', null)), padding: '3px 8px', fontSize: 9.5 }}
              >
                ⌫ Limpar rota
              </button>
            </div>
          ) : null}
          <span style={{ ...fieldLabelStyle, fontSize: 9 }}>
            arraste pra pintar · botão do meio move o mapa · rascunho local — publique em Config › Modo Dev
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ── MODIFICADORES ────────────────────────────────────────────────────────────

export interface Modificadores {
  ligado: boolean
  alternar: () => void
  /** Marcas da área (memoizadas: mesma referência = mesmo conteúdo). */
  marcas: MarcaMapa[]
  /** blob: do bitmap assado (null enquanto assa / sem canvas). */
  src: string | null
}

/** Estado + marcas dos modificadores pra uma `area` (px da fonte; passar
 *  objeto estável). */
export function useModificadores(cfg: ViagemCfg | null, terreno: TerrenoMundo, area: AreaFonte): Modificadores {
  const [ligado, setLigado] = useState(lerModificadores)
  const marcas = useMemo(
    () => (ligado && cfg ? marcasDoMapa(terreno.indice, terreno.indiceRotas, cfg, area) : SEM_MARCAS),
    [ligado, cfg, terreno.indice, terreno.indiceRotas, area],
  )
  const src = useMarcasAssadas(marcas, area)
  const alternar = useCallback(
    () =>
      setLigado((v) => {
        gravarModificadores(!v)
        return !v
      }),
    [],
  )
  return { ligado, alternar, marcas, src }
}

/** Botão dos controles do mapa (MapControls `extra`). */
export function BotaoModificadores({ ligado, onClick }: { ligado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-modificadores-toggle=""
      aria-pressed={ligado}
      aria-label="Mostrar modificadores do mapa"
      title="Mostrar modificadores do mapa"
      onClick={onClick}
      style={{
        ...mapBtnStyle,
        ...(ligado ? { background: 'color-mix(in srgb,var(--accent) 22%,var(--panel))', borderColor: 'var(--accent)' } : {}),
      }}
    >
      <IconModificadores />
    </button>
  )
}

/** Bitmap das marcas, cobrindo a camada transformada (irmão do <img> do mapa). */
export function MarcasAssadasImg({ src }: { src: string | null }) {
  return src ? (
    <img
      data-marcas-assadas=""
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  ) : null
}

/** Marcas em <path> (dentro do SVG em px da fonte) enquanto o bitmap não fica pronto. */
export function MarcasSvg({ mod }: { mod: Modificadores }) {
  return (
    <>
      {(mod.src ? SEM_MARCAS : mod.marcas).map((m) => (
        <path key={m.classe} data-marca-mapa={m.classe} d={m.d} {...estiloMarca(m)} />
      ))}
    </>
  )
}

// ── PINTOR ───────────────────────────────────────────────────────────────────

type Celula = { col: number; row: number }

export interface PintorApi {
  /** Modo Dev + viagem na config + nota de terreno carregada. */
  pode: boolean
  ligado: boolean
  alternar: () => void
  pincel: Pincel
  setPincel: (p: Pincel) => void
  /** true = o evento foi do pintor (quem chama não faz pan/clique). */
  onPointerDown: (e: React.PointerEvent) => boolean
  onPointerMove: (e: React.PointerEvent) => boolean
  onPointerUp: (e: React.PointerEvent) => boolean
  tintas: { chave: string; cor: string; d: string }[]
  tintasRotas: { chave: string; cor: string; d: string }[]
  corPincel: string
  tracoPathRef: React.MutableRefObject<SVGPathElement | null>
}

export function usePintorTerreno({
  cfg,
  terreno,
  desenvolvedor,
  hexAtClient,
}: {
  cfg: ViagemCfg | null
  terreno: TerrenoMundo
  desenvolvedor: boolean
  hexAtClient: (clientX: number, clientY: number) => Celula | null
}): PintorApi {
  const pode = desenvolvedor && !!cfg && !!terreno.doc
  const [pintando, setPintando] = useState(false)
  const ligado = pintando && pode
  const [pincel, setPincel] = useState<Pincel>(() => ({
    camada: 'terreno',
    chave: cfg?.terrenos.find((t) => t.chave !== cfg.padrao)?.chave ?? null,
  }))
  const tracoRef = useRef<{ pointerId: number; cells: Map<string, Celula>; last: Celula | null; d: string } | null>(null)
  const tracoPathRef = useRef<SVGPathElement | null>(null)
  const hexAt = useRef(hexAtClient)
  hexAt.current = hexAtClient
  const corPincel =
    (pincel.chave &&
      (pincel.camada === 'rotas'
        ? cfg?.rotas?.find((r) => r.chave === pincel.chave)?.cor
        : cfg?.terrenos.find((t) => t.chave === pincel.chave)?.cor)) ||
    'var(--muted)'

  const tintas = useMemo(() => {
    if (!ligado || !cfg) return []
    const porChave = agrupar(terreno.indice)
    return cfg.terrenos
      .filter((t) => porChave.has(t.chave))
      .map((t) => ({ chave: t.chave, cor: t.cor ?? 'var(--muted)', d: hexesPath(porChave.get(t.chave)!) }))
  }, [ligado, cfg, terreno.indice])
  // camada de ROTAS: um ponto por hex (por cima da tinta do terreno)
  const tintasRotas = useMemo(() => {
    if (!ligado || !cfg?.rotas) return []
    const porChave = agrupar(terreno.indiceRotas)
    return cfg.rotas
      .filter((r) => porChave.has(r.chave))
      .map((r) => ({ chave: r.chave, cor: r.cor ?? 'var(--muted)', d: pontosPath(porChave.get(r.chave)!) }))
  }, [ligado, cfg, terreno.indiceRotas])

  const tracarAte = (cell: Celula | null) => {
    const t = tracoRef.current
    if (!t || !cell) return
    if (t.last && t.last.col === cell.col && t.last.row === cell.row) return
    // ponteiro rápido pula hexes: liga pela linha hex (sem buracos no traço)
    const linha = t.last ? hexLine(t.last, cell).slice(1) : [cell]
    let novo = ''
    for (const c of linha) {
      const k = `${c.col},${c.row}`
      if (t.cells.has(k)) continue
      t.cells.set(k, { col: c.col, row: c.row })
      novo += hexesPath([c])
    }
    t.last = cell
    if (novo) {
      t.d += novo
      tracoPathRef.current?.setAttribute('d', t.d)
    }
  }

  const onPointerDown = (e: React.PointerEvent): boolean => {
    if (!ligado) return false
    // só o botão PRINCIPAL pinta; o do meio (e os demais) arrastam o mapa
    if (e.button !== 0) return false
    if (tracoRef.current) return true // 2º dedo durante o traço: ignora
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    tracoRef.current = { pointerId: e.pointerId, cells: new Map(), last: null, d: '' }
    tracarAte(hexAt.current(e.clientX, e.clientY))
    return true
  }
  const onPointerMove = (e: React.PointerEvent): boolean => {
    const t = tracoRef.current
    if (!t) return false
    if (e.pointerId === t.pointerId) tracarAte(hexAt.current(e.clientX, e.clientY))
    return true
  }
  const onPointerUp = (e: React.PointerEvent): boolean => {
    const t = tracoRef.current
    if (!t) return false
    if (t.pointerId !== e.pointerId) return true
    tracarAte(hexAt.current(e.clientX, e.clientY))
    tracoRef.current = null
    tracoPathRef.current?.setAttribute('d', '')
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    if (terreno.doc && cfg) gravarTracoTerreno(terreno.doc, [...t.cells.values()], pincel.chave, cfg, pincel.camada)
    return true
  }

  return {
    pode,
    ligado,
    alternar: () => setPintando((p) => !p),
    pincel,
    setPincel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    tintas,
    tintasRotas,
    corPincel,
    tracoPathRef,
  }
}

function agrupar(indice: Map<string, string>): Map<string, Celula[]> {
  const porChave = new Map<string, Celula[]>()
  for (const [hex, chave] of indice) {
    const [col, row] = hex.split(',').map(Number) as [number, number]
    if (!porChave.has(chave)) porChave.set(chave, [])
    porChave.get(chave)!.push({ col, row })
  }
  return porChave
}

/** Tintas do terreno + rotas + o traço em andamento (dentro do SVG em px da
 *  fonte; um path por chave = DOM enxuto no gesto). */
export function CamadaPintor({ pintor }: { pintor: PintorApi }) {
  if (!pintor.ligado) return null
  const { pincel, corPincel } = pintor
  return (
    <>
      {pintor.tintas.map((tp) => (
        <path
          key={`terreno:${tp.chave}`}
          data-terreno-tinta={tp.chave}
          d={tp.d}
          fill={tp.cor}
          fillOpacity={0.32}
          stroke={tp.cor}
          strokeOpacity={0.6}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {pintor.tintasRotas.map((tp) => (
        <path
          key={`rota:${tp.chave}`}
          data-rota-tinta={tp.chave}
          d={tp.d}
          fill={tp.cor}
          fillOpacity={0.9}
          stroke="#000"
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        ref={pintor.tracoPathRef}
        data-terreno-traco=""
        d=""
        fill={pincel.chave && pincel.camada === 'terreno' ? corPincel : 'transparent'}
        fillOpacity={0.5}
        stroke={pincel.chave ? corPincel : 'var(--text)'}
        strokeDasharray={pincel.chave && pincel.camada === 'terreno' ? undefined : '4 3'}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

/** Firefox abre a rolagem automática no mousedown do botão do meio — o pan
 *  do mapa usa esse botão, então o viewport cancela o padrão. */
export function semAutoScroll(e: React.MouseEvent) {
  if (e.button === 1) e.preventDefault()
}
