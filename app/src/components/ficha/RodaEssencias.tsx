// CÍRCULO DAS ESSÊNCIAS (2026-10-25) — o seletor de Essências Elementais do
// conjurador Anima (na aba MAGIAS): as 12 essências do Ciclo Elemental num
// anel (Adepta), o anel das Experientes por fora e o das Mestre compostas
// (entre duas vizinhas). ESSÊNCIAS POR SLOT: cada nó aceso compra a essência
// com um slot de magia do rank (`Magias.Slots` — ou `Magias.Secundaria.Slots`
// na linha MENOR do Treinamento de Animista) e grava em `Habilidades.Lista`
// com a fonte `Slot.<rank>` (rules/essencia-slots.ts). Regras de quem abre:
// rules/roda-essencias.ts.
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { reskinName, reskinText, reskinUpper } from '../../data/reskin'
import { fmPath, listaEntries, type ListaEntry } from './hero-model'
import { ELEMENTO_COR, ELEMENTO_SIMBOLO } from './registry'
import { clip, EditToggle } from './bits'
import { useNamedDocs } from './useNamedDocs'
import {
  compostaDoDoc,
  ehCompostaDoCatalogo,
  elementoDaSintonia,
  elementosDoCirculo,
  opostoDe,
  nomesCompostasDoCatalogo,
  estadoCompostas,
  estadoRoda,
  invalidasCompostas,
  HUB_RODA,
  parseEssencia,
  parseEssenciaMenor,
  rodaDoCatalogo,
  SUFIXO_TIER,
  type Composta,
  type EstadoNo,
  type RodaDef,
  type Tier,
} from '../../rules/roda-essencias'

/** Orçamento de slots de um rank no escopo do círculo. */
export type SlotsCirculo = Record<Tier, { total: number; usados: number }>

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
  slots,
  menor,
  edit,
  onAdd,
  onRemover,
  onOpen,
  onToggleEdit,
}: {
  /** FM DERIVADO (o que o herói tem, de qualquer fonte). */
  fm: Record<string, unknown>
  /** FM SALVO: só o que está gravado ali (slot) pode ser desfeito. */
  fmSalvo: Record<string, unknown>
  slots: SlotsCirculo
  /** Linha MENOR (Treinamento de Animista, Magias Secundárias). */
  menor?: boolean
  edit: boolean
  /** Compra a essência `alvo` com um slot do rank. */
  onAdd: (alvo: string, tier: Tier) => void
  /** Apaga do FM salvo a linha da essência `alvo`. */
  onRemover: (alvo: string) => void
  onOpen?: (nome: string) => void
  /** Botão Alterar/Concluir próprio do círculo (ausente = edição forçada). */
  onToggleEdit?: () => void
}) {
  const catalog = useCatalog()
  const ehComposta = useMemo(() => ehCompostaDoCatalogo(catalog), [catalog])
  const todasCompostas = useMemo(() => (menor ? [] : nomesCompostasDoCatalogo(catalog)), [catalog, menor])
  const existe = useMemo(() => (nome: string) => catalog.resolve(nome).kind === 'doc', [catalog])
  const hubDoc = useNamedDocs([HUB_RODA])(HUB_RODA)
  const roda = useMemo(() => rodaDoCatalogo(catalog, hubDoc?.frontmatter), [catalog, hubDoc])
  const [foco, setFoco] = useState<{ base: string; tier: Tier } | null>(null)
  if (!roda) return null
  return (
    <Roda
      roda={roda}
      ehComposta={ehComposta}
      todasCompostas={todasCompostas}
      existe={existe}
      fm={fm}
      fmSalvo={fmSalvo}
      slots={slots}
      menor={!!menor}
      edit={edit}
      onAdd={onAdd}
      onRemover={onRemover}
      onOpen={onOpen}
      onToggleEdit={onToggleEdit}
      foco={foco}
      setFoco={setFoco}
    />
  )
}

function Roda({
  roda,
  ehComposta,
  todasCompostas,
  existe,
  fm,
  fmSalvo,
  slots,
  menor,
  edit,
  onAdd,
  onRemover,
  onOpen,
  onToggleEdit,
  foco,
  setFoco,
}: {
  roda: RodaDef
  ehComposta: (nome: string) => boolean
  todasCompostas: string[]
  existe: (nome: string) => boolean
  fm: Record<string, unknown>
  fmSalvo: Record<string, unknown>
  slots: SlotsCirculo
  menor: boolean
  edit: boolean
  onAdd: (alvo: string, tier: Tier) => void
  onRemover: (alvo: string) => void
  onOpen?: (nome: string) => void
  onToggleEdit?: () => void
  foco: { base: string; tier: Tier } | null
  setFoco: (f: { base: string; tier: Tier } | null) => void
}) {
  const sintonia = elementoDaSintonia(fm['Sintonia'])
  const parse = (nome: string) => (menor ? parseEssenciaMenor(nome) : parseEssencia(nome))

  // O que o herói TEM: toda essência da lista de Habilidades derivada (slot,
  // concessão de regra, Essência Invertida…), com a fonte de cada uma.
  const derivadas = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))
  const salvas = listaEntries(fmPath(fmSalvo, 'Habilidades', 'Lista'))
  const tem: Record<Tier, Set<string>> = { A: new Set(), E: new Set(), M: new Set() }
  const temComposta = new Set<string>()
  const fonteDe = new Map<string, ListaEntry['fonte']>()
  for (const e of derivadas) {
    const p = parse(e.target)
    if (p) tem[p.tier].add(p.base)
    else if (!menor && ehComposta(e.target)) temComposta.add(e.target)
    else continue
    fonteDe.set(e.target, e.fonte)
  }
  // MESTRE compostas (entre duas vizinhas): o anel inteiro do mundo; bases
  // lidas dos Requisitos de cada nota.
  const nomesCompostas = [...new Set([...todasCompostas, ...temComposta])].sort()
  const docsCompostas = useNamedDocs(nomesCompostas)
  const compostas = nomesCompostas
    .map((nm) => compostaDoDoc(nm, docsCompostas(nm)?.frontmatter))
    .filter((c): c is Composta => !!c && roda.ordem.includes(c.a) && roda.ordem.includes(c.b))
  const composta = new Map(compostas.map((c) => [c.nome, c]))
  const estadoM = estadoCompostas({ roda, compostas, sintonia, temA: tem.A, temE: tem.E, temM: temComposta })
  const invalidasM = invalidasCompostas({ roda, compostas, sintonia, temA: tem.A, temE: tem.E, temM: temComposta })
  /** Alvo (nota) do nó: composta Mestre é a própria nota; Menor "<Essência>
   *  [Experiente ]Menor"; os demais "<Essência> <Tier>". */
  const alvoDe = (base: string, t: Tier) =>
    t === 'M' && composta.has(base)
      ? base
      : menor
        ? `${base} ${t === 'E' ? 'Experiente Menor' : 'Menor'}`
        : `${base} ${SUFIXO_TIER[t]}`
  /** Concessão de REGRA fixa (pura da sintonia, interface do círculo,
   *  Essência Invertida): não gasta slot nem se desfaz aqui. */
  const concedida = (base: string, t: Tier) => fonteDe.get(alvoDe(base, t))?.kind === 'Regra'
  /** Gravada no FM salvo (slot ou escolha antiga) — removível. */
  const removivel = (base: string, t: Tier) =>
    !concedida(base, t) &&
    salvas.some((e) => e.target === alvoDe(base, t) && (e.fonte.kind === 'Slot' || e.fonte.kind === 'Escolha'))
  const regra = derivadas.filter((e) => e.fonte.kind === 'Regra')
  // ESSÊNCIA INVERTIDA (técnica): a pura oposta que ela dá é exceção à regra.
  const invertidas = new Set(
    regra
      .filter((e) => e.fonte.target === 'Essência Invertida')
      .map((e) => parse(e.target)?.base)
      .filter((b): b is string => !!b),
  )
  // ÂNCORAS: Adeptas do ciclo concedidas por regra (pura / interface).
  const ancoras = new Set(
    regra
      .map((e) => parse(e.target))
      .filter((p) => p?.tier === 'A' && !invertidas.has(p.base))
      .map((p) => p!.base),
  )
  // DRUIDA: os dois elementos do Círculo Druídico (a nota que concede a
  // interface — duas Adeptas de dois elementos).
  const elementos = menor ? null : elementosDoCirculo(roda, regra.map((e) => ({ essencia: e.target, pai: e.fonte.target })))
  const estado = estadoRoda({ roda, sintonia, tem, ancoras, elementos, invertidas, primeiraDaSintonia: menor })
  // Elementos FORA (cinza): o oposto da sintonia; no Druida, os dois que não
  // são do círculo. O da sintonia (ou os do círculo) fica em evidência.
  const opostoSint = sintonia ? opostoDe(roda, sintonia) : null
  const foraDoCirculo = (el: string | undefined) =>
    !!el && (elementos ? !elementos.includes(el) : el === opostoSint)
  const emEvidencia = (el: string | undefined) => !!el && (elementos ? elementos.includes(el) : el === sintonia)
  // INVÁLIDAS (ficha antiga ou editada por fora): marcadas pra desfazer.
  const invalidas = new Map(estado.invalidas)
  for (const [nome, motivoM] of invalidasM) invalidas.set(`M:${nome}`, motivoM)
  const invalida = (base: string, t: Tier) => invalidas.get(`${t}:${base}`)

  const livres = (t: Tier) => slots[t].total - slots[t].usados
  const visivel: Record<Tier, boolean> = {
    A: slots.A.total > 0 || tem.A.size > 0,
    E: slots.E.total > 0 || tem.E.size > 0,
    M: !menor && (slots.M.total > 0 || tem.M.size > 0 || temComposta.size > 0),
  }

  /** Estado FINAL do nó: "livre" sem slot livre do rank vira "semVaga"; nota
   *  inexistente (Destruição Menor) fica fechada. */
  const st = (base: string, t: Tier): EstadoNo | 'semVaga' => {
    const s = (t === 'M' && composta.has(base) ? estadoM[base] : estado.no[t][base]) ?? 'fechado'
    if (s === 'livre' && !existe(alvoDe(base, t))) return 'fechado'
    if (s === 'livre' && livres(t) <= 0) return 'semVaga'
    return s
  }
  const motivo = (base: string, t: Tier): string => {
    const s = st(base, t)
    const nome = reskinName(alvoDe(base, t))
    if (s === 'tem') {
      if (invalida(base, t)) return `${nome} — INVÁLIDA: ${invalida(base, t)}`
      const f = fonteDe.get(alvoDe(base, t))
      return concedida(base, t) && f ? `${nome} — concedida por ${reskinName(f.target)}` : `${nome} — escolhida`
    }
    if (s === 'oposto') return elementos ? `${nome} — fora dos elementos do círculo` : `${nome} — elemento oposto à ${reskinText('sintonia')}`
    if (s === 'livre') return `${nome} — disponível`
    if (s === 'semVaga') return `${nome} — sem slot ${SUFIXO_TIER[t]} livre`
    if (!existe(alvoDe(base, t))) return `${nome} — ainda sem nota na vault`
    if (t === 'A') {
      if (menor && tem.A.size === 0) return `${nome} — a primeira é do elemento da ${reskinText('sintonia')}`
      return `${nome} — precisa de uma vizinha no ciclo`
    }
    if (t === 'M' && composta.has(base)) {
      const c = composta.get(base)!
      return `${nome} — precisa de ${reskinName(c.a)} e ${reskinName(c.b)} Adeptas e uma delas Experiente; a primeira Mestre toca a ${reskinText('sintonia')}`
    }
    return `${nome} — precisa da Adepta`
  }

  const clicar = (base: string, t: Tier) => {
    setFoco({ base, tier: t })
    const s = st(base, t)
    if (!edit) {
      if (s === 'tem') onOpen?.(alvoDe(base, t))
      return
    }
    if (s === 'livre') onAdd(alvoDe(base, t), t)
    else if (s === 'tem' && removivel(base, t)) onRemover(alvoDe(base, t))
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
    const solta = s === 'tem' && !!invalida(base, t)
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
            d={`M${x - 5},${y - 5} L${x + 5},${y + 5} M${x + 5},${y - 5} L${x - 5},${y + 5}`}
            stroke="var(--muted)"
            strokeWidth={1.2}
          />
        ) : null}
        {solta ? (
          <g data-roda-invalida="">
            <circle cx={x + r * 0.72} cy={y - r * 0.72} r={6} fill="var(--red)" />
            <text
              x={x + r * 0.72}
              y={y - r * 0.72}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 8.5, fontWeight: 900, fill: '#fff', pointerEvents: 'none' }}
            >
              !
            </text>
          </g>
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

  const contador = (t: Tier) =>
    slots[t].total > 0 ? `${slots[t].usados}/${slots[t].total}` : String(t === 'M' ? tem.M.size + temComposta.size : tem[t].size)
  const focoTxt = foco
    ? motivo(foco.base, foco.tier)
    : reskinText(edit ? 'Toque numa Essência acesa pra gastar um slot nela; numa escolhida pra desfazer.' : 'Toque numa Essência escolhida pra abrir a regra.')

  /** Metade do disco de raio r cortada pela diagonal (−45° ↔ 135°). */
  function meioDisco(r: number, lado: 'destruicao' | 'criacao'): string {
    const p1 = pt(r, -45)
    const p2 = pt(r, 135)
    // destruição: arco por cima/esquerda (anti-horário); criação: por baixo/direita
    return lado === 'destruicao'
      ? `M${p1.x},${p1.y} A${r},${r} 0 0 0 ${p2.x},${p2.y} Z`
      : `M${p1.x},${p1.y} A${r},${r} 0 0 1 ${p2.x},${p2.y} Z`
  }
  /** Diagonal em zigue-zague (os "dentes" que encaixam as duas metades). */
  function dentes(r: number, n: number, amp: number): string {
    const p1 = pt(r, -45)
    const p2 = pt(r, 135)
    const nx = -Math.SQRT1_2
    const ny = -Math.SQRT1_2 // normal pro lado da destruição
    const pts: string[] = []
    for (let k = 0; k <= n * 2; k++) {
      const f = k / (n * 2)
      const off = k === 0 || k === n * 2 ? 0 : (k % 2 ? amp : -amp)
      pts.push(`${(p1.x + (p2.x - p1.x) * f + nx * off).toFixed(1)},${(p1.y + (p2.y - p1.y) * f + ny * off).toFixed(1)}`)
    }
    return pts.join(' L')
  }
  /** As duas metades do centro (Destruição × Criação), clicáveis como nós
   *  Adeptos da essência universal correspondente; sem nota na vault, a
   *  metade fica só desenhada. */
  function centroUniversal() {
    const RC = 38
    const destr = roda.universais.find((u) => /Destrui/i.test(u)) ?? null
    const criac = roda.universais.find((u) => /Cria/i.test(u)) ?? null
    const zig = dentes(RC, 3, 6)
    const metade = (lado: 'destruicao' | 'criacao', base: string | null) => {
      const p1 = pt(RC, -45)
      const p2 = pt(RC, 135)
      const arc =
        lado === 'destruicao'
          ? `M${p1.x},${p1.y} A${RC},${RC} 0 0 0 ${p2.x},${p2.y}`
          : `M${p1.x},${p1.y} A${RC},${RC} 0 0 1 ${p2.x},${p2.y}`
      // volta pela linha dentada (de p2 até p1)
      const volta = zig.split(' L').reverse().join(' L')
      const d = `${arc} L${volta} Z`
      const escuro = lado === 'destruicao'
      const s = base ? st(base, 'A') : 'fechado'
      const centroide = pt(14, escuro ? -135 : 45)
      const rotulo = escuro ? 'DESTRUIÇÃO' : 'CRIAÇÃO'
      const titulo = base ? motivo(base, 'A') : `${rotulo} — ainda sem nota na vault`
      const ativo = !!base && edit && (s === 'livre' || s === 'tem')
      return (
        <g
          key={lado}
          data-roda-no={base ? `A:${base}` : undefined}
          data-roda-estado={base ? s : undefined}
          data-roda-metade={lado}
          role={base ? 'button' : undefined}
          tabIndex={base ? 0 : undefined}
          aria-label={titulo}
          onClick={base ? () => clicar(base, 'A') : undefined}
          onKeyDown={base ? tecla(base, 'A') : undefined}
          onMouseEnter={base ? () => setFoco({ base, tier: 'A' }) : undefined}
          style={{ cursor: ativo || s === 'tem' ? 'pointer' : 'default', outline: 'none' }}
        >
          <title>{titulo}</title>
          <path
            d={d}
            fill={escuro ? '#0d0d0d' : '#f1efe9'}
            opacity={s === 'tem' ? 1 : 0.85}
            stroke={base && (s === 'tem' || (s === 'livre' && edit)) ? 'var(--accent)' : escuro ? '#8a8578' : 'var(--line2)'}
            strokeWidth={s === 'tem' ? 2 : 1.2}
            strokeDasharray={base && s === 'livre' && edit ? '4 3' : undefined}
            strokeLinejoin="round"
          />
          {base && invalida(base, 'A') ? <circle cx={centroide.x} cy={centroide.y - 13} r={4} fill="var(--red)" /> : null}
          <text
            x={centroide.x}
            y={centroide.y}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-45 ${centroide.x} ${centroide.y})`}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 6.4,
              fontWeight: 800,
              letterSpacing: '.08em',
              fill: escuro ? '#f1efe9' : '#151515',
              opacity: base ? 1 : 0.6,
              pointerEvents: 'none',
            }}
          >
            {rotulo}
          </text>
        </g>
      )
    }
    return (
      <g data-roda-centro="">
        <circle r={RC + 7} fill="none" stroke="var(--line2)" strokeDasharray="3 3" />
        {metade('destruicao', destr)}
        {metade('criacao', criac)}
        {/* Mestre universal (Avatar): nó pequeno do lado da Criação */}
        {visivel.M && criac ? no(criac, 'M', pt(RC + 18, 45).x, pt(RC + 18, 45).y, false) : null}
      </g>
    )
  }

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
          {`// ${reskinUpper(menor ? 'Círculo das Essências Menores' : 'Círculo das Essências')}`}
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
              color: livres(t) < 0 ? 'var(--red)' : livres(t) > 0 && edit ? 'var(--gold)' : 'var(--muted)',
              padding: '3px 8px',
              border: '1px solid var(--line2)',
              clipPath: clip(5),
            }}
          >
            {`${SUFIXO_TIER[t].toUpperCase()} ${contador(t)}`}
          </span>
        ))}
        {onToggleEdit ? <EditToggle edit={edit} onToggle={onToggleEdit} /> : null}
      </div>
      {invalidas.size > 0 ? (
        <div
          data-roda-invalidas={invalidas.size}
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--red)',
            padding: '7px 10px',
            border: '1px solid color-mix(in srgb,var(--red) 45%,var(--line2))',
            background: 'color-mix(in srgb,var(--red) 8%,transparent)',
            clipPath: clip(6),
          }}
        >
          <strong style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em' }}>
            {`! ${invalidas.size} ${reskinUpper(invalidas.size === 1 ? 'Essência inválida' : 'Essências inválidas')}`}
          </strong>
          {' — '}
          {[...invalidas.entries()]
            .map(([k, m]) => {
              const [t, ...resto] = k.split(':')
              return `${reskinName(alvoDe(resto.join(':'), t as Tier))} (${m})`
            })
            .join(' · ')}
          {'. '}
          {reskinText(edit ? 'Toque na Essência marcada pra desfazer e escolha de novo.' : 'Use Alterar pra desfazer e escolher de novo.')}
        </div>
      ) : null}
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
            fill={foraDoCirculo(roda.elemento[b]) ? '#8f8f8f' : corDe(b)}
            opacity={foraDoCirculo(roda.elemento[b]) ? 0.08 : tem.A.has(b) ? 0.16 : emEvidencia(roda.elemento[b]) ? 0.1 : 0.05}
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
            // fronteira com o oposto: só um X discreto, SEM a linha
            if (opB === opC) return <path key={`arco-${b}`} d={arco(i, 'A')} fill="none" stroke="var(--line)" strokeWidth={0.8} strokeDasharray="2 6" />
            const x = pt(R.A, ang(i + 0.5))
            return (
              <path
                key={`arco-${b}`}
                data-roda-corte={`${b}|${c}`}
                d={`M${x.x - 4},${x.y - 4} L${x.x + 4},${x.y + 4} M${x.x + 4},${x.y - 4} L${x.x - 4},${x.y + 4}`}
                stroke="var(--muted)"
                strokeWidth={1.3}
                strokeLinecap="round"
                opacity={0.6}
              />
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
        {/* disco das puras dividido na diagonal: Destruição mais escura,
            Criação mais clara */}
        <path d={meioDisco(R.A - NO_R.A - 8, 'destruicao')} fill="#000" opacity={0.14} />
        <path d={meioDisco(R.A - NO_R.A - 8, 'criacao')} fill="#fff" opacity={0.07} />
        <line
          x1={pt(R.A - NO_R.A - 8, -45).x}
          y1={pt(R.A - NO_R.A - 8, -45).y}
          x2={pt(R.A - NO_R.A - 8, 135).x}
          y2={pt(R.A - NO_R.A - 8, 135).y}
          stroke="var(--line2)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
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
              {emEvidencia(el) ? (
                <>
                  <circle cx={m.x} cy={m.y} r={24} fill={corDe(p)} opacity={0.18} />
                  <circle cx={m.x} cy={m.y} r={20} fill="none" stroke={corDe(p)} strokeWidth={1.6} opacity={daSintonia ? 0.9 : 0.6} />
                </>
              ) : null}
              <SimboloElemento elemento={el} x={m.x} y={m.y} r={emEvidencia(el) ? 16 : 12} cinza={foraDoCirculo(el)} />
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
        {/* CENTRO = Essência Universal: duas metades que se encaixam por
            dentes ao longo da diagonal — DESTRUIÇÃO (lado de Fogo e Vento) e
            CRIAÇÃO (lado de Água e Terra), como no diagrama de referência. */}
        {centroUniversal()}
      </svg>
      <div
        data-roda-foco=""
        style={{
          minHeight: 18,
          textAlign: 'center',
          fontSize: 12.5,
          color: foco && st(foco.base, foco.tier) === 'tem' && invalida(foco.base, foco.tier) ? 'var(--red)' : 'var(--muted)',
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
function SimboloElemento({
  elemento,
  x,
  y,
  r,
  cinza,
}: {
  elemento: string
  x: number
  y: number
  r: number
  /** Elemento fora (oposto / fora do círculo do druida): disco cinza apagado. */
  cinza?: boolean
}) {
  const s = ELEMENTO_SIMBOLO[elemento]
  const cor = cinza ? '#8f8f8f' : (ELEMENTO_COR[elemento] ?? ELEMENTO_COR.Universal!)
  const t = r * 0.56
  const cima = s?.ponta !== 'baixo'
  const pts = cima
    ? [`${x},${y - t}`, `${x - t},${y + t * 0.75}`, `${x + t},${y + t * 0.75}`]
    : [`${x},${y + t}`, `${x - t},${y - t * 0.75}`, `${x + t},${y - t * 0.75}`]
  // barra horizontal a 1/3 da base (terra: perto do topo; vento: perto da base)
  const by = cima ? y + t * 0.2 : y - t * 0.2
  const bw = t * 0.62
  return (
    <g data-simbolo-elemento={elemento} style={{ pointerEvents: 'none', opacity: cinza ? 0.55 : 1 }}>
      <circle cx={x} cy={y} r={r} fill={cor} stroke="rgba(0,0,0,.35)" strokeWidth={1} />
      <polygon points={pts.join(' ')} fill="none" stroke={s?.tinta ?? '#fff'} strokeWidth={r / 6.5} strokeLinejoin="round" />
      {s?.barra ? <line x1={x - bw} y1={by} x2={x + bw} y2={by} stroke={s.tinta} strokeWidth={r / 6.5} /> : null}
    </g>
  )
}
