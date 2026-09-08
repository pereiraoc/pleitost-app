// MAPA ESQUEMÁTICO da malha (2026-09-08) — SVG estilo mapa de metrô: um path
// por linha (cor/traço da vault), bolinha por parada (branca com anel escuro =
// baldeação; anel na cor da linha = parada simples), rótulos inclinados onde
// há vizinha na mesma fileira. Só desenha o que `desenharMalha` projetou.
import type { CSSProperties } from 'react'
import type { Desenho, Traco } from '../../transporte/malha'

const DASH: Record<Traco, string | undefined> = { cheio: undefined, tracejado: '12 7', pontilhado: '1 8' }

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
  if (!desenho.tracos.length) return null
  const wrap: CSSProperties = {
    overflow: 'auto',
    background: 'var(--panel)',
    border: '1px solid var(--line2)',
    maxHeight: 'min(72vh, 760px)',
  }
  return (
    <div style={wrap} data-malha-mapa="">
      <svg
        width={desenho.largura}
        height={desenho.altura}
        viewBox={`0 0 ${desenho.largura} ${desenho.altura}`}
        style={{ display: 'block', fontFamily: 'var(--body)' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelecionar(null)
        }}
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
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onSelecionar(selecionada === t.id ? null : t.id)
              }}
            >
              <title>{t.nome}</title>
            </path>
          )
        })}
        {desenho.paradas.map((p) => {
          const apagada = selecionada !== null && !p.linhas.includes(selecionada)
          return (
            <g
              key={p.nome}
              data-parada={p.nome}
              data-baldeacao={p.baldeacao ? '' : undefined}
              opacity={apagada ? 0.25 : 1}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onParada(p.nome)
              }}
            >
              <circle cx={p.cx} cy={p.cy} r={p.baldeacao ? 7 : 4.5} fill="var(--panel)" stroke={p.cor ?? 'var(--ink)'} strokeWidth={p.baldeacao ? 3 : 2.5} />
              <text
                x={p.rotulo.x}
                y={p.rotulo.y}
                fontSize={11}
                fill="var(--ink)"
                textAnchor={p.rotulo.anchor}
                transform={p.rotulo.rotacao ? `rotate(${p.rotulo.rotacao} ${p.cx} ${p.cy})` : undefined}
                style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3, strokeLinejoin: 'round' }}
              >
                {p.nome}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
