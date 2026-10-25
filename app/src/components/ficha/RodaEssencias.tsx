// RODA DAS ESSÊNCIAS (2026-10-25) — o seletor de Essências Elementais do
// conjurador Anima, no lugar dos dropdowns: as 12 essências do Ciclo Elemental
// num anel (Adepta), o anel das Experientes por fora e o das Mestre por último.
// Cada anel só aparece quando o herói pode escolher nele (ou já tem algo ali).
// Regras de quem abre: rules/roda-essencias.ts. O pick grava pelo MESMO
// writeChoicePick dos dropdowns (o FM não muda de forma).
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { reskinName, reskinText, reskinUpper } from '../../data/reskin'
import { fmPath, listaEntries, wikiTarget } from './hero-model'
import { ELEMENTO_COR, elementoEmoji } from './registry'
import { clip } from './bits'
import { useNamedDocs } from './useNamedDocs'
import {
  elementoDaSintonia,
  estadoRoda,
  HUB_RODA,
  parseEssencia,
  rodaDoCatalogo,
  SUFIXO_TIER,
  type EstadoNo,
  type RodaDef,
  type Tier,
} from '../../rules/roda-essencias'
import type { HabChoice } from './HabilidadesTab'

/** Escolha de essência + a habilidade-pai (sourceNote) que a concede. */
export interface RodaChoice extends HabChoice {
  parent: string
}

/** Tier de uma escolha: o das suas opções (todas "Essência X <Tier>"); null
 *  quando a escolha não é de essência do ciclo (ex.: Essência Menor). */
export function tierDaEscolha(c: HabChoice): Tier | null {
  if (c.kind !== 'complementar-sel' || c.options.length === 0) return null
  const tiers = new Set(c.options.map((o) => parseEssencia(o)?.tier ?? null))
  if (tiers.size !== 1 || tiers.has(null)) return null
  return [...tiers][0] as Tier
}

const escolhido = (c: HabChoice) => !!c.pick && c.source !== 'default' && c.source !== 'none'

const TIERS: Tier[] = ['A', 'E', 'M']
const R: Record<Tier, number> = { A: 150, E: 207, M: 254 }
const NO_R: Record<Tier, number> = { A: 25, E: 11, M: 15 }
const R_MARCA = 86
const R_CENTRO = 34

const pt = (r: number, graus: number) => {
  const a = (graus * Math.PI) / 180
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

/** "Essência Flamejante" → "Flamejante" (e "Linha Flamejante" na POA). */
function nomeCurto(base: string): string {
  return reskinName(base).replace(/^\S+\s+/, '').replace(/^d[ea]\s+/, '')
}

export function RodaEssencias({
  fm,
  choices,
  edit,
  onPick,
  onOpen,
}: {
  /** FM DERIVADO (o que o herói tem, de qualquer fonte). */
  fm: Record<string, unknown>
  choices: RodaChoice[]
  edit: boolean
  onPick: (parent: string, choice: HabChoice, wl: string) => void
  onOpen?: (nome: string) => void
}) {
  const catalog = useCatalog()
  const hubDoc = useNamedDocs([HUB_RODA])(HUB_RODA)
  const roda = useMemo(() => rodaDoCatalogo(catalog, hubDoc?.frontmatter), [catalog, hubDoc])
  const [foco, setFoco] = useState<{ base: string; tier: Tier } | null>(null)
  if (!roda) return null
  return <Roda roda={roda} fm={fm} choices={choices} edit={edit} onPick={onPick} onOpen={onOpen} foco={foco} setFoco={setFoco} />
}

function Roda({
  roda,
  fm,
  choices,
  edit,
  onPick,
  onOpen,
  foco,
  setFoco,
}: {
  roda: RodaDef
  fm: Record<string, unknown>
  choices: RodaChoice[]
  edit: boolean
  onPick: (parent: string, choice: HabChoice, wl: string) => void
  onOpen?: (nome: string) => void
  foco: { base: string; tier: Tier } | null
  setFoco: (f: { base: string; tier: Tier } | null) => void
}) {
  const sintonia = elementoDaSintonia(fm['Sintonia'])
  const pais = new Set(choices.map((c) => c.parent))
  const porTier = (t: Tier) => choices.filter((c) => tierDaEscolha(c) === t)

  // O que o herói TEM: picks gravados das escolhas da roda + essências que
  // vieram de outra fonte (regra fixa, técnica Essência Adicional, …).
  const tem: Record<Tier, Set<string>> = { A: new Set(), E: new Set(), M: new Set() }
  for (const c of choices) {
    const e = escolhido(c) ? parseEssencia(String(c.pick)) : null
    if (e) tem[e.tier].add(e.base)
  }
  for (const e of listaEntries(fmPath(fm, 'Habilidades', 'Lista'))) {
    if (e.fonte.kind === 'Escolha' && pais.has(e.fonte.target)) continue
    const p = parseEssencia(e.target)
    if (p) tem[p.tier].add(p.base)
  }
  const estado = estadoRoda({ roda, sintonia, tem, aplicaCiclo: true })

  const wlDe = (base: string, t: Tier) => `[[${base} ${SUFIXO_TIER[t]}]]`
  /** Escolha VAZIA deste tier que oferece a essência (1ª do pai, na ordem). */
  const vagaPara = (base: string, t: Tier) =>
    porTier(t).find(
      (c) => !escolhido(c) && c.options.some((o) => wikiTarget(o) === `${base} ${SUFIXO_TIER[t]}`),
    )
  /** Escolha que GRAVOU esta essência (pra desfazer). */
  const escolhaDe = (base: string, t: Tier) =>
    porTier(t).find((c) => escolhido(c) && wikiTarget(String(c.pick)) === `${base} ${SUFIXO_TIER[t]}`)

  const visivel: Record<Tier, boolean> = {
    A: porTier('A').length > 0 || tem.A.size > 0,
    E: porTier('E').length > 0 || tem.E.size > 0,
    M: porTier('M').length > 0 || tem.M.size > 0,
  }
  const vagas = (t: Tier) => porTier(t).filter((c) => !escolhido(c)).length

  /** Estado FINAL do nó: "livre" sem vaga no tier vira "fechado". */
  const st = (base: string, t: Tier): EstadoNo | 'semVaga' => {
    const s = estado.no[t][base] ?? 'fechado'
    if (s === 'livre' && !vagaPara(base, t)) return 'semVaga'
    return s
  }
  const motivo = (base: string, t: Tier): string => {
    const s = st(base, t)
    const nome = reskinName(`${base} ${SUFIXO_TIER[t]}`)
    if (s === 'tem') return estado.soltas.has(base) && t === 'A' ? `${nome} — fora do caminho do ciclo` : `${nome} — escolhida`
    if (s === 'oposto') return `${nome} — elemento oposto à ${reskinText('sintonia')}`
    if (s === 'livre') return `${nome} — disponível`
    if (s === 'semVaga') return `${nome} — sem escolha livre neste anel`
    if (t === 'A') return `${nome} — precisa de uma vizinha no ciclo`
    return `${nome} — precisa da ${t === 'E' ? 'Adepta' : 'Experiente'} e a primeira é da ${reskinText('sintonia')}`
  }

  const clicar = (base: string, t: Tier) => {
    setFoco({ base, tier: t })
    const s = st(base, t)
    if (!edit) {
      if (s === 'tem') onOpen?.(`${base} ${SUFIXO_TIER[t]}`)
      return
    }
    if (s === 'livre') {
      const c = vagaPara(base, t)
      if (c) onPick(c.parent, c, wlDe(base, t))
    } else if (s === 'tem') {
      const c = escolhaDe(base, t)
      if (c) onPick(c.parent, c, '')
    }
  }
  const tecla = (base: string, t: Tier) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      clicar(base, t)
    }
  }

  const n = roda.ordem.length
  const ang = (i: number) => -90 + (360 / n) * i
  const corDe = (base: string) => ELEMENTO_COR[roda.elemento[base] ?? 'Universal'] ?? ELEMENTO_COR.Universal!
  const rMax = visivel.M ? R.M + NO_R.M + 14 : visivel.E ? R.E + NO_R.E + 14 : R.A + NO_R.A + 14
  const vb = rMax + 6

  /** Arco do anel entre dois nós vizinhos, aparado pelo raio dos nós. */
  const arco = (i: number, t: Tier) => {
    const r = R[t]
    const corte = ((NO_R[t] + 4) / r) * (180 / Math.PI)
    const a0 = pt(r, ang(i) + corte)
    const a1 = pt(r, ang(i + 1) - corte)
    return `M${a0.x.toFixed(1)},${a0.y.toFixed(1)} A${r},${r} 0 0 1 ${a1.x.toFixed(1)},${a1.y.toFixed(1)}`
  }
  /** Fatia do elemento atrás do nó (fundo tingido). */
  const fatia = (i: number, r0: number, r1: number) => {
    const meia = 180 / n
    const p = [pt(r0, ang(i) - meia), pt(r1, ang(i) - meia), pt(r1, ang(i) + meia), pt(r0, ang(i) + meia)]
    return `M${p[0]!.x},${p[0]!.y} L${p[1]!.x},${p[1]!.y} A${r1},${r1} 0 0 1 ${p[2]!.x},${p[2]!.y} L${p[3]!.x},${p[3]!.y} A${r0},${r0} 0 0 0 ${p[0]!.x},${p[0]!.y} Z`
  }

  const no = (base: string, t: Tier, x: number, y: number, rotulo: boolean) => {
    const s = st(base, t)
    const cor = corDe(base)
    const r = NO_R[t]
    const pura = roda.puras.has(base)
    const solta = t === 'A' && estado.soltas.has(base)
    const ativo = edit && (s === 'livre' || s === 'tem')
    const emFoco = foco?.base === base && foco.tier === t
    const fill = s === 'tem' ? cor : 'var(--panel2)'
    const stroke = s === 'tem' ? (solta ? 'var(--red)' : cor) : s === 'livre' ? cor : 'var(--line2)'
    const opac = s === 'fechado' || s === 'semVaga' ? 0.42 : s === 'oposto' ? 0.28 : 1
    return (
      <g
        key={`${t}-${base}`}
        data-roda-no={`${t}:${base}`}
        data-roda-estado={s}
        role="button"
        tabIndex={0}
        aria-label={motivo(base, t)}
        aria-pressed={s === 'tem'}
        onClick={() => clicar(base, t)}
        onKeyDown={tecla(base, t)}
        onMouseEnter={() => setFoco({ base, tier: t })}
        onFocus={() => setFoco({ base, tier: t })}
        style={{ cursor: ativo || s === 'tem' ? 'pointer' : 'default', opacity: opac, outline: 'none' }}
      >
        <title>{motivo(base, t)}</title>
        {s === 'tem' ? <circle cx={x} cy={y} r={r + 7} fill={cor} opacity={0.18} /> : null}
        {s === 'livre' && edit ? (
          <circle cx={x} cy={y} r={r + 5} fill="none" stroke={cor} strokeWidth={1.6}>
            <animate attributeName="r" values={`${r + 2};${r + 8};${r + 2}`} dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.15;0.9" dur="2.4s" repeatCount="indefinite" />
          </circle>
        ) : null}
        {pura && t === 'A' ? (
          <circle cx={x} cy={y} r={r + 4} fill="none" stroke={s === 'tem' ? cor : 'var(--line2)'} strokeWidth={1.2} />
        ) : null}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={fill}
          stroke={emFoco ? 'var(--accent)' : stroke}
          strokeWidth={s === 'tem' ? 2.4 : 1.6}
          strokeDasharray={solta ? '4 3' : undefined}
        />
        {s === 'oposto' && t === 'A' ? (
          <path
            d={`M${x - 7},${y - 7} L${x + 7},${y + 7} M${x + 7},${y - 7} L${x - 7},${y + 7}`}
            stroke="var(--muted)"
            strokeWidth={1.4}
          />
        ) : null}
        {rotulo ? (
          <text
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 7.6,
              fontWeight: 700,
              letterSpacing: '.04em',
              fill: s === 'tem' ? '#fff' : 'var(--text)',
              paintOrder: 'stroke',
              stroke: s === 'tem' ? 'rgba(0,0,0,.5)' : 'var(--panel2)',
              strokeWidth: 1.8,
              strokeLinejoin: 'round',
              pointerEvents: 'none',
              textTransform: 'uppercase',
            }}
          >
            {nomeCurto(base).slice(0, 12)}
          </text>
        ) : s === 'tem' ? (
          <text
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: 'var(--mono)', fontSize: t === 'M' ? 9 : 8, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}
          >
            {t}
          </text>
        ) : null}
      </g>
    )
  }

  const universal = roda.universais[0] ?? null
  const contador = (t: Tier) => {
    const total = porTier(t).length
    const usados = total - vagas(t)
    return total > 0 ? `${usados}/${total}` : String(tem[t].size)
  }
  const focoTxt = foco
    ? motivo(foco.base, foco.tier)
    : reskinText(edit ? 'Toque numa Essência acesa pra escolher; numa escolhida pra desfazer.' : 'Toque numa Essência escolhida pra abrir a regra.')

  return (
    <div
      data-roda-essencias=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 14px 12px',
        marginBottom: 14,
        background: 'var(--panel2)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', color: 'var(--accent)' }}>
          {`// ${reskinUpper('Roda das Essências')}`}
        </span>
        <span style={{ flex: 1 }} />
        {TIERS.filter((t) => visivel[t]).map((t) => (
          <span
            key={t}
            data-roda-contador={t}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '.08em',
              color: vagas(t) > 0 && edit ? 'var(--gold)' : 'var(--muted)',
              padding: '3px 8px',
              border: '1px solid var(--line2)',
              clipPath: clip(5),
            }}
          >
            {`${SUFIXO_TIER[t].toUpperCase()} ${contador(t)}`}
          </span>
        ))}
      </div>
      <svg
        viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`}
        width="100%"
        style={{ maxWidth: 520, alignSelf: 'center', display: 'block', overflow: 'visible' }}
        role="group"
        aria-label={reskinText('Roda das Essências')}
      >
        <defs>
          <radialGradient id="roda-brilho">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r={rMax} fill="url(#roda-brilho)" />
        {/* fatias dos elementos */}
        {roda.ordem.map((b, i) => (
          <path
            key={`f-${b}`}
            d={fatia(i, R_MARCA + 18, rMax - 4)}
            fill={corDe(b)}
            opacity={tem.A.has(b) ? 0.13 : 0.05}
          />
        ))}
        {/* trilhos dos anéis */}
        {TIERS.filter((t) => visivel[t]).map((t) => (
          <circle key={`trilho-${t}`} r={R[t]} fill="none" stroke="var(--line)" strokeWidth={t === 'A' ? 1.2 : 1} strokeDasharray={t === 'A' ? undefined : '2 4'} />
        ))}
        {/* arcos do ciclo (Adepta): aceso entre duas que tem, tracejado até a disponível */}
        {roda.ordem.map((b, i) => {
          const c = roda.ordem[(i + 1) % n]!
          const ambos = tem.A.has(b) && tem.A.has(c)
          const meio = (tem.A.has(b) && st(c, 'A') === 'livre') || (tem.A.has(c) && st(b, 'A') === 'livre')
          return (
            <path
              key={`arco-${b}`}
              d={arco(i, 'A')}
              fill="none"
              stroke={ambos ? corDe(b) : meio && edit ? 'var(--accent)' : 'var(--line2)'}
              strokeWidth={ambos ? 3.4 : meio ? 1.8 : 1.1}
              strokeDasharray={meio && !ambos ? '5 4' : undefined}
              strokeLinecap="round"
            />
          )
        })}
        {/* marcas de elemento (cruz interna) ligadas à pura e ao centro */}
        {[...roda.puras].map((p) => {
          const i = roda.ordem.indexOf(p)
          const m = pt(R_MARCA, ang(i))
          const a = pt(R.A - NO_R.A - 5, ang(i))
          const c0 = pt(R_CENTRO + 4, ang(i))
          const el = roda.elemento[p]!
          const daSintonia = el === sintonia
          return (
            <g key={`marca-${p}`}>
              <line x1={c0.x} y1={c0.y} x2={m.x} y2={m.y} stroke="var(--line2)" strokeWidth={1} />
              <line x1={m.x} y1={m.y} x2={a.x} y2={a.y} stroke={tem.A.has(p) ? corDe(p) : 'var(--line2)'} strokeWidth={tem.A.has(p) ? 2.4 : 1.2} />
              <circle cx={m.x} cy={m.y} r={13} fill="var(--panel)" stroke={corDe(p)} strokeWidth={daSintonia ? 2.6 : 1.2} />
              <text x={m.x} y={m.y + 0.5} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, pointerEvents: 'none' }}>
                {elementoEmoji(el)}
              </text>
            </g>
          )
        })}
        {/* conectores radiais pros anéis de fora */}
        {roda.ordem.map((b, i) =>
          (['E', 'M'] as const)
            .filter((t) => visivel[t])
            .map((t) => {
              const de = t === 'E' ? 'A' : 'E'
              const p0 = pt(R[de] + NO_R[de] + 2, ang(i))
              const p1 = pt(R[t] - NO_R[t] - 2, ang(i))
              const aceso = tem[t].has(b)
              return (
                <line
                  key={`rad-${t}-${b}`}
                  x1={p0.x}
                  y1={p0.y}
                  x2={p1.x}
                  y2={p1.y}
                  stroke={aceso ? corDe(b) : 'var(--line)'}
                  strokeWidth={aceso ? 2.2 : 1}
                />
              )
            }),
        )}
        {/* nós */}
        {TIERS.filter((t) => visivel[t]).flatMap((t) =>
          roda.ordem.map((b, i) => {
            const p = pt(R[t], ang(i))
            return no(b, t, p.x, p.y, t === 'A')
          }),
        )}
        {/* centro: essência universal (Criação), um nó por tier visível */}
        {universal ? (
          <g>
            <circle r={R_CENTRO + 6} fill="none" stroke="var(--line2)" strokeDasharray="3 3" />
            {visivel.E ? (
              <line x1={-30} y1={44} x2={0} y2={NO_R.A} stroke={tem.E.has(universal) ? corDe(universal) : 'var(--line)'} />
            ) : null}
            {visivel.M ? (
              <line x1={30} y1={44} x2={0} y2={NO_R.A} stroke={tem.M.has(universal) ? corDe(universal) : 'var(--line)'} />
            ) : null}
            {no(universal, 'A', 0, 0, true)}
            {visivel.E ? no(universal, 'E', -30, 46, false) : null}
            {visivel.M ? no(universal, 'M', 30, 46, false) : null}
          </g>
        ) : null}
      </svg>
      <div
        data-roda-foco=""
        style={{
          minHeight: 18,
          textAlign: 'center',
          fontSize: 12.5,
          color: foco && st(foco.base, foco.tier) === 'tem' && estado.soltas.has(foco.base) && foco.tier === 'A' ? 'var(--red)' : 'var(--muted)',
        }}
      >
        {focoTxt}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' }}>
        <Legenda cor="var(--accent)" cheio>ESCOLHIDA</Legenda>
        <Legenda cor="var(--accent)">DISPONÍVEL</Legenda>
        <Legenda cor="var(--line2)" apagado>FECHADA</Legenda>
        <Legenda cor="var(--muted)" apagado x>OPOSTA</Legenda>
        {sintonia ? (
          <span>
            {`${elementoEmoji(sintonia)} PURA DA ${reskinUpper('Sintonia')}: ${nomeCurto([...roda.puras].find((p) => roda.elemento[p] === sintonia) ?? '').toUpperCase()}`}
          </span>
        ) : (
          <span style={{ color: 'var(--red)' }}>{`ESCOLHA A ${reskinUpper('Sintonia')} PRIMEIRO`}</span>
        )}
      </div>
    </div>
  )
}

function Legenda({ cor, cheio, apagado, x, children }: { cor: string; cheio?: boolean; apagado?: boolean; x?: boolean; children: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, opacity: apagado ? 0.7 : 1 }}>
      <svg width={11} height={11} viewBox="-6 -6 12 12" aria-hidden>
        <circle r={4.6} fill={cheio ? cor : 'none'} stroke={cor} strokeWidth={1.4} />
        {x ? <path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke={cor} strokeWidth={1.2} /> : null}
      </svg>
      {children}
    </span>
  )
}
