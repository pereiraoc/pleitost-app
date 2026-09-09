// MAPA ESQUEMÁTICO da malha (2026-09-08) — SVG estilo mapa de metrô: um path
// por linha (cor/traço da vault), bolinha por parada (branca com anel escuro =
// baldeação; anel na cor da linha = parada simples), rótulos inclinados onde
// há vizinha na mesma fileira. Só desenha o que `desenharMalha` projetou.
// PALETA FIXA de papel (report 2026-09-08: no tema escuro as cores das linhas
// e os nomes sumiam) — mapa de metrô é peça impressa, não segue o tema.
// VIEWPORT compartilhada (useMapView/MapControls, a mesma dos mapas de
// Localização): escala 1 = o mapa inteiro cabe na janela ("TUDO"); pan,
// pinça, roda, +/− e tela cheia. O clique é hit-test por coordenada no
// viewport (o hook captura o ponteiro; o onClick dos filhos nunca dispara).
import { useState, type CSSProperties } from 'react'
import { corVisivel, type Desenho, type Traco, type ZonaBairro } from '../../transporte/malha'
import { useTheme } from '../../theme'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'
import { useMapView } from '../../map/useMapView'

const DASH: Record<Traco, string | undefined> = { cheio: undefined, tracejado: '12 7', pontilhado: '1 8' }
/** Paleta do mapa. Os valores vêm do TEMA (styles/theme.css): no claro é o
 *  papel de sempre; no escuro vira tinta clara sobre o fundo do tema. Manter
 *  como var() e não como hex — o SVG aceita, e assim o mapa acompanha os dois
 *  modos sem ramo em JS. */
export const PAPEL = {
  fundo: 'var(--malha-fundo)',
  parada: 'var(--malha-parada)',
  tinta: 'var(--malha-tinta)',
  halo: 'var(--malha-halo)',
  grade: 'var(--malha-grade)',
  bairro: 'var(--malha-bairro)',
} as const

/** Amostra do traço de uma linha — o MESMO traço do mapa (cor, largura,
 *  tracejado), sobre o papel; usada na legenda. */
export function TracoAmostra({ cor, traco, largura }: { cor: string; traco: Traco; largura: number }) {
  const { isDark } = useTheme()
  return (
    <svg width={38} height={14} viewBox="0 0 38 14" aria-hidden data-swatch={traco} style={{ background: PAPEL.fundo, borderRadius: 3, flex: 'none' }}>
      <line x1={4} y1={7} x2={34} y2={7} stroke={corVisivel(cor, isDark)} strokeWidth={Math.max(3, largura)} strokeLinecap="round" strokeDasharray={DASH[traco]} />
    </svg>
  )
}

/** Tom de cada zona de bairro: matiz pela ordem, sempre claro sobre o papel. */
function tomDoBairro(i: number): { fill: string; stroke: string } {
  const h = (i * 47) % 360
  return { fill: `hsl(${h} 45% 82%)`, stroke: `hsl(${h} 35% 55%)` }
}

/** Ponto do viewBox sob um cliente, dado o <svg> contido (`meet`) e sua caixa
 *  já pós-transform. null fora do desenho. Sem getScreenCTM (jsdom). */
export function pontoNoDesenho(rect: { left: number; top: number; width: number; height: number }, largura: number, altura: number, clientX: number, clientY: number): { x: number; y: number } | null {
  if (!rect.width || !rect.height || !largura || !altura) return null
  const s = Math.min(rect.width / largura, rect.height / altura)
  const ox = (rect.width - largura * s) / 2
  const oy = (rect.height - altura * s) / 2
  const x = (clientX - rect.left - ox) / s
  const y = (clientY - rect.top - oy) / s
  if (x < 0 || y < 0 || x > largura || y > altura) return null
  return { x, y }
}

/** Parada mais próxima do ponto (raio em unidades do viewBox). */
export function paradaSob(desenho: Desenho, p: { x: number; y: number }, raio = 14): string | null {
  let melhor: string | null = null
  let d0 = Infinity
  for (const s of desenho.paradas) {
    const d = Math.hypot(s.cx - p.x, s.cy - p.y)
    if (d < d0) {
      d0 = d
      melhor = s.nome
    }
  }
  return d0 <= raio ? melhor : null
}

const botaoTudo: CSSProperties = {
  height: 36,
  padding: '0 12px',
  display: 'inline-flex',
  alignItems: 'center',
  background: 'color-mix(in srgb,var(--panel) 88%,transparent)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.12em',
  cursor: 'pointer',
}

/** Trajeto em destaque no mapa: só as linhas/paradas dele ficam acesas;
 *  origem e destino ganham marcador. */
export interface Destaque {
  linhas: string[]
  paradas: string[]
  origem?: string | null
  destino?: string | null
}

export function MalhaMap({
  desenho,
  bairros = [],
  selecionada,
  destaque = null,
  bloqueadas,
  onSelecionar,
  onParada,
}: {
  desenho: Desenho
  /** zonas de bairro (por trás das linhas), ligadas pelo botão BAIRROS. */
  bairros?: ZonaBairro[]
  /** id da linha em destaque (as outras esmaecem). */
  selecionada: string | null
  /** trajeto planejado (tem precedência sobre `selecionada`). */
  destaque?: Destaque | null
  /** Linhas que o cartão do jogador NÃO abre: entram no desenho, mas em meio
   *  tom e tracejadas — servem pra ver aonde daria pra ir com um cartão melhor. */
  bloqueadas?: Set<string>
  onSelecionar: (id: string | null) => void
  onParada: (nome: string) => void
}) {
  const map = useMapView()
  const { isDark: escuro } = useTheme()
  const [mostrarBairros, setMostrarBairros] = useState(false)
  if (!desenho.tracos.length) return null
  const onViewportClick = (e: React.MouseEvent) => {
    if (map.consumeMoved()) return
    const rect = map.mapRef.current?.getBoundingClientRect()
    if (!rect) return
    const p = pontoNoDesenho(rect, desenho.largura, desenho.altura, e.clientX, e.clientY)
    if (!p) return
    const nome = paradaSob(desenho, p)
    if (nome) onParada(nome)
    else onSelecionar(null)
  }
  return (
    <section
      ref={map.containerRef}
      data-malha-mapa=""
      style={fullscreenContainerStyle(
        { position: 'relative', background: PAPEL.fundo, border: '1px solid var(--line2)', overflow: 'hidden' },
        map.fullscreen,
      )}
    >
      <div
        ref={map.viewportRef}
        data-malha-viewport=""
        onPointerDown={map.onPointerDown}
        onPointerMove={map.onPointerMove}
        onPointerUp={map.onPointerUp}
        onPointerCancel={map.onPointerUp}
        onClick={onViewportClick}
        style={{
          height: map.fullscreen ? '100%' : 'min(70vh, 640px)',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: map.dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          background: PAPEL.fundo,
        }}
      >
        <div ref={map.mapRef} style={{ width: '100%', height: '100%', transform: map.transform, transformOrigin: '0 0' }}>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${desenho.largura} ${desenho.altura}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block', fontFamily: 'var(--body)' }}
            data-paleta="papel"
          >
            {mostrarBairros
              ? bairros.map((z, i) => {
                  const tom = tomDoBairro(i)
                  return (
                    <g key={z.nome} data-bairro={z.nome}>
                      {z.celulas.map((c) => (
                        <rect key={`${c.x},${c.y}`} x={c.x - desenho.unidade / 2} y={c.y - desenho.unidade / 2} width={desenho.unidade + 0.6} height={desenho.unidade + 0.6} fill={tom.fill} fillOpacity={0.6} />
                      ))}
                      <text x={z.rotulo.x} y={z.rotulo.y} fontSize={10.5} fontWeight={700} letterSpacing=".12em" fill={tom.stroke} style={{ paintOrder: 'stroke', stroke: PAPEL.halo, strokeWidth: 3, strokeLinejoin: 'round' }}>
                        {z.nome.toUpperCase()}
                      </text>
                    </g>
                  )
                })
              : null}
            {desenho.tracos.map((t) => {
              const naRota = destaque ? destaque.linhas.includes(t.id) : null
              const semAcesso = bloqueadas?.has(t.id) ?? false
              const apagada = naRota === null ? selecionada !== null && selecionada !== t.id : !naRota
              const grossa = naRota === null ? selecionada === t.id : naRota
              return (
                <path
                  key={t.id}
                  data-linha={t.id}
                  data-na-rota={naRota ? '' : undefined}
                  d={t.d}
                  fill="none"
                  stroke={corVisivel(t.cor, escuro)}
                  strokeWidth={grossa ? t.largura + 2 : t.largura}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={DASH[t.traco]}
                  opacity={apagada ? 0.12 : semAcesso ? 0.42 : 1}
                  data-sem-acesso={semAcesso ? '' : undefined}
                >
                  <title>{t.nome}</title>
                </path>
              )
            })}
            {desenho.paradas.map((p) => {
              const naRota = destaque ? destaque.paradas.includes(p.nome) : null
              const apagada = naRota === null ? selecionada !== null && !p.linhas.includes(selecionada) : !naRota
              const ponta = destaque?.origem === p.nome ? 'A' : destaque?.destino === p.nome ? 'B' : null
              return (
                <g key={p.nome} data-parada={p.nome} data-baldeacao={p.baldeacao ? '' : undefined} data-ponta={ponta ?? undefined} opacity={apagada ? 0.2 : 1}>
                  {ponta ? <circle cx={p.cx} cy={p.cy} r={13} fill={PAPEL.tinta} opacity={0.92} /> : null}
                  {ponta ? (
                    <text x={p.cx} y={p.cy + 4.5} fontSize={12} fontWeight={800} fill={PAPEL.parada} textAnchor="middle">
                      {ponta}
                    </text>
                  ) : null}
                  {ponta ? null : <circle cx={p.cx} cy={p.cy} r={p.baldeacao ? 7 : 4.5} fill={PAPEL.parada} stroke={p.cor ? corVisivel(p.cor, escuro) : PAPEL.tinta} strokeWidth={p.baldeacao ? 3 : 2.5} />}
                  <text
                    x={p.rotulo.x}
                    y={p.rotulo.y}
                    fontSize={11.5}
                    fontWeight={p.baldeacao ? 600 : 400}
                    fill={PAPEL.tinta}
                    textAnchor={p.rotulo.anchor}
                    transform={p.rotulo.rotacao ? `rotate(${p.rotulo.rotacao} ${p.cx} ${p.cy})` : undefined}
                    style={{ paintOrder: 'stroke', stroke: PAPEL.halo, strokeWidth: 4, strokeLinejoin: 'round' }}
                  >
                    {p.nome}
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
          <>
            {bairros.length ? (
              <button
                type="button"
                data-bairros=""
                aria-pressed={mostrarBairros}
                aria-label="Mostrar os bairros"
                onClick={() => setMostrarBairros((v) => !v)}
                style={{ ...botaoTudo, borderColor: mostrarBairros ? 'var(--accent)' : 'var(--line2)', background: mostrarBairros ? 'color-mix(in srgb,var(--accent) 18%,var(--panel))' : botaoTudo.background }}
              >
                BAIRROS
              </button>
            ) : null}
            <button type="button" data-mostrar-tudo="" aria-label="Mostrar o mapa inteiro" onClick={() => map.resetView()} style={botaoTudo}>
              TUDO
            </button>
          </>
        }
      />
    </section>
  )
}
