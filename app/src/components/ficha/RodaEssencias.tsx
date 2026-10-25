// CÍRCULO DAS ESSÊNCIAS (2026-10-25) — o seletor de Essências Elementais do
// conjurador Anima (na aba MAGIAS), no lugar dos dropdowns: as 12 essências do
// Ciclo Elemental num anel (Adepta) e o anel das Experientes por fora. Cada
// anel só aparece quando o herói pode escolher nele (ou já tem algo ali). O
// anel Mestre (compostas entre duas vizinhas) fica pra quando as notas
// existirem — até lá a escolha Mestre segue no dropdown da habilidade.
// Regras de quem abre: rules/roda-essencias.ts. O pick grava pelo MESMO
// writeChoicePick dos dropdowns (o FM não muda de forma).
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { reskinName, reskinText, reskinUpper } from '../../data/reskin'
import { fmPath, listaEntries, wikiTarget } from './hero-model'
import { ELEMENTO_COR, ELEMENTO_SIMBOLO } from './registry'
import { clip } from './bits'
import { useNamedDocs } from './useNamedDocs'
import {
  compostaDoDoc,
  ehCompostaDoCatalogo,
  elementoDaSintonia,
  elementosDoCirculo,
  pontasDoElemento,
  nomesCompostasDoCatalogo,
  estadoCompostas,
  estadoRoda,
  HUB_RODA,
  parseEssencia,
  rodaDoCatalogo,
  SUFIXO_TIER,
  type Composta,
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
export function tierDaEscolha(c: HabChoice, ehComposta?: (nome: string) => boolean): Tier | null {
  if (c.kind !== 'complementar-sel' || c.options.length === 0) return null
  const tiers = new Set(
    c.options.map((o) => parseEssencia(o)?.tier ?? (ehComposta?.(wikiTarget(o)) ? 'M' : null)),
  )
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
  return reskinName(base).replace(/^\S+\s+/, '').replace(/^d[aeo]s?\s+/, '')
}

export function RodaEssencias({
  fm,
  fmSalvo,
  choices,
  edit,
  onPick,
  onRemover,
  onOpen,
}: {
  /** FM DERIVADO (o que o herói tem, de qualquer fonte). */
  fm: Record<string, unknown>
  /** FM SALVO: picks gravados de escolhas ainda NÃO liberadas no nível (ficha
   *  adiantada) aparecem e podem ser desfeitos. */
  fmSalvo: Record<string, unknown>
  choices: RodaChoice[]
  edit: boolean
  onPick: (parent: string, choice: HabChoice, wl: string) => void
  /** Apaga do FM salvo a linha `Escolha` da essência (alvo sem escolha ativa). */
  onRemover: (alvo: string) => void
  onOpen?: (nome: string) => void
}) {
  const catalog = useCatalog()
  const ehComposta = useMemo(() => ehCompostaDoCatalogo(catalog), [catalog])
  const todasCompostas = useMemo(() => nomesCompostasDoCatalogo(catalog), [catalog])
  const hubDoc = useNamedDocs([HUB_RODA])(HUB_RODA)
  const roda = useMemo(() => rodaDoCatalogo(catalog, hubDoc?.frontmatter), [catalog, hubDoc])
  const [foco, setFoco] = useState<{ base: string; tier: Tier } | null>(null)
  if (!roda) return null
  return (
    <Roda
      roda={roda}
      ehComposta={ehComposta}
      todasCompostas={todasCompostas}
      fm={fm}
      fmSalvo={fmSalvo}
      choices={choices}
      edit={edit}
      onPick={onPick}
      onRemover={onRemover}
      onOpen={onOpen}
      foco={foco}
      setFoco={setFoco}
    />
  )
}

function Roda({
  roda,
  ehComposta,
  todasCompostas,
  fm,
  fmSalvo,
  choices,
  edit,
  onPick,
  onRemover,
  onOpen,
  foco,
  setFoco,
}: {
  roda: RodaDef
  ehComposta: (nome: string) => boolean
  todasCompostas: string[]
  fm: Record<string, unknown>
  fmSalvo: Record<string, unknown>
  choices: RodaChoice[]
  edit: boolean
  onPick: (parent: string, choice: HabChoice, wl: string) => void
  onRemover: (alvo: string) => void
  onOpen?: (nome: string) => void
  foco: { base: string; tier: Tier } | null
  setFoco: (f: { base: string; tier: Tier } | null) => void
}) {
  const sintonia = elementoDaSintonia(fm['Sintonia'])
  const porTier = (t: Tier) => choices.filter((c) => tierDaEscolha(c, ehComposta) === t)

  // O que o herói TEM: picks gravados das escolhas + toda essência da lista de
  // Habilidades (derivada e salva — inclui picks de escolhas de nível acima do
  // atual e as que vieram de outra fonte: regra fixa, Essência Adicional, …).
  const tem: Record<Tier, Set<string>> = { A: new Set(), E: new Set(), M: new Set() }
  const temComposta = new Set<string>()
  for (const c of choices) {
    if (!escolhido(c)) continue
    const alvo = wikiTarget(String(c.pick))
    const e = parseEssencia(alvo)
    if (e) tem[e.tier].add(e.base)
    else if (ehComposta(alvo)) temComposta.add(alvo)
  }
  const salvas = listaEntries(fmPath(fmSalvo, 'Habilidades', 'Lista'))
  // Do DERIVADO só o que não é Escolha (regra fixa): escolha única sem pick
  // gravado sai lá com o PADRÃO aplicado — não é escolha do jogador.
  const derivadas = listaEntries(fmPath(fm, 'Habilidades', 'Lista')).filter((e) => e.fonte.kind !== 'Escolha')
  for (const e of [...derivadas, ...salvas]) {
    const p = parseEssencia(e.target)
    if (p) tem[p.tier].add(p.base)
    else if (ehComposta(e.target)) temComposta.add(e.target)
  }
  // MESTRE compostas (entre duas vizinhas): o anel inteiro do mundo; bases
  // lidas dos Requisitos de cada nota.
  const nomesCompostas = [...new Set([...todasCompostas, ...temComposta])].sort()
  const docsCompostas = useNamedDocs(nomesCompostas)
  const compostas = nomesCompostas
    .map((nm) => compostaDoDoc(nm, docsCompostas(nm)?.frontmatter))
    .filter((c): c is Composta => !!c && roda.ordem.includes(c.a) && roda.ordem.includes(c.b))
  const composta = new Map(compostas.map((c) => [c.nome, c]))
  const estadoM = estadoCompostas({ roda, compostas, sintonia, temE: tem.E, temM: temComposta })
  /** Alvo (nota) do nó: composta Mestre é a própria nota; os demais
   *  "<Essência> <Tier>". */
  const alvoDe = (base: string, t: Tier) => (t === 'M' && composta.has(base) ? base : `${base} ${SUFIXO_TIER[t]}`)
  /** Linha salva por ESCOLHA (removível) da essência sem escolha ativa. */
  const linhaSalva = (base: string, t: Tier) =>
    salvas.some((e) => e.fonte.kind === 'Escolha' && e.target === alvoDe(base, t))
  // DRUIDA: dois elementos do Círculo Druídico — das opções das escolhas
  // Adeptas, ou (nível 1, sem escolha ainda) das duas essências de interface
  // que o círculo concede por regra.
  const regraA = derivadas.map((e) => parseEssencia(e.target)).filter((p) => p?.tier === 'A').map((p) => `[[${p!.base} Adepta]]`)
  const elementos =
    elementosDoCirculo(roda, porTier('A').flatMap((c) => c.options)) ??
    (porTier('A').length === 0 ? elementosDoCirculo(roda, regraA) : null)
  const estado = estadoRoda({ roda, sintonia, tem, aplicaCiclo: true, elementos })

  const wlDe = (base: string, t: Tier) => `[[${alvoDe(base, t)}]]`
  /** Escolha VAZIA deste tier que oferece a essência (1ª do pai, na ordem). */
  const vagaPara = (base: string, t: Tier) =>
    porTier(t).find(
      (c) => !escolhido(c) && c.options.some((o) => wikiTarget(o) === alvoDe(base, t)),
    )
  /** Escolha que GRAVOU esta essência (pra desfazer). */
  const escolhaDe = (base: string, t: Tier) =>
    porTier(t).find((c) => escolhido(c) && wikiTarget(String(c.pick)) === alvoDe(base, t))

  const visivel: Record<Tier, boolean> = {
    A: porTier('A').length > 0 || tem.A.size > 0,
    E: porTier('E').length > 0 || tem.E.size > 0,
    M: porTier('M').length > 0 || tem.M.size > 0 || temComposta.size > 0,
  }
  const vagas = (t: Tier) => porTier(t).filter((c) => !escolhido(c)).length

  /** Estado FINAL do nó: "livre" sem vaga no tier vira "fechado". */
  const st = (base: string, t: Tier): EstadoNo | 'semVaga' => {
    const s = (t === 'M' && composta.has(base) ? estadoM[base] : estado.no[t][base]) ?? 'fechado'
    if (s === 'livre' && !vagaPara(base, t)) return 'semVaga'
    return s
  }
  const motivo = (base: string, t: Tier): string => {
    const s = st(base, t)
    const nome = reskinName(alvoDe(base, t))
    if (s === 'tem') return estado.soltas.has(base) && t === 'A' ? `${nome} — fora do caminho do ciclo` : `${nome} — escolhida`
    if (s === 'oposto') return `${nome} — elemento oposto à ${reskinText('sintonia')}`
    if (s === 'livre') return `${nome} — disponível`
    if (s === 'semVaga') return `${nome} — sem escolha livre neste anel`
    if (t === 'A') return `${nome} — precisa de uma vizinha no ciclo`
    if (t === 'M' && composta.has(base)) {
      const c = composta.get(base)!
      return `${nome} — precisa de ${reskinName(c.a)} e ${reskinName(c.b)} Experientes; a primeira Mestre toca a ${reskinText('sintonia')}`
    }
    return `${nome} — precisa da ${t === 'E' ? 'Adepta' : 'Experiente'} e a primeira é da ${reskinText('sintonia')}`
  }

  const clicar = (base: string, t: Tier) => {
    setFoco({ base, tier: t })
    const s = st(base, t)
    if (!edit) {
      if (s === 'tem') onOpen?.(alvoDe(base, t))
      return
    }
    if (s === 'livre') {
      const c = vagaPara(base, t)
      if (c) onPick(c.parent, c, wlDe(base, t))
    } else if (s === 'tem') {
      const c = escolhaDe(base, t)
      if (c) onPick(c.parent, c, '')
      else if (linhaSalva(base, t)) onRemover(alvoDe(base, t))
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
  const rMax = visivel.M ? R.M + NO_R.M + 24 : visivel.E ? R.E + NO_R.E + 14 : R.A + NO_R.A + 14
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

  const no = (base: string, t: Tier, x: number, y: number, rotulo: boolean, preenchimento?: string) => {
    const s = st(base, t)
    const cor = composta.has(base) ? corDe(composta.get(base)!.a) : corDe(base)
    const r = NO_R[t]
    const pura = roda.puras.has(base)
    const solta = t === 'A' && estado.soltas.has(base)
    const ativo = edit && (s === 'livre' || s === 'tem')
    const emFoco = foco?.base === base && foco.tier === t
    const fill = s === 'tem' ? (preenchimento ?? cor) : 'var(--panel2)'
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
          {`// ${reskinUpper('Círculo das Essências')}`}
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
        aria-label={reskinText('Círculo das Essências')}
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
          // Caminho que ENTRA no elemento oposto: não existe — X no lugar da linha.
          const opB = st(b, 'A') === 'oposto'
          const opC = st(c, 'A') === 'oposto'
          if (opB || opC) {
            const x = pt(R.A, ang(i + 0.5))
            return (
              <g key={`arco-${b}`} data-roda-corte={opB !== opC ? `${b}|${c}` : undefined}>
                <path d={arco(i, 'A')} fill="none" stroke="var(--line)" strokeWidth={1} strokeDasharray="2 5" />
                {opB !== opC ? (
                  <path
                    d={`M${x.x - 6},${x.y - 6} L${x.x + 6},${x.y + 6} M${x.x + 6},${x.y - 6} L${x.x - 6},${x.y + 6}`}
                    stroke="var(--red)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                ) : null}
              </g>
            )
          }
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
        {/* DRUIDA: corda entre as pontas de cada elemento do círculo — de uma
            ponta se chega à outra sem passar pela pura */}
        {(elementos ?? []).map((el) => {
          const pontas = pontasDoElemento(roda, el)
          if (!pontas) return null
          const [b1, b2] = pontas
          const i1 = roda.ordem.indexOf(b1)
          const i2 = roda.ordem.indexOf(b2)
          // curva por DENTRO do anel (não atravessa o nó da pura no meio)
          const meioAng = Math.abs(i2 - i1) > n / 2 ? ang((i1 + i2 + n) / 2) : ang((i1 + i2) / 2)
          const ctrl = pt(R.A * 0.8, meioAng)
          const a1 = pt(R.A - NO_R.A - 3, ang(i1))
          const a2 = pt(R.A - NO_R.A - 3, ang(i2))
          const ambos = tem.A.has(b1) && tem.A.has(b2)
          const meio = (tem.A.has(b1) && st(b2, 'A') === 'livre') || (tem.A.has(b2) && st(b1, 'A') === 'livre')
          return (
            <path
              key={`corda-${el}`}
              data-roda-corda={`${b1}|${b2}`}
              d={`M${a1.x},${a1.y} Q${ctrl.x},${ctrl.y} ${a2.x},${a2.y}`}
              fill="none"
              stroke={ambos ? ELEMENTO_COR[el] : meio && edit ? 'var(--accent)' : 'var(--line2)'}
              strokeWidth={ambos ? 3 : meio ? 1.8 : 1.2}
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
              {daSintonia ? <circle cx={m.x} cy={m.y} r={18} fill="none" stroke={corDe(p)} strokeWidth={1.4} opacity={0.6} /> : null}
              <SimboloElemento elemento={el} x={m.x} y={m.y} r={14} />
            </g>
          )
        })}
        {/* conectores radiais pros anéis de fora */}
        {roda.ordem.map((b, i) =>
          (['E'] as const)
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
        {(['A', 'E'] as const).filter((t) => visivel[t]).flatMap((t) =>
          roda.ordem.map((b, i) => {
            const p = pt(R[t], ang(i))
            return no(b, t, p.x, p.y, t === 'A')
          }),
        )}
        {/* anel MESTRE: cada composta na fatia entre as duas vizinhas, ligada
            às duas Experientes (o "colchete" do diagrama) */}
        {visivel.M
          ? compostas.map((c) => {
              const ia = roda.ordem.indexOf(c.a)
              const ib = roda.ordem.indexOf(c.b)
              const meio = (ib === (ia + 1) % n ? ia : ib) + 0.5
              const p = pt(R.M, ang(meio))
              const ea = pt(R.E + NO_R.E + 1, ang(ia))
              const eb = pt(R.E + NO_R.E + 1, ang(ib))
              const s = st(c.nome, 'M')
              const lb = pt(R.M + NO_R.M + 11, ang(meio))
              return (
                <g key={`m-${c.nome}`}>
                  <defs>
                    <linearGradient id={`mg-${ia}-${ib}`} gradientUnits="userSpaceOnUse" x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y}>
                      <stop offset="0" stopColor={corDe(c.a)} />
                      <stop offset="1" stopColor={corDe(c.b)} />
                    </linearGradient>
                  </defs>
                  {[ea, eb].map((e, k) => (
                    <line
                      key={k}
                      x1={e.x}
                      y1={e.y}
                      x2={p.x}
                      y2={p.y}
                      stroke={tem.E.has(k === 0 ? c.a : c.b) ? corDe(k === 0 ? c.a : c.b) : 'var(--line)'}
                      strokeWidth={tem.E.has(k === 0 ? c.a : c.b) ? 1.8 : 0.9}
                    />
                  ))}
                  {no(c.nome, 'M', p.x, p.y, false, `url(#mg-${ia}-${ib})`)}
                  <text
                    x={lb.x}
                    y={lb.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 7.2,
                      fontWeight: 700,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      fill: s === 'tem' ? 'var(--text)' : 'var(--muted)',
                      opacity: s === 'fechado' || s === 'semVaga' ? 0.55 : 1,
                      pointerEvents: 'none',
                    }}
                  >
                    {nomeCurto(c.nome)}
                  </text>
                </g>
              )
            })
          : null}
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width={14} height={14} viewBox="-8 -8 16 16" aria-hidden>
                <SimboloElemento elemento={sintonia} x={0} y={0} r={7.5} />
              </svg>
              {`PURA DA ${reskinUpper('Sintonia')}: ${nomeCurto([...roda.puras].find((p) => roda.elemento[p] === sintonia) ?? '').toUpperCase()}`}
            </span>
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

/** Disco do elemento com o símbolo alquímico (△ fogo, ▽ água, ▽ com barra
 *  terra, △ com barra vento) — registro ELEMENTO_SIMBOLO. */
function SimboloElemento({ elemento, x, y, r }: { elemento: string; x: number; y: number; r: number }) {
  const s = ELEMENTO_SIMBOLO[elemento]
  const cor = ELEMENTO_COR[elemento] ?? ELEMENTO_COR.Universal!
  const t = r * 0.56
  const cima = s?.ponta !== 'baixo'
  const pts = cima
    ? [`${x},${y - t}`, `${x - t},${y + t * 0.75}`, `${x + t},${y + t * 0.75}`]
    : [`${x},${y + t}`, `${x - t},${y - t * 0.75}`, `${x + t},${y - t * 0.75}`]
  // barra horizontal a 1/3 da base (terra: perto do topo; vento: perto da base)
  const by = cima ? y + t * 0.2 : y - t * 0.2
  const bw = t * 0.62
  return (
    <g data-simbolo-elemento={elemento} style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={r} fill={cor} stroke="rgba(0,0,0,.35)" strokeWidth={1} />
      <polygon points={pts.join(' ')} fill="none" stroke={s?.tinta ?? '#fff'} strokeWidth={r / 6.5} strokeLinejoin="round" />
      {s?.barra ? <line x1={x - bw} y1={by} x2={x + bw} y2={by} stroke={s.tinta} strokeWidth={r / 6.5} /> : null}
    </g>
  )
}
