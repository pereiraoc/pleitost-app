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
import type { CSSProperties } from 'react'
import type { Desenho, Traco } from '../../transporte/malha'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'
import { useMapView } from '../../map/useMapView'

const DASH: Record<Traco, string | undefined> = { cheio: undefined, tracejado: '12 7', pontilhado: '1 8' }
export const PAPEL = { fundo: '#f4f0e6', parada: '#ffffff', tinta: '#161616', halo: '#f4f0e6', grade: '#e7e1d3' } as const

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

export function MalhaMap({
  desenho,
  selecionada,
  onSelecionar,
  onParada,
}: {
  desenho: Desenho
  /** id da linha em destaque (as outras esmaecem). */
  selecionada: string | null
  onSelecionar: (id: string | null) => void
  onParada: (nome: string) => void
}) {
  const map = useMapView()
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
            {desenho.tracos.map((t) => {
              const apagada = selecionada !== null && selecionada !== t.id
              return (
                <path
                  key={t.id}
                  data-linha={t.id}
                  d={t.d}
                  fill="none"
                  stroke={t.cor}
                  strokeWidth={selecionada === t.id ? t.largura + 2 : t.largura}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={DASH[t.traco]}
                  opacity={apagada ? 0.18 : 1}
                >
                  <title>{t.nome}</title>
                </path>
              )
            })}
            {desenho.paradas.map((p) => {
              const apagada = selecionada !== null && !p.linhas.includes(selecionada)
              return (
                <g key={p.nome} data-parada={p.nome} data-baldeacao={p.baldeacao ? '' : undefined} opacity={apagada ? 0.25 : 1}>
                  <circle cx={p.cx} cy={p.cy} r={p.baldeacao ? 7 : 4.5} fill={PAPEL.parada} stroke={p.cor ?? PAPEL.tinta} strokeWidth={p.baldeacao ? 3 : 2.5} />
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
          <button type="button" data-mostrar-tudo="" aria-label="Mostrar o mapa inteiro" onClick={() => map.resetView()} style={botaoTudo}>
            TUDO
          </button>
        }
      />
    </section>
  )
}
