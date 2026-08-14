// MODO WIZARD da criação de herói (#452/#453) — helpers puros de detecção.
//
// O wizard é um MODO da FichaPage, não uma rota: "Criar Herói" grava o marcador
// `Wizard: { passo: N }` no FM do herói local recém-criado e a ficha renderiza o
// WizardView no lugar das abas até o passo final remover o marcador. O marcador
// vive no FM comum (write-through do local-entities → sincroniza entre devices e
// carimba `updatedAt` como qualquer edição), então o progresso é retomável em
// qualquer aparelho. Herói da VAULT nunca entra em wizard (read-only por design).
import { isLocalId } from '../../data/local-entities'
import type { VaultDoc } from '../../data/types'

/** O doc está no meio da criação acompanhada? (só herói LOCAL com marcador) */
export function wizardAtivo(doc: VaultDoc | null | undefined): boolean {
  if (!doc || !isLocalId(doc.id)) return false
  const w = (doc.frontmatter as Record<string, unknown>)['Wizard']
  return !!w && typeof w === 'object'
}

/** Passo salvo (1-based sobre o registro FIXO de passos; default 1). */
export function wizardPasso(fm: Record<string, unknown>): number {
  const w = fm['Wizard']
  if (!w || typeof w !== 'object') return 1
  const p = (w as Record<string, unknown>)['passo']
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}
