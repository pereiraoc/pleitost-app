// PREVIEW DE PAPÉIS por classe/subclasse no wizard (#461/#452 r4) — módulo PURO.
//
// Fontes de verdade:
//  - bloco ```class-roles``` no INÍCIO da nota de classe (parser existente
//    markdown/class-roles/parse.ts) — os TOTAIS de cada variante/build;
//  - elementos de regra `Somar Papel.<Id> <N>` — o que a CLASSE (base) e cada
//    OPÇÃO de subclasse ADICIONAM ("+★" das barras);
//  - `Alias Classe Compor` — como os builds nomeiam as variantes ("Estudos do
//    Vazio" compõe "Bruxo"), usado no HIGHLIGHT da possibilidade atual.
import { parseClassRolesSource, type Build } from '../../markdown/class-roles/parse'
import type { RoleName } from '../../markdown/class-roles/role-meta'

const FENCE_RE = /```class-roles\s*\n([\s\S]*?)```/

/** Builds do bloco class-roles do CORPO da nota (vazio se ausente/inválido). */
export function buildsDoCorpo(body: string): Build[] {
  const m = FENCE_RE.exec(body ?? '')
  if (!m) return []
  try {
    return parseClassRolesSource(m[1]!)
  } catch {
    return []
  }
}


const contem = (nome: string, texto: string) =>
  nome.toLowerCase().includes(texto.trim().toLowerCase())
const contemAlgum = (nome: string, textos: string[]) =>
  textos.some((t) => t.trim() && contem(nome, t))

/** NFD-strip local (espelho do strip de grupo/party.ts) pro match de slug. */
const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Slug ASCII do FM.Papel → RoleName acentuado (chaves do ROLE_META). */
const ROLE_POR_SLUG = new Map<string, RoleName>(
  (['Líder', 'Vanguarda', 'Abatedor', 'Controlador'] as RoleName[]).map((n) => [semAcento(n), n]),
)

/**
 * O que uma nota ADICIONA de papéis (#452 r4): parse dos elementos de regra
 * `Somar Papel.<Id> <N>` — a classe soma a base (Bardo: Lider 1) e cada opção
 * de subclasse soma o resto (Método Manipulador: Controlador 1). É o "+★" das
 * barras; os TOTAIS continuam sendo os builds do class-roles.
 */
export function somaPapeis(ruleElements: unknown): Partial<Record<RoleName, number>> {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out: Partial<Record<RoleName, number>> = {}
  for (const el of lista) {
    const texto = String(el)
    // Só o INCONDICIONAL: o Monge tem `Condicional Sintonia,[[X]] Somar
    // Papel.Y 1` por sintonia — somar tudo inflaria o "+" (a variante já
    // aparece nas possibilidades/highlight).
    if (/Condicional/i.test(texto)) continue
    const m = /Somar\s+Papel\.([A-Za-zÀ-ÿ]+)\s+(\d+)/i.exec(texto)
    if (!m) continue
    const role = ROLE_POR_SLUG.get(semAcento(m[1]!))
    if (role) out[role] = (out[role] ?? 0) + Number(m[2])
  }
  return out
}

/**
 * Somas CONDICIONAIS por sintonia (#452 r9): `Condicional Sintonia,[[X]] Somar
 * Papel.<Id> <N>` no doc da CLASSE — o que cada sintonia adiciona de papéis
 * pra esta classe (Monge/Animista). Chave = TARGET do wikilink da condição
 * ("Traço Elemental da Água"). Vazio pra classes sem condicionais (Mago).
 */
export function somaPapeisPorSintonia(
  ruleElements: unknown,
): Map<string, Partial<Record<RoleName, number>>> {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out = new Map<string, Partial<Record<RoleName, number>>>()
  for (const el of lista) {
    const m =
      /Condicional\s+Sintonia\s*,\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s+Somar\s+Papel\.([A-Za-zÀ-ÿ]+)\s+(\d+)/i.exec(
        String(el),
      )
    if (!m) continue
    const role = ROLE_POR_SLUG.get(semAcento(m[2]!))
    if (!role) continue
    const alvo = m[1]!.trim()
    const soma = out.get(alvo) ?? {}
    soma[role] = (soma[role] ?? 0) + Number(m[3])
    out.set(alvo, soma)
  }
  return out
}

/**
 * Índices dos builds compatíveis com o que JÁ está definido (#452 r4 —
 * highlight da possibilidade atual): cada grupo de textos (pick de uma escolha
 * com seus aliases, ou a sintonia curta) precisa casar no nome do build.
 * Grupos vazios são ignorados; sem grupo válido → [] (nada destacado).
 *
 * Report 2026-08-16 (Druida): escolha que NÃO aparece em NENHUM build (o
 * Círculo Druídico não muda papel — os builds são "Druida Guardião"/"Druida
 * Xamã") não pode zerar o highlight — grupo que não casa com build algum não
 * discrimina nada e é IGNORADO.
 */
export function indicesDoBuildAtual(builds: Build[], grupos: string[][]): number[] {
  const validos = grupos
    .filter((g) => g.some((t) => t.trim()))
    .filter((g) => builds.some(([nome]) => contemAlgum(nome, g)))
  if (!validos.length) return []
  const out: number[] = []
  builds.forEach(([nome], i) => {
    if (validos.every((g) => contemAlgum(nome, g))) out.push(i)
  })
  return out
}

/** Aliases de classe COMPOSTOS pelos elementos de regra de uma nota
 *  (`Alias Classe Compor N "X"`) — é assim que os builds do class-roles nomeiam
 *  as variantes (ex.: a opção "Estudos do Vazio" compõe "Bruxo"). */
export function aliasesDeCompose(ruleElements: unknown): string[] {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out: string[] = []
  for (const el of lista) {
    const m = /Alias\s+Classe\s+Compor\s+\d+\s+"([^"]+)"/i.exec(String(el))
    if (m) out.push(m[1]!)
  }
  return out
}




// ---------------------------------------------------------------------------
// FILTRO POR PAPEL (2026-09-23): "quais classes podem ter ao menos ★ deste
// papel, e com qual subclasse/sintonia". Os TOTAIS por combinação vêm das
// REGRAS — `Somar Papel` da classe + da opção de cada escolha de nível 1 +
// `Condicional Sintonia` da classe (Monge/Animista) — a mesma soma que o
// cartão PAPEL NO GRUPO faz sobre o FM derivado depois das escolhas reais.
// (O bloco class-roles segue sendo só a FAIXA de possibilidades exibida.)

type Soma = Partial<Record<RoleName, number>>

const WIKI_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
const alvosDe = (texto: string): string[] => {
  const out: string[] = []
  for (const m of texto.matchAll(WIKI_RE)) out.push(m[1]!.trim())
  return out
}

/** Alvos dos `Nivel 1 Complementar Habilidades.Lista [[X]]` de uma CLASSE —
 *  candidatos a escolha de subclasse (a nota-alvo diz se é, via Selecionar). */
export function complementaresNivel1(ruleElements: unknown): string[] {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out: string[] = []
  for (const el of lista) {
    const m = /^\s*Nivel\s+1\s+Complementar\s+Habilidades\.Lista\s+(\[\[[^\]]+\]\])\s*$/i.exec(String(el))
    if (m) out.push(...alvosDe(m[1]!))
  }
  return out
}

/** Opções de uma nota de ESCOLHA (`Complementar Habilidades.Lista Selecionar
 *  ([[A]], [[B]])`). Vazio = a nota não é escolha. */
export function opcoesSelecionar(ruleElements: unknown): string[] {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  for (const el of lista) {
    const texto = String(el)
    const i = texto.search(/Complementar\s+Habilidades\.Lista\s+Selecionar/i)
    if (i === -1) continue
    return alvosDe(texto.slice(i))
  }
  return []
}

export interface OpcaoPapel {
  alvo: string
  soma: Soma
}
export interface EscolhaPapel {
  /** Basename da nota de escolha (rótulo da seção — "Escola Arcana"). */
  parent: string
  opcoes: OpcaoPapel[]
}
export interface VariantePapel {
  picks: { parent: string; alvo: string }[]
  /** Target do Traço quando a classe varia por sintonia; null senão. */
  sintonia: string | null
  total: Soma
}

const somar = (a: Soma, b: Soma): Soma => {
  const out: Soma = { ...a }
  for (const [k, v] of Object.entries(b) as [RoleName, number][]) out[k] = (out[k] ?? 0) + v
  return out
}
const somaAlgum = (s: Soma) => Object.values(s).some((v) => (v ?? 0) > 0)

/** Todas as COMBINAÇÕES de papéis que uma classe pode ter: produto das
 *  escolhas que somam papel (escolha em que nenhuma opção soma — Círculo
 *  Druídico — não multiplica) × sintonias (só quando a classe tem
 *  condicionais de sintonia). */
export function variantesDePapel({
  somaClasse,
  somaSintonia,
  escolhas,
  sintonias,
}: {
  somaClasse: Soma
  somaSintonia: Map<string, Soma>
  escolhas: EscolhaPapel[]
  sintonias: string[]
}): VariantePapel[] {
  const relevantes = escolhas.filter((e) => e.opcoes.some((o) => somaAlgum(o.soma)))
  let combos: { picks: VariantePapel['picks']; total: Soma }[] = [{ picks: [], total: { ...somaClasse } }]
  for (const e of relevantes) {
    combos = combos.flatMap((c) =>
      e.opcoes.map((o) => ({
        picks: [...c.picks, { parent: e.parent, alvo: o.alvo }],
        total: somar(c.total, o.soma),
      })),
    )
  }
  if (somaSintonia.size === 0) return combos.map((c) => ({ ...c, sintonia: null }))
  return combos.flatMap((c) =>
    sintonias.map((s) => ({
      picks: c.picks,
      sintonia: s,
      total: somar(c.total, somaSintonia.get(s) ?? {}),
    })),
  )
}

export type ComboPapel = { picks: VariantePapel['picks']; sintonia: string | null }

export interface EntradaPapel {
  estrelas: number
  /** As COMBINAÇÕES (na ordem das variantes) que chegam a esta quantidade —
   *  o render as aninha por nível de escolha (Bardo: Inspirador → Luta
   *  Artística), nunca cruza opções de combinações diferentes. */
  combos: ComboPapel[]
}

/** Agrupa as variantes pela quantidade de estrelas do papel (≥ 1), maior
 *  primeiro — uma classe pode render várias entradas (Guerreiro ★★★ com
 *  Arcos/Bestas e ★ com o resto). */
export function entradasPorPapel(variantes: VariantePapel[], papel: RoleName): EntradaPapel[] {
  const porEstrelas = new Map<number, EntradaPapel>()
  for (const v of variantes) {
    const n = v.total[papel] ?? 0
    if (n < 1) continue
    let e = porEstrelas.get(n)
    if (!e) {
      e = { estrelas: n, combos: [] }
      porEstrelas.set(n, e)
    }
    e.combos.push({ picks: v.picks, sintonia: v.sintonia })
  }
  return [...porEstrelas.values()].sort((a, b) => b.estrelas - a.estrelas)
}

/** Escolhas em que NENHUMA opção soma papel (Círculo Druídico): ficam fora
 *  das combinações, mas seguem sendo escolhas da classe — o render lista
 *  todas as opções delas sob a classe. */
export function escolhasSemPapel(escolhas: EscolhaPapel[]): EscolhaPapel[] {
  return escolhas.filter((e) => !e.opcoes.some((o) => somaAlgum(o.soma)))
}

export interface NivelCombo {
  parent: string
  alvo: string
  /** Combinações que passam por esta opção neste nível. */
  filhos: ComboPapel[]
}

/** As opções distintas do nível `depth` das combinações (ordem de
 *  aparição), cada uma com as combinações que continuam por ela. */
export function niveisDeCombo(combos: ComboPapel[], depth: number): NivelCombo[] {
  const out: NivelCombo[] = []
  const idx = new Map<string, number>()
  for (const c of combos) {
    const p = c.picks[depth]
    if (!p) continue
    let i = idx.get(p.alvo)
    if (i === undefined) {
      i = out.length
      idx.set(p.alvo, i)
      out.push({ parent: p.parent, alvo: p.alvo, filhos: [] })
    }
    out[i]!.filhos.push(c)
  }
  return out
}

/** Sintonias (targets) das combinações que TERMINAM neste nível. */
export function sintoniasDoNivel(combos: ComboPapel[], depth: number): string[] {
  const out: string[] = []
  for (const c of combos) {
    if (c.picks.length !== depth || !c.sintonia) continue
    if (!out.includes(c.sintonia)) out.push(c.sintonia)
  }
  return out
}
