// Modelo mínimo pra avaliação de regras no app — ESPELHO do subset do
// InternalSheetModel que o rule-applier do plugin lê (lookups de scope/
// condition/inferência de pick). Construído do FM SALVO (extraído + overlay),
// espelhando o frontmatter-extractor do plugin (src/extract/
// frontmatter-extractor.ts) campo a campo — só os campos que a avaliação usa.
import { slugify } from '../components/ficha/registry'
import { parseItemAlias, str, num, fmPath } from '../components/ficha/hero-model'
import { resolveFamilyFromFrontmatter, type SheetFamily } from '../data/familia'

export type AtributoId = 'FOR' | 'AGI' | 'INT' | 'PRE'
/** Ordem canônica dos atributos — espelho de ATRIBUTOS (plugin types/model.ts). */
export const ATRIBUTOS: readonly AtributoId[] = ['FOR', 'AGI', 'INT', 'PRE']

/** Perícias canônicas — espelho de PERICIAS (plugin types/model.ts:32-46). */
export const PERICIAS: readonly string[] = [
  'Atletismo',
  'Acrobacia',
  'Furtividade',
  'Ladinagem',
  'Arcana',
  'Sociedades',
  'Guerra',
  'Medicina',
  'Sobrevivencia',
  'Anima',
  'Diplomacia',
  'Enganacao',
  'Intimidacao',
]

/** Espelho de Increment (plugin frontmatter-helpers.ts:parseIncrementos). */
export interface Increment {
  rank: 'A' | 'E' | 'M'
  field?: string
  source: string
}

/** Espelho de FontedLink (plugin frontmatter-helpers.ts:parseFontedLinkList). */
export interface FontedLink {
  link: string
  source: string
}

export interface ProfState {
  nome: string
  proficiencia: 'N' | 'A' | 'E' | 'M'
  bonusEspecial: number
  complemento?: string
  incrementos: Increment[]
}

export interface RulesModel {
  meta: {
    /** Família da ficha (subcategoria do FM) — o extract usa pra sincronizar
     *  o nível do CA com o tutor (plugin extract/sync-ca-tutor-nivel.ts). */
    familia: SheetFamily
    nivel: number
    tier: number | null
    classe: string | null
    sintonia: string | null
    raca: string | null
    tutor: string | null
    tamanho: string | null
    modificador: string | null
    subclasses: string[]
    passado: string | null
    /** Derivados dos incrementos source="Passado" — espelho do
     *  frontmatter-extractor.ts:261-278. */
    passadoPericia: string | null
    passadoOficio: string | null
    passadoOficioTexto: string | null
  }
  atributos: Record<AtributoId, number>
  atributoPrincipal: AtributoId | null
  /** Chave = slug canônico (PERICIAS) — espelho de model.pericias. */
  pericias: Record<string, ProfState>
  oficios: ProfState[]
  defesasResistencias: ProfState[]
  sentidos: ProfState[]
  habilidades: { lista: FontedLink[]; especiais: string[] }
  tecnicas: { lista: FontedLink[] }
  acoes: FontedLink[]
  magias: {
    listas: { aprendidas: FontedLink[]; naoAprendidas: FontedLink[]; tesouros: FontedLink[] }
    secundaria: { listas: { aprendidas: FontedLink[]; naoAprendidas: FontedLink[] } }
  }
  periciasEspecMaestria: string[]
  inventario: {
    armadura: {
      nome: string | null
      propriedade: string | null
      categoria: string | null
      proficiencias: { Sem: 'N' | 'P'; Leve: 'N' | 'P'; Pesada: 'N' | 'P' }
    }
    escudo: { nome: string | null; propriedade: string | null; categoria: string | null; proficiencia: 'N' | 'P' }
    armas: { lista: Array<{ nome: string; propriedade: string | null; categoria: string | null }> }
    tesouros: Array<{ nome: string; tier: 'A' | 'E' | 'M' | null }>
    consumiveis: string[]
  }
}

/** Espelho de PERICIA_NAME_MAP do plugin: Nome do FM (display, com acento)
 *  → slug canônico. slugify NFD cobre todos os casos do vault. */
function periciaId(nomeFm: string): string | null {
  const slug = slugify(nomeFm)
  return PERICIAS.includes(slug) ? slug : null
}

function prof(v: unknown): 'N' | 'A' | 'E' | 'M' {
  const s = str(v).trim().toUpperCase()
  return s === 'A' || s === 'E' || s === 'M' ? s : 'N'
}

function profBin(v: unknown): 'N' | 'P' {
  return str(v).trim().toUpperCase() === 'P' ? 'P' : 'N'
}

/** Espelho de parseIncrementos (plugin frontmatter-helpers.ts:282-304):
 *  chave A/E/M = rank-based; qualquer outra = field-based (rank placeholder A). */
export function parseIncrementos(v: unknown): Increment[] {
  if (!Array.isArray(v)) return []
  const out: Increment[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    for (const [key, source] of Object.entries(item as Record<string, unknown>)) {
      const src = str(source) || 'Regra'
      if (key === 'A' || key === 'E' || key === 'M') out.push({ rank: key, source: src })
      else out.push({ rank: 'A', field: key, source: src })
    }
  }
  return out
}

/** Espelho de parseFontedLinkList (plugin frontmatter-helpers.ts:172-186). */
export function parseFontedLinkList(v: unknown): FontedLink[] {
  if (!Array.isArray(v)) return []
  const out: FontedLink[] = []
  for (const item of v) {
    if (typeof item === 'string') out.push({ link: item, source: '' })
    else if (item && typeof item === 'object') {
      const entries = Object.entries(item as Record<string, unknown>)
      if (entries.length === 1) out.push({ link: entries[0][0], source: str(entries[0][1]) })
    }
  }
  return out
}

function profRow(raw: Record<string, unknown>): ProfState {
  return {
    nome: str(raw['Nome']),
    proficiencia: prof(raw['Proficiencia']),
    bonusEspecial: num(raw['Bonus_Especial']),
    complemento: str(raw['Complemento']),
    incrementos: parseIncrementos(raw['Incrementos']),
  }
}

function arrObj(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []
}

/** FM salvo → RulesModel. Espelho seletivo de extractFrontmatter (plugin
 *  frontmatter-extractor.ts) — cada bloco cita a seção espelhada. */
export function rulesModelFromFm(fm: Record<string, unknown>): RulesModel {
  const at = (fm['Atributos'] ?? {}) as Record<string, unknown>
  const principalRaw = str(at['Principal']).toUpperCase()
  const principal = (ATRIBUTOS as string[]).includes(principalRaw) ? (principalRaw as AtributoId) : null

  // --- Perícias (frontmatter-extractor.ts:228-244: chave = slug canônico) ---
  const pericias: Record<string, ProfState> = {}
  for (const raw of arrObj(fmPath(fm, 'Pericias', 'Lista'))) {
    const id = periciaId(str(raw['Nome']))
    if (!id) continue
    pericias[id] = { ...profRow(raw), nome: id }
  }

  // --- Ofícios (frontmatter-extractor.ts:247-259) ---
  const oficios = arrObj(fmPath(fm, 'Oficios', 'Lista')).map(profRow)

  // --- Derivar passadoPericia/passadoOficio dos incrementos "Passado"
  //     (frontmatter-extractor.ts:261-278) ---
  let passadoPericia: string | null = null
  for (const pid of PERICIAS) {
    if (pericias[pid]?.incrementos.some((inc) => inc.source === 'Passado')) {
      passadoPericia = pid
      break
    }
  }
  let passadoOficio: string | null = null
  let passadoOficioTexto: string | null = null
  for (const o of oficios) {
    if (o.incrementos.some((inc) => inc.source === 'Passado')) {
      passadoOficio = o.nome
      passadoOficioTexto = o.complemento ?? null
      break
    }
  }

  // --- Magias: escolas com Lista (frontmatter-extractor.ts:341+) ---
  const aprendidas: FontedLink[] = []
  for (const escola of arrObj(fmPath(fm, 'Magias', 'Lista'))) {
    aprendidas.push(...parseFontedLinkList(escola['Lista']))
  }
  const secundariaAprendidas: FontedLink[] = []
  for (const escola of arrObj(fmPath(fm, 'Magias', 'Secundaria', 'Lista'))) {
    secundariaAprendidas.push(...parseFontedLinkList(escola['Lista']))
  }

  // --- Especialização/Maestria de perícia são fontes de regra
  //     (rule-elements-extractor.ts:172-180, issue #213 do plugin) ---
  const especMaestria: string[] = []
  for (const raw of arrObj(fmPath(fm, 'Pericias', 'Lista'))) {
    for (const key of ['Especializacao', 'Maestria']) {
      const v = str(raw[key])
      if (v) especMaestria.push(v)
    }
  }

  const armaduraFm = (fmPath(fm, 'Inventario', 'Armadura') ?? {}) as Record<string, unknown>
  const escudoFm = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>
  const armaduraProfFm = (armaduraFm['Proficiencia'] ?? {}) as Record<string, unknown>

  const bio = (fm['Biografia'] ?? {}) as Record<string, unknown>

  return {
    meta: {
      // FM-first como o resolveFamily do plugin; sem path aqui (o FM do
      // vault-data/entidades locais sempre traz subcategoria) → default Heroi.
      familia: resolveFamilyFromFrontmatter(fm) ?? 'Heroi',
      nivel: num(fm['Nível']) || 1,
      tier: fm['Tier'] !== undefined ? num(fm['Tier']) : null,
      classe: str(fm['Classe']) || null,
      sintonia: str(fm['Sintonia']) || null,
      raca: str(fm['Raça']) || null,
      tutor: str(fm['Tutor']) || null,
      tamanho: str(fm['Tamanho']) || null,
      modificador: str(fm['Modificador']) || null,
      subclasses: Array.isArray(fm['Subclasses']) ? (fm['Subclasses'] as unknown[]).map((s) => str(s)) : [],
      passado: str(bio['Passado']) || null,
      passadoPericia,
      passadoOficio,
      passadoOficioTexto,
    },
    atributos: {
      FOR: num(at['FOR']),
      AGI: num(at['AGI']),
      INT: num(at['INT']),
      PRE: num(at['PRE']),
    },
    atributoPrincipal: principal,
    pericias,
    oficios,
    defesasResistencias: arrObj(fmPath(fm, 'Defesas_Resistencias', 'Lista')).map(profRow),
    sentidos: arrObj(fmPath(fm, 'Sentidos', 'Lista')).map(profRow),
    habilidades: {
      lista: parseFontedLinkList(fmPath(fm, 'Habilidades', 'Lista')),
      especiais: arrObj(fmPath(fm, 'Habilidades', 'Especiais')).map((e) => str(e['nome']) || str(e['Nome'])),
    },
    tecnicas: { lista: parseFontedLinkList(fmPath(fm, 'Tecnicas', 'Lista')) },
    acoes: parseFontedLinkList(fmPath(fm, 'Acoes', 'Lista')),
    magias: {
      listas: { aprendidas, naoAprendidas: [], tesouros: [] },
      secundaria: { listas: { aprendidas: secundariaAprendidas, naoAprendidas: [] } },
    },
    periciasEspecMaestria: especMaestria,
    inventario: {
      armadura: {
        nome: str(armaduraFm['Nome']) || null,
        propriedade: str(armaduraFm['Propriedade']) || null,
        categoria: str(armaduraFm['Categoria']) || null,
        proficiencias: {
          Sem: profBin(armaduraProfFm['Sem']),
          Leve: profBin(armaduraProfFm['Leve']),
          Pesada: profBin(armaduraProfFm['Pesada']),
        },
      },
      escudo: {
        nome: str(escudoFm['Nome']) || null,
        propriedade: str(escudoFm['Propriedade']) || null,
        categoria: str(escudoFm['Categoria']) || null,
        proficiencia: profBin(escudoFm['Proficiencia']),
      },
      armas: {
        lista: arrObj(fmPath(fm, 'Inventario', 'Armas', 'Lista')).map((a) => ({
          nome: str(a['Nome']),
          propriedade: str(a['Propriedade']) || null,
          categoria: str(a['Categoria']) || null,
        })),
      },
      // Tier do tesouro vem do alias "(Adepto)" — espelho de
      // parseTierFromAlias (plugin frontmatter-helpers.ts) via parseItemAlias.
      tesouros: ((fmPath(fm, 'Inventario', 'Tesouros') as unknown[]) ?? []).map((t) => ({
        nome: str(t),
        tier: parseItemAlias(t).tier,
      })),
      consumiveis: ((fmPath(fm, 'Inventario', 'Consumiveis') as unknown[]) ?? []).map((c) => str(c)),
    },
  }
}
