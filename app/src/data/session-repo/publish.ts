// Publicação do personagem LOCAL na sessão — equivalente app do
// extractState/extractSummary/extractFmBlob do pleitost-sync (core/snapshot.ts):
// monta os jsonb que vão pra session_characters a partir do FM efetivo
// (derivado quando disponível — vida máx de ficha nova vem das regras).
// Mapeamentos idênticos ao plugin: evasao = Reflexo (invocacao-resolver.ts:260);
// state = Interativa.* volátil; fmBlob = FM completo menos campos locais.
import type { VaultDoc } from '../types'
import { fmPath, num, str } from '../../components/ficha/hero-model'
import { linkLabel } from '../../markdown/dataview-value'
import { memberStats } from '../../grupo/stats'
import { projectHeroRules } from '../../rules/useHeroRules'
import { loadDoc } from '../useDoc'
import type { Catalog } from '../catalog'
import type { CharacterFamily, CharacterState, CharacterSummary } from './contract'

/** FM EFETIVO (derivado) pra publicar na sessão. A vida/defesas MÁX de ficha nova
 *  vêm das REGRAS da classe (Definir Vida.Vitalidade/Moral etc.) — só existem no
 *  derivedFm; o FM salvo (skeleton) traz 0, então a mesa mostrava vida/vigor 0/0
 *  ou 24/0 (#323/#326). Deriva uma vez e alimenta summary/state/blob. Fallback:
 *  FM cru se a projeção falhar. */
export async function effectiveFmForPublish(
  doc: VaultDoc,
  catalog: Catalog,
): Promise<Record<string, unknown>> {
  try {
    const { projection } = await projectHeroRules(
      doc.frontmatter as Record<string, unknown>,
      catalog,
      loadDoc,
    )
    return projection.derivedFm
  } catch {
    return doc.frontmatter as Record<string, unknown>
  }
}

function familyOf(doc: VaultDoc): CharacterFamily {
  const sub = str(doc.frontmatter['subcategoria'] ?? doc.subtype)
  if (sub === 'Companheiro Animal') return 'CompanheiroAnimal'
  if (sub === 'Monstro') return 'Monstro'
  return 'Heroi'
}

/** Summary (jsonb) — alimenta a lista de jogadores e a ficha RESUMO. */
export function buildCharacterSummary(
  doc: VaultDoc,
  fmEffective?: Record<string, unknown>,
): CharacterSummary {
  const fm = fmEffective ?? (doc.frontmatter as Record<string, unknown>)
  const stats = memberStats(fm)
  const at = (fmPath(fm, 'Atributos') ?? {}) as Record<string, unknown>
  const summary: CharacterSummary = {
    nome: doc.basename,
    family: familyOf(doc),
    nivel: num(fm['Nível']),
    atributos: { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) },
    vitalidadeMax: num(fmPath(fm, 'Vida', 'Vitalidade')),
    moralMax: num(fmPath(fm, 'Vida', 'Moral')),
    stats: {
      defesa: stats.defs['Defesa'] ?? 0,
      vigor: stats.defs['Vigor'] ?? 0,
      // evasao = Reflexo (mapeamento do plugin)
      evasao: stats.defs['Reflexo'] ?? 0,
      impeto: stats.defs['Ímpeto'] ?? 0,
      movimento: stats.sp ?? 0,
      percepcao: stats.sns['Percepção'] ?? 0,
      intuicao: stats.sns['Intuição'] ?? 0,
    },
  }
  const classe = linkLabel(str(fm['Classe']))
  if (classe) summary.classe = classe
  const sintonia = linkLabel(str(fm['Sintonia']))
  if (sintonia) summary.sintonia = sintonia
  const raca = linkLabel(str(fm['Raça'] ?? fm['Raca']))
  if (raca) summary.raca = raca
  const tutor = str(fm['Tutor'])
  if (summary.family === 'CompanheiroAnimal' && tutor) summary.tutorRef = tutor
  return summary
}

/** State (jsonb) — volátil de mesa (Interativa.*). Ausente = recurso cheio,
 *  mesma semântica do useVidaLocal. */
export function buildCharacterState(
  doc: VaultDoc,
  fmEffective?: Record<string, unknown>,
): CharacterState {
  const fm = fmEffective ?? (doc.frontmatter as Record<string, unknown>)
  const rest = (fmPath(fm, 'Interativa', 'Recursos_Restantes') ?? {}) as Record<string, unknown>
  const vitMax = num(fmPath(fm, 'Vida', 'Vitalidade'))
  const moralMax = num(fmPath(fm, 'Vida', 'Moral'))
  return {
    recursosRestantes: {
      vitalidade: rest['Vitalidade'] !== undefined ? num(rest['Vitalidade']) : vitMax,
      moral: rest['Moral'] !== undefined ? num(rest['Moral']) : moralMax,
      em: rest['EM'] !== undefined ? num(rest['EM']) : num(fmPath(fm, 'Magias', 'EM')),
      moralTemp: num(rest['Moral_Temporaria']),
    },
    condicoesAtivas: (fmPath(fm, 'Interativa', 'Condicoes_Ativas') ?? {}) as Record<string, unknown>,
    efeitosAtivos: (fmPath(fm, 'Interativa', 'Efeitos_Ativos') ?? {}) as Record<string, unknown>,
    invocacoesAtivas: (fmPath(fm, 'Interativa', 'Invocacoes_Ativas') ?? {}) as Record<string, unknown>,
  }
}

/** Campos que NÃO vão no blob (sync-managed via state, ou locais). Espelho do
 *  extractFmBlob do plugin (Interativa fica de fora — o volátil viaja no
 *  state; aliases/dg-publish são locais da vault). */
const FM_BLOB_EXCLUDE = new Set(['Interativa', 'aliases', 'dg-publish'])

export function extractFmBlob(fm: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fm)) {
    if (FM_BLOB_EXCLUDE.has(k)) continue
    out[k] = structuredClone(v)
  }
  return out
}
