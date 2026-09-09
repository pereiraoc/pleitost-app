// ABA TRANSPORTE DO ATLAS (2026-09-09) — a MESMA malha da ficha, mas desenhada
// sobre o mapa REAL de Porto Alegre: as linhas ligam as paradas nas posições
// que os marcadores do bloco ```leaflet``` declaram, por cima das áreas de
// bairro (map/MapaLocal). Pedido do mestre: "considerando realmente os lugares
// reais dentro de POA", com os bairros mantidos como no outro mapa.
//
// Nada de painel próprio: filtro, planejador, legenda e parada a parada vêm do
// MalhaPainel — este arquivo só troca o mapa esquemático pelo real.
import type { CSSProperties } from 'react'
import { MalhaPainel, type ContextoMapaMalha } from './MalhaPainel'
import { MapaLocal, type CamadaMapa, type Leaflet } from '../map/MapaLocal'
import { DASH, type LinhaMalha } from './malha'
import type { PosicaoReal } from './rotas'

/** Da escala em que os rótulos e pontos param de contra-escalar (o mapa real
 *  ganha detalhe ao aproximar; a linha, não deve engrossar). */
const ESCALA_ROTULO = 3
/** Escala de tela a partir da qual o ícone de cada parada entra (o mesmo
 *  limiar do nome do pino no MapaLocal). */
const ESCALA_PARADA = 0.85

export function TransporteNoMapa({ leaflet }: { leaflet: Leaflet }) {
  return (
    <MalhaPainel
      mapa={(ctx) => (
        <MapaLocal
          leaflet={leaflet}
          altura="min(82vh, 900px)"
          // No mapa da malha os pinos são as PARADAS das linhas desenhadas (o
          // gate da nota esconderia todas no afastado). Afastado, 68 ícones
          // viram um borrão: só entram as paradas em foco, e o resto aparece
          // ao aproximar — quem marca a posição de todas é o ponto do SVG.
          marcadores={(m, { escalaTela }) =>
            paradasDesenhadas(ctx).has(m.nome) &&
            (emFoco(ctx).has(m.nome) || escalaTela >= ESCALA_PARADA)
          }
          // o nome da parada só é obrigatório em quem está na rota/linha
          // escolhida; o resto ganha nome ao aproximar
          nomearMarcador={(m) => emFoco(ctx).has(m.nome)}
          // clicar numa parada marca DE e depois PARA, como no esquemático
          onMarker={(nome) => {
            if (!paradasDesenhadas(ctx).has(nome)) return false
            ctx.onParada(nome)
            return true
          }}
          overlay={(camada) => <LinhasNoMapa ctx={ctx} camada={camada} />}
        />
      )}
    />
  )
}

/** Paradas que precisam de nome em qualquer zoom: as do trajeto escolhido e as
 *  da linha selecionada na legenda. */
function emFoco(ctx: ContextoMapaMalha): Set<string> {
  const out = new Set(ctx.destaque?.paradas ?? [])
  if (ctx.selecionada) {
    for (const p of ctx.malha.linhas.find((l) => l.id === ctx.selecionada)?.paradas ?? []) out.add(p)
  }
  return out
}

/** Paradas das linhas que estão no mapa (com posição real conhecida). */
function paradasDesenhadas(ctx: ContextoMapaMalha): Set<string> {
  const out = new Set<string>()
  for (const l of linhasNoMapa(ctx)) {
    for (const p of l.paradas) if (ctx.posicoes.has(p)) out.add(p)
  }
  return out
}

/** Linhas a desenhar: as do filtro, mais as bloqueadas quando pedido. */
function linhasNoMapa(ctx: ContextoMapaMalha): LinhaMalha[] {
  if (!ctx.bloqueadas?.size) return ctx.visiveis
  const dentro = new Set(ctx.visiveis.map((l) => l.id))
  return [...ctx.visiveis, ...ctx.malha.linhas.filter((l) => ctx.bloqueadas!.has(l.id) && !dentro.has(l.id))]
}

/** As linhas da malha por cima do mapa real. O viewBox é o próprio bounds do
 *  bloco (long × lat), então cada parada vai na coordenada que a nota declara —
 *  `preserveAspectRatio="none"` não distorce porque a imagem tem a mesma
 *  proporção do bounds. */
function LinhasNoMapa({ ctx, camada }: { ctx: ContextoMapaMalha; camada: CamadaMapa }) {
  const { latMax, longMax, escala } = camada
  const ponto = (nome: string): { x: number; y: number } | null => {
    const p: PosicaoReal | undefined = ctx.posicoes.get(nome)
    return p ? { x: p.long, y: latMax - p.lat } : null
  }
  const linhas = linhasNoMapa(ctx)
  const traço = (l: LinhaMalha): { d: string; pontos: { x: number; y: number }[] } => {
    const seq = l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas
    const pontos = seq.map(ponto).filter((p): p is { x: number; y: number } => !!p)
    return {
      d: pontos.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
      pontos,
    }
  }
  // Paradas em destaque ganham anel; A/B marcam as pontas do trajeto.
  const emDestaque = new Set(ctx.destaque?.paradas ?? [])
  const daSelecionada = new Set(
    ctx.selecionada ? (linhas.find((l) => l.id === ctx.selecionada)?.paradas ?? []) : [],
  )
  const ponta = (nome: string) =>
    ctx.destaque?.origem === nome ? 'A' : ctx.destaque?.destino === nome ? 'B' : null
  const r = Math.max(2.5, 7 / Math.min(escala, ESCALA_ROTULO))
  const halo: CSSProperties = {
    paintOrder: 'stroke',
    stroke: 'rgba(255,255,255,.9)',
    strokeWidth: 4 / Math.min(escala, ESCALA_ROTULO),
    strokeLinejoin: 'round',
  }
  return (
    <svg
      data-malha-no-mapa=""
      viewBox={`0 0 ${longMax} ${latMax}`}
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
      {linhas.map((l) => {
        const { d } = traço(l)
        if (!d) return null
        const naRota = ctx.destaque ? ctx.destaque.linhas.includes(l.id) : null
        const semAcesso = ctx.bloqueadas?.has(l.id) ?? false
        const apagada = naRota === null ? ctx.selecionada !== null && ctx.selecionada !== l.id : !naRota
        const grossa = naRota === null ? ctx.selecionada === l.id : naRota
        const largura = (grossa ? l.largura + 2 : l.largura) / Math.min(escala, ESCALA_ROTULO)
        return (
          <path
            key={l.id}
            data-linha={l.id}
            data-na-rota={naRota ? '' : undefined}
            data-sem-acesso={semAcesso ? '' : undefined}
            d={d}
            fill="none"
            // cor CRUA da nota: a imagem do mapa é papel claro nos dois temas
            stroke={l.cor}
            strokeWidth={largura}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={
              DASH[l.traco]
                ? DASH[l.traco]!
                    .split(' ')
                    .map((n) => Number(n) / Math.min(escala, ESCALA_ROTULO))
                    .join(' ')
                : undefined
            }
            opacity={apagada ? 0.15 : semAcesso ? 0.45 : 0.95}
          >
            <title>{l.nome}</title>
          </path>
        )
      })}
      {[...paradasDesenhadas(ctx)]
        .filter((nome) => !emDestaque.has(nome) && !daSelecionada.has(nome))
        .map((nome) => {
          const p = ponto(nome)
          if (!p) return null
          // em unidades da FONTE: o ponto encolhe junto com o mapa, então
          // afastado ele só marca o lugar e não vira mancha
          return (
            <circle
              key={`p:${nome}`}
              data-parada-ponto={nome}
              cx={p.x}
              cy={p.y}
              r={3.2}
              fill="#fff"
              stroke="#3a3a3a"
              strokeWidth={1.4}
              opacity={0.9}
            />
          )
        })}
      {[...emDestaque, ...daSelecionada].map((nome) => {
        const p = ponto(nome)
        if (!p) return null
        const letra = ponta(nome)
        return (
          <g key={nome} data-parada={nome} data-ponta={letra ?? undefined}>
            {letra ? (
              <>
                <circle cx={p.x} cy={p.y} r={r * 1.7} fill="#191919" opacity={0.92} />
                <text
                  x={p.x}
                  y={p.y + r * 0.65}
                  fontSize={r * 1.9}
                  fontWeight={800}
                  fill="#fff"
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                >
                  {letra}
                </text>
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={r} fill="#fff" stroke="#191919" strokeWidth={r / 2.5} />
            )}
          </g>
        )
      })}
      {/* nome da parada da rota/linha escolhida — no mapa real o pino já traz o
          nome, então isto só reforça quem está em destaque */}
      {escala >= ESCALA_ROTULO
        ? null
        : [...emDestaque].map((nome) => {
            const p = ponto(nome)
            if (!p || ponta(nome)) return null
            return (
              <text
                key={`r:${nome}`}
                x={p.x + r * 1.4}
                y={p.y - r}
                fontSize={r * 1.6}
                fontWeight={700}
                fill="#191919"
                fontFamily="var(--mono)"
                style={halo}
              >
                {nome}
              </text>
            )
          })}
    </svg>
  )
}
