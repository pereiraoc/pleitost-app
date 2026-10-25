// RODA DAS ESSÊNCIAS (2026-10-25): o Ciclo Elemental como regra de escolha do
// Animista. Fonte de verdade:
//  - ORDEM do ciclo = FM `Ciclo_Elemental` da nota-hub [[Essências Elementais]]
//    (12 essências, sentido horário a partir do topo); vizinhas no ciclo são
//    exatamente os "Requer [[X]] ou [[Y]]" de cada essência.
//  - ELEMENTO de cada essência = a pasta "Essências Elementais de <Elemento>".
//  - PURA = a do meio do trio do elemento no ciclo (Flamejante, Mineral,
//    Hidratante, Ventania); OPOSTO = o elemento da pura do lado oposto da roda.
// Regras (Magias Anima / Elementalista / Avatar, vault 2026-10-12):
//  - Adepta: começa pela PURA da sintonia (independe de pré-requisito); cada
//    nova precisa ser vizinha de uma que já tem; nunca do elemento oposto.
//    Universais (Criação) são sempre acessíveis.
//  - Experiente: de uma essência que já tem (Adepta); a primeira tem que ser
//    da sintonia ("ao menos uma das escolhas deve ser referente a sua sintonia").
//  - Mestre: de uma essência com Experiente; a primeira tem que ser da sintonia.
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
  /** Adeptas que o jogador tem mas que não se ligam à pura pelo ciclo. */
  soltas: Set<string>
  /** Essências que o herói TEM mas que quebram a regra (ficha antiga ou
   *  editada por fora) — `${tier}:${base}` → motivo. Mostradas como inválidas
   *  pra serem desfeitas e escolhidas de novo. */
  invalidas: Map<string, string>
}

/** Estado de cada nó da roda dado o que o herói já tem. `aplicaCiclo` = regras
 *  do Animista (pura primeiro + vizinhança); sem ele (Druida) só a posse. */
export function estadoRoda(input: {
  roda: RodaDef
  sintonia: string | null
  tem: Record<Tier, Set<string>>
  aplicaCiclo: boolean
  /** DRUIDA (2026-10-25): os dois elementos ADJACENTES do Círculo Druídico.
   *  Ganha de graça as duas essências da interface entre eles e escolhe
   *  QUALQUER essência desses dois elementos (as pontas de cada trio se
   *  ligam); os outros dois elementos ficam fora (são os opostos de um deles). */
  elementos?: string[] | null
}): EstadoRoda {
  const { roda, sintonia, tem, elementos } = input
  const druida = !!elementos && elementos.length > 0
  const aplicaCiclo = input.aplicaCiclo && !druida
  const oposto = sintonia ? opostoDe(roda, sintonia) : null
  const pura = sintonia ? puraDe(roda, sintonia) : null
  const todas = [...roda.ordem, ...roda.universais]
  const no: Record<Tier, Record<string, EstadoNo>> = { A: {}, E: {}, M: {} }
  const ehDaSintonia = (b: string) => !!sintonia && roda.elemento[b] === sintonia
  const temCiclo = (t: Tier) => [...tem[t]].filter((b) => roda.ordem.includes(b))

  // Adepta
  const ciclo = temCiclo('A')
  const alcance = new Set<string>()
  if (aplicaCiclo) {
    if (ciclo.length === 0) {
      if (pura) alcance.add(pura)
    } else {
      for (const b of ciclo) for (const v of vizinhas(roda, b)) alcance.add(v)
      if (pura) alcance.add(pura)
    }
  }
  for (const b of todas) {
    const universal = roda.universais.includes(b)
    if (tem.A.has(b)) no.A[b] = 'tem'
    else if (druida && !universal) no.A[b] = elementos!.includes(roda.elemento[b]!) ? 'livre' : 'oposto'
    else if (!universal && oposto && roda.elemento[b] === oposto) no.A[b] = 'oposto'
    else if (universal || !aplicaCiclo || alcance.has(b)) no.A[b] = 'livre'
    else no.A[b] = 'fechado'
  }

  // Experiente / Mestre: precisa do tier anterior; a 1ª é da sintonia.
  const degrau = (t: 'E' | 'M', anterior: Tier) => {
    const jaTemDaSintonia = temCiclo(t).some(ehDaSintonia)
    for (const b of todas) {
      const universal = roda.universais.includes(b)
      if (tem[t].has(b)) no[t][b] = 'tem'
      else if (!tem[anterior].has(b)) no[t][b] = 'fechado'
      else if (aplicaCiclo && sintonia && !jaTemDaSintonia && !universal && !ehDaSintonia(b)) no[t][b] = 'fechado'
      else if (aplicaCiclo && sintonia && !jaTemDaSintonia && universal) no[t][b] = 'fechado'
      else no[t][b] = 'livre'
    }
  }
  degrau('E', 'A')
  degrau('M', 'E')

  // Conexão: Adeptas do ciclo ligadas à pura por posse contígua.
  const soltas = new Set<string>()
  if (aplicaCiclo && pura) {
    const ligadas = new Set<string>()
    const fila = tem.A.has(pura) ? [pura] : []
    while (fila.length) {
      const b = fila.pop()!
      if (ligadas.has(b)) continue
      ligadas.add(b)
      for (const v of vizinhas(roda, b)) if (tem.A.has(v) && !ligadas.has(v)) fila.push(v)
    }
    for (const b of ciclo) if (!ligadas.has(b)) soltas.add(b)
  }
  const invalidas = new Map<string, string>()
  for (const b of soltas) invalidas.set(`A:${b}`, 'fora do caminho do ciclo (não liga na pura da sintonia)')
  for (const b of ciclo) {
    if (druida && !elementos!.includes(roda.elemento[b]!)) invalidas.set(`A:${b}`, 'fora dos dois elementos do círculo')
    else if (!druida && oposto && roda.elemento[b] === oposto) invalidas.set(`A:${b}`, 'elemento oposto à sintonia')
  }
  for (const [t, ant] of [['E', 'A'], ['M', 'E']] as const) {
    for (const b of tem[t]) {
      if (!tem[ant].has(b)) invalidas.set(`${t}:${b}`, `sem a ${ant === 'A' ? 'Adepta' : 'Experiente'}`)
    }
  }
  // Animista: as Experientes do ciclo precisam de ao menos uma da sintonia.
  if (aplicaCiclo && sintonia) {
    const e = temCiclo('E')
    if (e.length > 0 && !e.some(ehDaSintonia))
      for (const b of e) if (!invalidas.has(`E:${b}`)) invalidas.set(`E:${b}`, 'nenhuma Experiente é da sintonia')
  }
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

const REQ_EXPERIENTE = /Requisito\s+Contem\(Habilidades\)\s+\[\[(Essência .+?) Experiente\]\]/

export function compostaDoDoc(nome: string, fm: Record<string, unknown> | undefined): Composta | null {
  const regras = Array.isArray(fm?.['Elementos_de_Regra']) ? (fm!['Elementos_de_Regra'] as unknown[]) : []
  const bases = regras.map((r) => REQ_EXPERIENTE.exec(String(r))?.[1]).filter((x): x is string => !!x)
  return bases.length === 2 ? { nome, a: bases[0]!, b: bases[1]! } : null
}

/** Estado de cada composta: tem / livre (as DUAS Experientes; a primeira
 *  Mestre toca o elemento da sintonia) / fechado. */
export function estadoCompostas(input: {
  roda: RodaDef
  compostas: Composta[]
  sintonia: string | null
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

/** Elementos do Círculo Druídico de um herói: os elementos das opções das
 *  escolhas Adeptas, quando elas cobrem EXATAMENTE dois (o Animista cobre três:
 *  o seu e os dois aliados). null = não é druida. */
export function elementosDoCirculo(roda: RodaDef, opcoesAdeptas: string[]): string[] | null {
  const els = new Set<string>()
  for (const o of opcoesAdeptas) {
    const p = parseEssencia(o)
    const el = p ? roda.elemento[p.base] : undefined
    if (el) els.add(el)
  }
  return els.size === 2 ? [...els] : null
}

/** Pontas de cada trio de elemento (as duas não-puras) — a corda que o
 *  Druida usa pra ir de uma ponta à outra do elemento. */
export function pontasDoElemento(roda: RodaDef, elemento: string): [string, string] | null {
  const trio = roda.ordem.filter((b) => roda.elemento[b] === elemento && !roda.puras.has(b))
  return trio.length === 2 ? [trio[0]!, trio[1]!] : null
}

