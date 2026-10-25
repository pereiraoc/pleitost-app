// RODA DAS ESSÊNCIAS (2026-10-25): o Ciclo Elemental como regra de escolha do
// Animista. Fonte de verdade:
//  - ORDEM do ciclo = FM `Ciclo_Elemental` da nota-hub [[Essências Elementais]]
//    (12 essências, sentido horário a partir do topo); vizinhas no ciclo são
//    exatamente os "Requer [[X]] ou [[Y]]" de cada essência.
//  - ELEMENTO de cada essência = a pasta "Essências Elementais de <Elemento>".
//  - PURA = a do meio do trio do elemento no ciclo (Flamejante, Mineral,
//    Hidratante, Ventania); OPOSTO = o elemento da pura do lado oposto da roda.
// Regras (essências por SLOT de magia, 2026-10-25 — rules/essencia-slots.ts):
//  - Adepta: a pura da sintonia vem de graça (Magias Anima); cada slot abre
//    uma vizinha de uma que já tem; nunca do elemento oposto. Universais
//    (Criação, Destruição) sempre acessíveis.
//  - Experiente: também é CAMINHO — a primeira é do elemento da sintonia
//    (Animista e Druida), e cada slot abre uma vizinha de uma Experiente que
//    já tem; sempre exige a Adepta da mesma essência. Universais esperam pela
//    primeira Experiente do ciclo.
//  - Mestre composta: as DUAS Experientes; a primeira toca o elemento da
//    sintonia. Mestre universal: a Experiente dela.
import type { Catalog } from '../data/catalog'
import { wikiTarget } from '../components/ficha/hero-model'

export type Tier = 'A' | 'E' | 'M'
export const SUFIXO_TIER: Record<Tier, string> = { A: 'Adepta', E: 'Experiente', M: 'Mestre' }

export interface RodaDef {
  /** Basenames das notas-hub, na ordem do ciclo ('Essência Flamejante', …). */
  ordem: string[]
  /** Elemento de cada essência do ciclo ('Fogo' | 'Água' | 'Terra' | 'Vento'). */
  elemento: Record<string, string>
  puras: Set<string>
  /** Essências universais (fora do ciclo, sempre acessíveis). */
  universais: string[]
}

/** Nota-hub com o FM `Ciclo_Elemental`. */
export const HUB_RODA = 'Essências Elementais'
const PASTA_ELEMENTO = /Essências Elementais de ([^/]+)\//
const PASTA_UNIVERSAL = /Essências Universais\/([^/]+)\//

/** Monta a roda do catálogo: ordem do FM do hub + elemento pela pasta. null
 *  quando o mundo não declara o ciclo (sem roda, a ficha fica nos dropdowns). */
export function rodaDoCatalogo(catalog: Catalog, hubFm: Record<string, unknown> | undefined): RodaDef | null {
  const raw = hubFm?.['Ciclo_Elemental']
  if (!Array.isArray(raw) || raw.length < 3) return null
  const ordem = raw.map((x) => wikiTarget(String(x))).filter((x) => x !== '')
  const elemento: Record<string, string> = {}
  const universais = new Set<string>()
  for (const e of catalog.content) {
    const base = e.basename ?? e.id.split('/').pop() ?? ''
    const el = PASTA_ELEMENTO.exec(e.path)
    if (el && ordem.includes(base)) elemento[base] = el[1]!.trim()
    const un = PASTA_UNIVERSAL.exec(e.path)
    if (un && base === un[1]) universais.add(base)
  }
  if (ordem.some((b) => !elemento[b])) return null
  const puras = new Set<string>()
  ordem.forEach((b, i) => {
    const antes = ordem[(i + ordem.length - 1) % ordem.length]!
    const depois = ordem[(i + 1) % ordem.length]!
    if (elemento[antes] === elemento[b] && elemento[depois] === elemento[b]) puras.add(b)
  })
  return { ordem, elemento, puras, universais: [...universais].sort() }
}

/** Vizinhas no ciclo. */
export function vizinhas(roda: RodaDef, base: string): string[] {
  const i = roda.ordem.indexOf(base)
  if (i < 0) return []
  const n = roda.ordem.length
  return [roda.ordem[(i + n - 1) % n]!, roda.ordem[(i + 1) % n]!]
}

/** Pura do elemento. */
export function puraDe(roda: RodaDef, elemento: string): string | null {
  return [...roda.puras].find((p) => roda.elemento[p] === elemento) ?? null
}

/** Elemento oposto: o da pura do lado oposto da roda. */
export function opostoDe(roda: RodaDef, elemento: string): string | null {
  const p = puraDe(roda, elemento)
  if (!p) return null
  const i = roda.ordem.indexOf(p)
  return roda.elemento[roda.ordem[(i + roda.ordem.length / 2) % roda.ordem.length]!] ?? null
}

/** "[[Traço Elemental do Fogo]]" → 'Fogo'. */
export function elementoDaSintonia(sintonia: unknown): string | null {
  const m = /Traço Elemental d[oa] ([^\]|\s]+)/.exec(String(sintonia ?? ''))
  return m ? m[1]! : null
}

/** "Essência Flamejante Adepta" → { base: 'Essência Flamejante', tier: 'A' }. */
export function parseEssencia(nome: string): { base: string; tier: Tier } | null {
  const m = /^(Essência .+) (Adepta|Experiente|Mestre)$/.exec(wikiTarget(nome) || nome)
  if (!m) return null
  const tier = (Object.entries(SUFIXO_TIER).find(([, s]) => s === m[2])?.[0] ?? 'A') as Tier
  return { base: m[1]!, tier }
}

export type EstadoNo = 'tem' | 'livre' | 'fechado' | 'oposto'

export interface EstadoRoda {
  /** Estado de cada essência (ciclo + universais) em cada tier. */
  no: Record<Tier, Record<string, EstadoNo>>
  /** Adeptas que o jogador tem mas que não se ligam a uma âncora pelo ciclo. */
  soltas: Set<string>
  /** Essências que o herói TEM mas que quebram a regra (ficha antiga ou
   *  editada por fora) — `${tier}:${base}` → motivo. Mostradas como inválidas
   *  pra serem desfeitas e escolhidas de novo. */
  invalidas: Map<string, string>
}

/** Estado de cada nó da roda dado o que o herói já tem (ESSÊNCIAS POR SLOT,
 *  2026-10-25). O caminho parte das ÂNCORAS — as Adeptas que a regra concede
 *  de graça (a pura da sintonia do Animista; as duas da interface do Círculo
 *  Druídico) — e cada slot Adepto abre uma VIZINHA de uma que o herói já tem,
 *  pros dois lados. Nunca no elemento oposto (Animista) nem fora dos dois
 *  elementos do círculo (Druida). Universais (Criação, Destruição) a qualquer
 *  momento. A da Essência Invertida é exceção isolada: não é oposta e não abre
 *  caminho. */
export function estadoRoda(input: {
  roda: RodaDef
  sintonia: string | null
  tem: Record<Tier, Set<string>>
  /** Adeptas do ciclo concedidas por regra fixa (âncoras do caminho). */
  ancoras?: Set<string>
  /** DRUIDA: os dois elementos ADJACENTES do Círculo Druídico; os outros dois
   *  ficam fora (são os opostos de um deles). */
  elementos?: string[] | null
  /** Essências vindas da técnica ESSÊNCIA INVERTIDA (a pura do elemento
   *  oposto): exceção explícita — nem oposta nem caminho. */
  invertidas?: Set<string>
  /** Linha MENOR (Treinamento de Animista): sem âncora — a primeira é de
   *  qualquer essência do elemento da sintonia; as universais esperam por ela. */
  primeiraDaSintonia?: boolean
}): EstadoRoda {
  const { roda, sintonia, tem, elementos } = input
  const invertidas = input.invertidas ?? new Set<string>()
  const druida = !!elementos && elementos.length > 0
  const oposto = sintonia ? opostoDe(roda, sintonia) : null
  const pura = sintonia ? puraDe(roda, sintonia) : null
  const fora = (b: string) => {
    const el = roda.elemento[b]
    if (!el) return false
    return druida ? !elementos!.includes(el) : el === oposto
  }
  const todas = [...roda.ordem, ...roda.universais]
  const no: Record<Tier, Record<string, EstadoNo>> = { A: {}, E: {}, M: {} }
  const ciclo = [...tem.A].filter((b) => roda.ordem.includes(b) && !invertidas.has(b))
  const ancoras = [...(input.ancoras ?? [])].filter((b) => roda.ordem.includes(b) && !invertidas.has(b))

  // Adepta: vizinhas do que tem (âncoras inclusas); sem nada ainda, a pura da
  // sintonia (Animista sem a concessão) ou o elemento da sintonia (Menor).
  const alcance = new Set<string>()
  for (const b of ciclo) for (const v of vizinhas(roda, b)) alcance.add(v)
  if (ciclo.length === 0) {
    if (input.primeiraDaSintonia) {
      for (const b of roda.ordem) if (sintonia && roda.elemento[b] === sintonia) alcance.add(b)
    } else if (pura && !druida) alcance.add(pura)
  }
  const universalAberta = !input.primeiraDaSintonia || ciclo.length > 0
  for (const b of todas) {
    const universal = roda.universais.includes(b)
    if (tem.A.has(b)) no.A[b] = 'tem'
    else if (universal) no.A[b] = universalAberta ? 'livre' : 'fechado'
    else if (fora(b)) no.A[b] = 'oposto'
    else no.A[b] = alcance.has(b) ? 'livre' : 'fechado'
  }

  // Experiente: caminho próprio. A primeira é do elemento da sintonia; as
  // seguintes, vizinhas de uma Experiente que já tem — sempre com a Adepta.
  // A Invertida segue isolada (Experiente dela só exige a Adepta).
  const cicloE = [...tem.E].filter((b) => roda.ordem.includes(b) && !invertidas.has(b))
  const daSintonia = (b: string) => !sintonia || roda.elemento[b] === sintonia
  const alcanceE = new Set<string>()
  if (cicloE.length === 0) {
    for (const b of roda.ordem) if (daSintonia(b)) alcanceE.add(b)
  } else for (const b of cicloE) for (const v of vizinhas(roda, b)) alcanceE.add(v)
  for (const b of todas) {
    if (tem.E.has(b)) no.E[b] = 'tem'
    else if (!tem.A.has(b)) no.E[b] = 'fechado'
    else if (invertidas.has(b)) no.E[b] = 'livre'
    else if (roda.universais.includes(b)) no.E[b] = cicloE.length > 0 ? 'livre' : 'fechado'
    else no.E[b] = alcanceE.has(b) ? 'livre' : 'fechado'
  }
  // Mestre universal: a Experiente dela.
  for (const b of todas) {
    if (tem.M.has(b)) no.M[b] = 'tem'
    else no.M[b] = tem.E.has(b) ? 'livre' : 'fechado'
  }

  // Conexão: Adeptas do ciclo ligadas a uma âncora por posse contígua.
  const raizes = ancoras.length
    ? ancoras.filter((b) => tem.A.has(b))
    : input.primeiraDaSintonia
      ? ciclo.filter((b) => roda.elemento[b] === sintonia)
      : pura && !druida && tem.A.has(pura)
        ? [pura]
        : []
  const soltas = new Set<string>()
  if (raizes.length || ciclo.length) {
    const ligadas = new Set<string>()
    const fila = [...raizes]
    while (fila.length) {
      const b = fila.pop()!
      if (ligadas.has(b)) continue
      ligadas.add(b)
      for (const v of vizinhas(roda, b)) if (ciclo.includes(v) && !ligadas.has(v)) fila.push(v)
    }
    for (const b of ciclo) if (!ligadas.has(b)) soltas.add(b)
  }
  const invalidas = new Map<string, string>()
  for (const b of ciclo) {
    if (fora(b)) invalidas.set(`A:${b}`, druida ? 'fora dos dois elementos do círculo' : 'elemento oposto à sintonia')
    else if (soltas.has(b)) invalidas.set(`A:${b}`, 'fora do caminho do ciclo (não liga numa essência concedida)')
  }
  // Experientes fora do caminho: não ligam, de vizinha em vizinha, numa
  // Experiente do elemento da sintonia.
  const ligadasE = new Set<string>()
  const filaE = cicloE.filter(daSintonia)
  while (filaE.length) {
    const b = filaE.pop()!
    if (ligadasE.has(b)) continue
    ligadasE.add(b)
    for (const v of vizinhas(roda, b)) if (cicloE.includes(v) && !ligadasE.has(v)) filaE.push(v)
  }
  for (const b of tem.E) {
    if (!tem.A.has(b)) invalidas.set(`E:${b}`, 'sem a Adepta')
    else if (cicloE.includes(b) && !ligadasE.has(b))
      invalidas.set(`E:${b}`, 'fora do caminho das Experientes (a primeira é do elemento da sintonia)')
  }
  for (const b of tem.M) if (!tem.E.has(b)) invalidas.set(`M:${b}`, 'sem a Experiente')
  return { no, soltas, invalidas }
}

/** Essência MESTRE composta: duas vizinhas do ciclo (Meteoro = Flamejante +
 *  Explosiva). As bases vêm dos `Requisito Contem(Habilidades) [[Essência X
 *  Experiente]]` da própria nota — o requisito É a definição da composta. */
export interface Composta {
  nome: string
  a: string
  b: string
}

const REQ_BASE = /Requisito\s+Contem\(Habilidades\)\s+\[\[(Essência .+?) (?:Adepta|Experiente)\]\]/

export function compostaDoDoc(nome: string, fm: Record<string, unknown> | undefined): Composta | null {
  const regras = Array.isArray(fm?.['Elementos_de_Regra']) ? (fm!['Elementos_de_Regra'] as unknown[]) : []
  const bases = regras.map((r) => REQ_BASE.exec(String(r))?.[1]).filter((x): x is string => !!x)
  return bases.length === 2 ? { nome, a: bases[0]!, b: bases[1]! } : null
}

/** Estado de cada composta: tem / livre (as DUAS Experientes; a primeira
 *  Mestre toca o elemento da sintonia) / fechado. */
export function estadoCompostas(input: {
  roda: RodaDef
  compostas: Composta[]
  sintonia: string | null
  temA: Set<string>
  temE: Set<string>
  temM: Set<string>
}): Record<string, EstadoNo> {
  const { roda, compostas, sintonia, temE, temM } = input
  const tocaSintonia = (c: Composta) => !!sintonia && (roda.elemento[c.a] === sintonia || roda.elemento[c.b] === sintonia)
  const jaTemDaSintonia = compostas.some((c) => temM.has(c.nome) && tocaSintonia(c))
  const out: Record<string, EstadoNo> = {}
  for (const c of compostas) {
    if (temM.has(c.nome)) out[c.nome] = 'tem'
    else if (!temE.has(c.a) || !temE.has(c.b)) out[c.nome] = 'fechado'
    else if (sintonia && !jaTemDaSintonia && !tocaSintonia(c)) out[c.nome] = 'fechado'
    else out[c.nome] = 'livre'
  }
  return out
}

/** Mestre compostas que o herói tem e que quebram a regra → motivo. */
export function invalidasCompostas(input: {
  roda: RodaDef
  compostas: Composta[]
  sintonia: string | null
  temA: Set<string>
  temE: Set<string>
  temM: Set<string>
}): Map<string, string> {
  const { roda, compostas, sintonia, temE, temM } = input
  const out = new Map<string, string>()
  const minhas = compostas.filter((c) => temM.has(c.nome))
  for (const c of minhas) {
    if (!temE.has(c.a) || !temE.has(c.b)) out.set(c.nome, 'falta uma das duas Experientes')
  }
  const toca = (c: Composta) => !!sintonia && (roda.elemento[c.a] === sintonia || roda.elemento[c.b] === sintonia)
  if (sintonia && minhas.length > 0 && !minhas.some(toca))
    for (const c of minhas) if (!out.has(c.nome)) out.set(c.nome, 'nenhuma Mestre toca o elemento da sintonia')
  return out
}

/** "É nota de Essência Mestre composta?" — pasta `Essências Mestre` do hub. */
export function ehCompostaDoCatalogo(catalog: Catalog): (nome: string) => boolean {
  const nomes = new Set(nomesCompostasDoCatalogo(catalog))
  return (nome: string) => nomes.has(nome)
}

/** Todas as Essências Mestre compostas do mundo (anel Mestre inteiro). */
export function nomesCompostasDoCatalogo(catalog: Catalog): string[] {
  return catalog.content
    .filter((e) => /\/Essências Mestre\//.test(e.path))
    .map((e) => e.basename ?? e.id.split('/').pop() ?? '')
    .filter(Boolean)
    .sort()
}

/** Elementos do Círculo Druídico: a nota que CONCEDE (regra fixa) duas
 *  Adeptas de dois elementos diferentes — a interface do círculo. A pura do
 *  Animista e a da Essência Invertida vêm uma por nota. null = não é druida. */
export function elementosDoCirculo(
  roda: RodaDef,
  concessoes: Array<{ essencia: string; pai: string }>,
): string[] | null {
  const porPai = new Map<string, Set<string>>()
  for (const { essencia, pai } of concessoes) {
    const p = parseEssencia(essencia)
    const el = p && p.tier === 'A' ? roda.elemento[p.base] : undefined
    if (!el) continue
    const set = porPai.get(pai) ?? new Set<string>()
    set.add(el)
    porPai.set(pai, set)
  }
  for (const els of porPai.values()) if (els.size === 2) return [...els]
  return null
}

/** Essência MENOR (linha secundária): "Essência Flamejante Menor" (A) e
 *  "Essência Flamejante Experiente Menor" (E). */
export function parseEssenciaMenor(nome: string): { base: string; tier: Tier } | null {
  const m = /^(Essência .+?) (Experiente )?Menor$/.exec(wikiTarget(nome) || nome)
  return m ? { base: m[1]!, tier: m[2] ? 'E' : 'A' } : null
}
