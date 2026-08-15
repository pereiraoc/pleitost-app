// RECOMENDAÇÃO DE EQUIPAMENTO INICIAL do wizard (#452/#457; regras de arma
// REDEFINIDAS pelo usuário em 2026-08-15) — módulo PURO e unit-testado.
//
// Regras de ARMA (decisão do usuário, na ordem de aplicação):
//  1. Sem proficiência NA arma (específica > grupo) → nunca recomendada.
//  2. AGI > FOR  OU  AGI ≥ 2 → armas PRECISAS e À DISTÂNCIA viram recomendadas.
//  3. FOR 1/2 → armas de Força == FOR viram recomendadas;
//     FOR 3 → armas de Força 3 viram MUITO recomendadas.
//  4. À DISTÂNCIA já recomendada por outro motivo e com Força == FOR (FOR 0/1/2;
//     FOR 0 = arma SEM a propriedade Força) → vira MUITO recomendada.
//  5. BÔNUS DE ESPECIALIZAÇÃO cobrindo a arma sobe UM degrau do que já está
//     recomendado: recomendada → muito; muito → EXTREMAMENTE. Não cria
//     recomendação onde não há.
//
//  6.2 Armadura (spec original #452): Pesada se proficiente e FOR > AGI; senão
//      Leve se proficiente e AGI > FOR; senão Sem Armadura.
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

export type NivelRecomendacao = 'extremamente' | 'muito' | 'recomendada' | null

/** O herói é proficiente NESTA arma? (específica > grupo). */
export function proficienteNaArma(arma: ArmaInfo, prof: ProficienciasArmas): boolean {
  if (prof.especificas.some((e) => e.toLowerCase() === arma.basename.toLowerCase())) return true
  if (arma.grupo === 'cac-marcial' || arma.grupo === 'd-marcial') return prof.marciais
  return prof.simples
}

const SCORE_POR_NIVEL: Record<'extremamente' | 'muito' | 'recomendada', number> = {
  extremamente: 3,
  muito: 2,
  recomendada: 1,
}

/**
 * Nível de recomendação de UMA arma pro herói (regras 2026-08-15, ver topo).
 * `armasEspecializadas`: basenames cobertos por BÔNUS DE ESPECIALIZAÇÃO
 * (grupoArma.armas dos Efeitos_Interativos — ex.: Estilo de Guerreiro Duelo).
 * `score` = degrau numérico do nível, pra ordenar o picker.
 */
export function recomendacaoArma(
  arma: ArmaInfo,
  hero: { FOR: number; AGI: number },
  prof: ProficienciasArmas,
  armasEspecializadas: ReadonlySet<string> = new Set(),
): { nivel: NivelRecomendacao; score: number } {
  // Regra 1 — proficiência manda: sem proficiência NA arma, nada.
  if (!proficienteNaArma(arma, prof)) return { nivel: null, score: 0 }

  const aDistancia = arma.grupo === 'd-simples' || arma.grupo === 'd-marcial'
  let nivel: NivelRecomendacao = null

  // Regra 2 — AGI: precisas e à distância recomendadas.
  if ((hero.AGI > hero.FOR || hero.AGI >= 2) && (arma.precisa || aDistancia)) nivel = 'recomendada'

  // Regra 3 — Força casada: FOR 1/2 recomendada; FOR 3 muito.
  if (arma.forca === hero.FOR) {
    if (hero.FOR === 3) nivel = 'muito'
    else if (hero.FOR >= 1 && nivel === null) nivel = 'recomendada'
  }

  // Regra 4 — à distância JÁ recomendada + Força == FOR (0/1/2) → muito.
  if (aDistancia && nivel !== null && hero.FOR <= 2 && arma.forca === hero.FOR) nivel = 'muito'

  // Regra 5 — especialização sobe um degrau do que já está recomendado.
  const especializada = [...armasEspecializadas].some(
    (e) => e.toLowerCase() === arma.basename.toLowerCase(),
  )
  if (especializada && nivel === 'muito') nivel = 'extremamente'
  else if (especializada && nivel === 'recomendada') nivel = 'muito'

  return { nivel, score: nivel ? SCORE_POR_NIVEL[nivel] : 0 }
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
