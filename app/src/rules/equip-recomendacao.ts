// RECOMENDAÇÃO DE EQUIPAMENTO INICIAL do wizard (#452 §6.1.1–6.1.4 e §6.2,
// issue #457) — módulo PURO (sem React/stores) e unit-testado.
//
// Regras do spec (verbatim da issue #452):
//  6.1.1 FOR do herói = X → armas com propriedade "Força X" são MUITO recomendadas.
//  6.1.2 Armas com "Força X-1" são recomendadas.
//  6.1.3 AGI 2 ou 3 → armas PRECISAS ou A DISTÂNCIA são muito recomendadas; entre
//        elas, as com "Força X" (o FOR do herói) são as mais recomendadas de todas.
//  6.1.4 A recomendação prioriza SEMPRE as armas com proficiência específica ou
//        marcial; sem nenhuma dessas, as SIMPLES é que recebem as recomendações.
//  6.2   Armadura: Pesada se proficiente e FOR > AGI; senão Leve se proficiente
//        e AGI > FOR; senão Sem Armadura.
//
// Nota de leitura: a propriedade "Força N" é o requisito de força da arma; arma
// SEM a propriedade conta como Força 0 (uma arma leve casa com herói FOR 0).
import { fmPath, num, str } from '../components/ficha/hero-model'

export type GrupoArma = 'cac-simples' | 'd-simples' | 'cac-marcial' | 'd-marcial'

/** Grupos de arma que o wizard APRESENTA (spec: nada de especiais/naturais). */
export const GRUPOS_WIZARD: readonly GrupoArma[] = [
  'cac-simples',
  'd-simples',
  'cac-marcial',
  'd-marcial',
]

export interface ArmaInfo {
  /** Basename da nota da arma (o FM equipa `[[<basename>]]`). */
  basename: string
  grupo: GrupoArma
  /** FM `mãos` (1|2). */
  maos: number
  /** Requisito "Força N" das propriedades (0 = sem a propriedade). */
  forca: number
  precisa: boolean
}

export interface ProficienciasArmas {
  simples: boolean
  marciais: boolean
  /** Basenames com proficiência ESPECÍFICA (Inventario.Armas.Proficiencia.Especificas). */
  especificas: string[]
}

/** Reduz um wikilink ao texto visível ("[[Força X|Força 2]]" → "Força 2"). */
function textoDe(prop: unknown): string {
  const s = str(prop)
  const m = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(s)
  return (m ? (m[2] ?? m[1]!) : s).trim()
}

/** Extrai as infos de recomendação do FM de um doc de arma. */
export function armaInfoDoFm(basename: string, fm: Record<string, unknown>): ArmaInfo | null {
  const grupo = str(fm['grupo']) as GrupoArma
  if (!GRUPOS_WIZARD.includes(grupo)) return null
  const props = Array.isArray(fm['propriedades']) ? (fm['propriedades'] as unknown[]) : []
  let forca = 0
  let precisa = false
  for (const p of props) {
    const texto = textoDe(p)
    const mForca = /for[çc]a\s*(\d+)/i.exec(texto)
    if (mForca) forca = num(mForca[1])
    if (/^precisa$/i.test(texto)) precisa = true
  }
  return { basename, grupo, maos: Math.max(1, num(fm['mãos']) || 1), forca, precisa }
}

/** Proficiências de arma do FM (derivado) do herói. */
export function proficienciasDoFm(fm: Record<string, unknown>): ProficienciasArmas {
  const prof = (fmPath(fm, 'Inventario', 'Armas', 'Proficiencia') ?? {}) as Record<string, unknown>
  const especificas = Array.isArray(prof['Especificas'])
    ? (prof['Especificas'] as unknown[]).map((x) => textoDe(x)).filter(Boolean)
    : []
  return {
    simples: str(prof['Simples']) === 'P',
    marciais: str(prof['Marciais']) === 'P',
    especificas,
  }
}

export type NivelRecomendacao = 'muito' | 'recomendada' | 'pouco' | null

/** O herói é proficiente NESTA arma? (específica > grupo). */
export function proficienteNaArma(arma: ArmaInfo, prof: ProficienciasArmas): boolean {
  if (prof.especificas.some((e) => e.toLowerCase() === arma.basename.toLowerCase())) return true
  if (arma.grupo === 'cac-marcial' || arma.grupo === 'd-marcial') return prof.marciais
  return prof.simples
}

/**
 * Nível de recomendação de UMA arma pro herói (spec 6.1.1–6.1.4 + #464 item 14).
 * `score` ordena dentro do mesmo nível (6.1.3: precisa/distância com Força==FOR
 * são "as mais recomendadas" — recebem o maior score).
 *
 * STEP-DOWN das simples (#464 item 14): arma que NÃO é marcial cai um degrau —
 * muito→recomendada, recomendada→pouco — EXCETO quando o herói tem BÔNUS DE
 * ESPECIALIZAÇÃO cobrindo a arma (`armasEspecializadas`: basenames vindos das
 * habilidades tipo "Especialização em Arma (X)", grupoArma.armas dos
 * Efeitos_Interativos — caso do Guerreiro com simples especializadas).
 */
export function recomendacaoArma(
  arma: ArmaInfo,
  hero: { FOR: number; AGI: number },
  prof: ProficienciasArmas,
  armasEspecializadas: ReadonlySet<string> = new Set(),
): { nivel: NivelRecomendacao; score: number } {
  // 6.1.4 — proficiência manda: sem proficiência NA arma, nada de recomendação.
  if (!proficienteNaArma(arma, prof)) return { nivel: null, score: 0 }

  const aDistancia = arma.grupo === 'd-simples' || arma.grupo === 'd-marcial'
  const agil = hero.AGI >= 2 && (arma.precisa || aDistancia)
  let nivel: NivelRecomendacao = null
  let score = 0
  if (arma.forca === hero.FOR) {
    nivel = 'muito' // 6.1.1
    score = 3
  } else if (arma.forca === hero.FOR - 1) {
    nivel = 'recomendada' // 6.1.2
    score = 2
  }
  if (agil) {
    // 6.1.3: precisa/a distância viram MUITO recomendadas; com Força==FOR são
    // as mais recomendadas de todas.
    nivel = 'muito'
    score = arma.forca === hero.FOR ? 4 : Math.max(score, 3)
  }

  // #464 item 14 — arma não-marcial perde um degrau, salvo especialização.
  const ehSimples = arma.grupo === 'cac-simples' || arma.grupo === 'd-simples'
  const especializada = [...armasEspecializadas].some(
    (e) => e.toLowerCase() === arma.basename.toLowerCase(),
  )
  if (ehSimples && !especializada && nivel) {
    nivel = nivel === 'muito' ? 'recomendada' : nivel === 'recomendada' ? 'pouco' : null
    score = Math.max(0, score - 1)
  }
  return { nivel, score }
}

export type TipoArmadura = 'Sem' | 'Leve' | 'Pesada'

/** Recomendação de armadura (spec 6.2.1–6.2.3, em cascata literal). */
export function recomendacaoArmadura(
  prof: { sem: boolean; leve: boolean; pesada: boolean },
  hero: { FOR: number; AGI: number },
): TipoArmadura {
  if (prof.pesada && hero.FOR > hero.AGI) return 'Pesada'
  if (prof.leve && hero.AGI > hero.FOR) return 'Leve'
  return 'Sem'
}

/** Proficiências de armadura do FM (derivado). */
export function proficienciasArmaduraDoFm(fm: Record<string, unknown>): {
  sem: boolean
  leve: boolean
  pesada: boolean
} {
  const prof = (fmPath(fm, 'Inventario', 'Armadura', 'Proficiencia') ?? {}) as Record<string, unknown>
  return {
    sem: str(prof['Sem']) === 'P',
    leve: str(prof['Leve']) === 'P',
    pesada: str(prof['Pesada']) === 'P',
  }
}
