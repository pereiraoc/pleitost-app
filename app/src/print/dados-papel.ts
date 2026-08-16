// DADOS DA FICHA DE PAPEL (export #452) — módulo PURO que projeta o FM
// DERIVADO do herói nas seções do A4 paisagem aprovado pelo usuário (v11 do
// mock, 2026-08-16). O layout/agrupamento é decisão validada visualmente:
//  - pág. 1: vida (Moral em cima) · defesas · perícias (+especialidades) ·
//    ataques → ações de habilidade → magias (por rank) · condições · efeitos;
//  - pág. 2: atributos (3·2·1·0) · identidade tabelada · ofícios · técnicas ·
//    inventário (ouro → consumíveis vazios → armadura → armas → tesouros c/
//    usos) · habilidades · marcas · reconhecimentos · anotações.
// Cálculos espelham o app: PROF_BONUS/RESISTENCIA_BASE/MOVIMENTO_BASE, dano
// multiplicado pelo tier da categoria (1×/2×/3×), mod = atributo + prof +
// item + especial.
import { PROF_BONUS, type RankLetter } from '../components/ficha/registry'
import { shortSintonia, str, wikiTarget } from '../components/ficha/hero-model'
import { MOVIMENTO_BASE, RESISTENCIA_BASE } from '../grupo/stats'
import type { VaultDoc } from '../data/types'
import { resumoDoDoc } from './resumo-doc'

type Fm = Record<string, unknown>
type Row = Record<string, unknown>

export const PROF_NOME: Record<RankLetter, string> = {
  N: 'Novato',
  A: 'Adepto',
  E: 'Experiente',
  M: 'Mestre',
}
const RANK_ORDEM = ['Básica', 'Adepta', 'Experiente', 'Mestre'] as const
export const RANK_PLURAL: Record<string, string> = {
  'Básica': 'BÁSICAS',
  'Adepta': 'ADEPTAS',
  'Experiente': 'EXPERIENTES',
  'Mestre': 'MESTRES',
}
const TIER_N: Record<string, number> = { Adepto: 1, Experiente: 2, Mestre: 3 }
const OFICIO_LABEL: Record<string, string> = {
  Oficio: 'OFÍCIO',
  Atuacao: 'ATUAÇÃO',
  Conhecimento: 'CONHECIMENTO',
}
const CAT_RX = /\s*\((Adepto|Experiente|Mestre)\)\s*/
const SUFIXO_RX = /\s*\((Adepto|Experiente|Mestre|x\d+)\)\s*/g

/** Label visível de um wikilink ("[[A|B]]" → "B"; texto plano passa reto). */
function linkLabel(s: string): string {
  const m = /\[\[([^\]|]+)\|?([^\]]*)\]\]/.exec(s)
  return m ? (m[2] || m[1]!).trim() : s
}

/** Docs por basename (resumos/dano/rank/usos) — o caller monta do useDocs. */
export type DocPorNome = (nomeOuWikilink: string) => VaultDoc | undefined

/** Basename "limpo" pra resolver o doc de um item com sufixo de categoria. */
export function baseDoItem(nomeOuWikilink: string): string {
  return wikiTarget(str(nomeOuWikilink)).replace(SUFIXO_RX, '').trim()
}

export interface StatBox {
  nome: string
  valor: string
  legenda: string
}
export interface AtaqueLinha {
  nome: string
  mod: string
  dano: string
  categoria: string
  propriedades: string
}
export interface ItemResumo {
  nome: string
  resumo: string
  tag?: string
  usos?: number
}
export interface PericiaLinha {
  nome: string
  atributo: string
  mod: number
  prof: RankLetter
  item: number
  especial: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const rank = (v: unknown): RankLetter =>
  v === 'A' || v === 'E' || v === 'M' ? (v as RankLetter) : 'N'

function rows(fm: Fm, ...path: string[]): Row[] {
  let cur: unknown = fm
  for (const p of path) cur = (cur as Fm | undefined)?.[p]
  return Array.isArray(cur) ? (cur as Row[]) : []
}
function entradas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const out: string[] = []
  for (const item of lista) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object') out.push(...Object.keys(item as Row))
  }
  return out
}

export function montarDadosPapel(
  d: Fm,
  docDe: DocPorNome,
  condicoes: string[],
  consumiveisCatalogo: string[],
) {
  const attr = (d['Atributos'] ?? {}) as Record<string, unknown>
  const A = (sigla: unknown): number => num(attr[str(sigla)])
  const vida = (d['Vida'] ?? {}) as Record<string, unknown>

  const item = (nomeRaw: string, tag?: string): ItemResumo => ({
    nome: linkLabel(str(nomeRaw)) || str(nomeRaw),
    resumo: resumoDoDoc(docDe(nomeRaw)),
    tag,
  })

  // — defesas/sentidos/movimento —
  const defesas: StatBox[] = rows(d, 'Defesas_Resistencias', 'Lista').map((r) => ({
    nome: str(r['Nome']).toUpperCase(),
    valor: String(
      RESISTENCIA_BASE + A(r['Atributo']) + PROF_BONUS[rank(r['Proficiencia'])] + num(r['Bonus_Item']) + num(r['Bonus_Especial']),
    ),
    legenda: `${str(r['Atributo'])}·${str(r['Proficiencia'])}`,
  }))
  const sentidos: StatBox[] = rows(d, 'Sentidos', 'Lista').map((r) => ({
    nome: str(r['Nome']).toUpperCase(),
    valor: `+${A(r['Atributo']) + PROF_BONUS[rank(r['Proficiencia'])] + num(r['Bonus_Item']) + num(r['Bonus_Especial'])}`,
    legenda: `${str(r['Atributo'])}·${str(r['Proficiencia'])}`,
  }))

  // — ataques (equipadas + naturais + desarmado; dano do doc × tier) —
  const atkProf = rank((d['Ataques'] as Fm | undefined)?.['Proficiencia'])
  const atkBonus = PROF_BONUS[atkProf]
  const armaLinha = (r: Row): AtaqueLinha => {
    const doc = docDe(str(r['Nome']))
    const fmw = (doc?.frontmatter ?? {}) as Fm
    const catl = linkLabel(str(r['Categoria']))
    const danoBase = str(fmw['dano'])
    const dano = danoBase.startsWith('d') ? `${TIER_N[catl] ?? 1}${danoBase}` : danoBase
    const extra = linkLabel(str(r['Propriedade']))
    return {
      nome: linkLabel(str(r['Nome'])),
      mod: `+${atkBonus + A(r['Atributo']) + num(r['Bonus_Item']) + num(r['Bonus_Especial'])}`,
      dano: `${dano} ${str(fmw['tipo'])}`.trim(),
      categoria: [catl, extra].filter(Boolean).join(' · '),
      propriedades: (Array.isArray(fmw['propriedades']) ? (fmw['propriedades'] as unknown[]) : [])
        .map((p) => linkLabel(str(p)))
        .join(', '),
    }
  }
  const ataques: AtaqueLinha[] = [
    ...rows(d, 'Inventario', 'Armas', 'Lista').map(armaLinha),
    ...rows(d, 'Ataques', 'Lista')
      .filter((r) => str(r['Nome']) && str(r['Nome']) !== 'Manobras')
      .map(armaLinha),
  ]
  const desarmadoDoc = docDe('Ataque Desarmado')
  if (desarmadoDoc) {
    const fmw = desarmadoDoc.frontmatter as Fm
    ataques.push({
      nome: 'Ataque Desarmado',
      mod: `+${atkBonus + A('FOR')}`,
      dano: `1${str(fmw['dano'])} ${str(fmw['tipo'])}`,
      categoria: '',
      propriedades: 'uma mão livre',
    })
  }
  const manobrasMod = atkBonus + A('FOR')

  // — habilidades (pai da escolha some quando o pick "Pai (X)" existe) —
  const habsRaw = entradas(rows(d, 'Habilidades', 'Lista').length ? (d['Habilidades'] as Fm)['Lista'] : []).map(
    (k) => linkLabel(k),
  )
  const paisComPick = new Set(
    habsRaw.map((h) => /^(.+?)\s*\(/.exec(h)?.[1]).filter((x): x is string => !!x),
  )
  const habilidades: ItemResumo[] = habsRaw.filter((h) => !paisComPick.has(h)).map((h) => item(h))

  const tecnicas: ItemResumo[] = (Array.isArray((d['Tecnicas'] as Fm | undefined)?.['Lista'])
    ? ((d['Tecnicas'] as Fm)['Lista'] as Row[])
    : []
  ).flatMap((t) =>
    Object.entries(t).map(([k, v]) => item(k, str(v).split('.').pop() ?? '')),
  )
  const acoes: ItemResumo[] = entradas((d['Acoes'] as Fm | undefined)?.['Lista']).map((a) =>
    item(a, 'AÇÃO'),
  )

  // — magias por escola, agrupadas por RANK (Básicas → Mestres) —
  const magias = (d['Magias'] ?? {}) as Fm
  const escolas = rows(d, 'Magias', 'Lista')
    .filter((e) => entradas(e['Lista']).length)
    .map((e) => {
      const porRank = new Map<string, ItemResumo[]>()
      for (const m of entradas(e['Lista'])) {
        const rk = str(docDe(m)?.frontmatter?.['rank']) || 'Básica'
        if (!porRank.has(rk)) porRank.set(rk, [])
        porRank.get(rk)!.push(item(m))
      }
      const grupos = RANK_ORDEM.filter((rk) => porRank.has(rk)).map((rk) => ({
        rank: RANK_PLURAL[rk]!,
        magias: porRank.get(rk)!.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
      }))
      return { nome: str(e['Nome']), prof: rank(e['Proficiencia']), grupos }
    })

  // — perícias + especialidades/maestrias —
  const pericias: PericiaLinha[] = rows(d, 'Pericias', 'Lista').map((r) => {
    const it = num(r['Bonus_Item'])
    const esp = num(r['Bonus_Especial'])
    const pf = rank(r['Proficiencia'])
    return {
      nome: str(r['Nome']),
      atributo: str(r['Atributo']),
      mod: A(r['Atributo']) + PROF_BONUS[pf] + it + esp,
      prof: pf,
      item: it,
      especial: esp,
    }
  })
  const especialidades: (ItemResumo & { pericia: string })[] = []
  for (const r of rows(d, 'Pericias', 'Lista')) {
    for (const [campo, tag] of [
      ['Especializacao', 'ESPECIALIDADE'],
      ['Maestria', 'MAESTRIA'],
    ] as const) {
      const v = str(r[campo]).trim()
      if (v) especialidades.push({ ...item(v, tag), pericia: str(r['Nome']) })
    }
  }

  // — inventário (ordem aprovada: ouro → consumíveis vazios → armadura →
  //   armas → tesouros mais caros primeiro, usos = bolinhas) —
  const inv = (d['Inventario'] ?? {}) as Fm
  const arm = (inv['Armadura'] ?? {}) as Fm
  const esc = (inv['Escudo'] ?? {}) as Fm
  const profArmadura = (arm['Proficiencia'] ?? {}) as Record<string, unknown>
  const pesoTesouro = (t: string): number => {
    const cat = CAT_RX.exec(linkLabel(str(t)))?.[1]
    return cat === 'Mestre' ? 0 : cat === 'Experiente' ? 1 : cat === 'Adepto' ? 2 : 3
  }
  const usosDoTesouro = (t: string): number => {
    const doc = docDe(t)
    const cat = (CAT_RX.exec(linkLabel(str(t)))?.[1] ?? 'Adepto').toLowerCase()
    const usos = (doc?.frontmatter?.['usos'] ?? {}) as Record<string, unknown>
    const m = /^(\d+)/.exec(str(usos[cat]))
    return m ? Number(m[1]) : 0
  }
  const tesouros: ItemResumo[] = [
    ...(Array.isArray(inv['Tesouros']) ? (inv['Tesouros'] as unknown[]).map(str) : []),
    ...(typeof inv['Tesouros_Especiais'] === 'string' && str(inv['Tesouros_Especiais']).trim()
      ? [str(inv['Tesouros_Especiais'])]
      : Array.isArray(inv['Tesouros_Especiais'])
        ? (inv['Tesouros_Especiais'] as unknown[]).map(str)
        : []),
  ]
    .sort((a, b) => pesoTesouro(a) - pesoTesouro(b))
    .map((t) => ({ nome: linkLabel(str(t)), resumo: '', usos: usosDoTesouro(t) }))

  const marcas = rows(d, 'Experiencia', 'Marcas').map((m) => ({
    qtd: num(m['qtd']),
    texto: str(m['texto']),
  }))
  const reconhecimentos = rows(d, 'Experiencia', 'Reconhecimentos').map((r) => ({
    entidade: str(r['entidade']),
    texto: str(r['texto']),
  }))

  const bio = (d['Biografia'] ?? {}) as Fm
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).map((x) => str(x).trim()).filter(Boolean) : []

  const oficios = rows(d, 'Oficios', 'Lista').map((r) => ({
    rotulo: OFICIO_LABEL[str(r['Nome'])] ?? str(r['Nome']).toUpperCase(),
    complemento: str(r['Complemento']),
    prof: rank(r['Proficiencia']),
    mod: A(r['Atributo']) + PROF_BONUS[rank(r['Proficiencia'])],
  }))

  return {
    nome: str(d['nome']) || linkLabel(str(d['aliases'])) || '',
    classe: linkLabel(str(d['Classe'])),
    nivel: num(d['Nível']),
    sintonia: shortSintonia(d['Sintonia']),
    tamanho: str(d['Tamanho']),
    moral: num(vida['Moral']),
    vitalidade: num(vida['Vitalidade']),
    escudo: str(esc['Nome']).trim()
      ? {
          nome: linkLabel(str(esc['Nome'])),
          categoria: linkLabel(str(esc['Categoria'])),
          dureza: num(esc['Dureza']),
          dano: num(esc['Dano']),
        }
      : null,
    defesas,
    sentidos,
    movimento: MOVIMENTO_BASE + A('AGI'),
    atkProf,
    ataques,
    manobrasMod,
    condicoes,
    pericias,
    especialidades,
    energiaMagica: num(magias['EM']),
    potencia: num(magias['Potencia']),
    escolas,
    acoes,
    tecnicas,
    habilidades,
    atributos: (['FOR', 'AGI', 'INT', 'PRE'] as const)
      .map((a) => ({ sigla: a, valor: A(a) }))
      .sort((x, y) => y.valor - x.valor),
    identidade: {
      passado: str(bio['Passado']),
      motivacao: str(bio['Motivacao']),
      naturalidade: linkLabel(str(bio['Naturalidade'])),
      genero: str(bio['Genero']),
      idade: str(bio['Idade']),
      altura: str(bio['Altura']),
      peso: str(bio['Peso']),
      ideais: lista(bio['Ideais']),
      desprezos: lista(bio['Desprezos']),
      qualidades: lista(bio['Qualidades']),
      defeitos: lista(bio['Defeitos']),
    },
    oficios,
    inventario: {
      consumiveisCatalogo,
      armadura: {
        nome: linkLabel(str(arm['Nome'])),
        categoria: linkLabel(str(arm['Categoria'])),
        propriedade: linkLabel(str(arm['Propriedade'])),
        prof: {
          sem: str(profArmadura['Sem']) === 'P',
          leve: str(profArmadura['Leve']) === 'P',
          pesada: str(profArmadura['Pesada']) === 'P',
        },
      },
      armas: rows(d, 'Inventario', 'Armas', 'Lista').map((r) => ({
        nome: linkLabel(str(r['Nome'])),
        categoria: [linkLabel(str(r['Categoria'])), linkLabel(str(r['Propriedade']))]
          .filter(Boolean)
          .join(' · '),
      })),
      tesouros,
    },
    marcas,
    reconhecimentos,
  }
}

export type DadosPapel = ReturnType<typeof montarDadosPapel>

/** Todos os NOMES cujos docs a página precisa carregar (resumos/dano/rank/
 *  usos) — resolvidos pelo caller via catálogo → useDocs. */
export function nomesReferenciados(d: Fm): string[] {
  const out = new Set<string>(['Ataque Desarmado'])
  const add = (v: unknown) => {
    const t = baseDoItem(str(v))
    if (t) out.add(t)
  }
  for (const r of rows(d, 'Inventario', 'Armas', 'Lista')) add(r['Nome'])
  for (const r of rows(d, 'Ataques', 'Lista')) if (str(r['Nome']) !== 'Manobras') add(r['Nome'])
  for (const k of entradas((d['Habilidades'] as Fm | undefined)?.['Lista'])) add(k)
  for (const t of Array.isArray((d['Tecnicas'] as Fm | undefined)?.['Lista'])
    ? (((d['Tecnicas'] as Fm)['Lista'] as Row[]).flatMap((t) => Object.keys(t)) as string[])
    : [])
    add(t)
  for (const k of entradas((d['Acoes'] as Fm | undefined)?.['Lista'])) add(k)
  for (const e of rows(d, 'Magias', 'Lista')) for (const m of entradas(e['Lista'])) add(m)
  for (const r of rows(d, 'Pericias', 'Lista')) {
    add(r['Especializacao'])
    add(r['Maestria'])
  }
  const inv = (d['Inventario'] ?? {}) as Fm
  for (const t of Array.isArray(inv['Tesouros']) ? (inv['Tesouros'] as unknown[]) : []) add(t)
  return [...out].filter(Boolean)
}
