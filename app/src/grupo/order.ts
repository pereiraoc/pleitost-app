// Ordenações de membros da ficha de grupo — ESPELHAM render-party-sheet.ts
// do plugin pleitost-autosheet (READ-ONLY):
//  - orderMembersAlphabetical      → seção Balanceamento de papéis
//  - orderMembersLevelDescThenName → seção Vida/Defesas/Sentidos/Movimento
//  - orderMembersMaxAttackDesc     → seção Ataques do grupo
// A riqueza ordena por delta desc (appendWealthSection) — vive em wealth.ts.
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { maxAttackModifier } from './ataques'
import { nivelOf } from './stats'

const byName = (a: IndexDocEntry, b: IndexDocEntry) =>
  (a.basename ?? a.id).localeCompare(b.basename ?? b.id, 'pt')

/** Espelha orderMembersAlphabetical (render-party-sheet.ts). */
export function orderAlphabetical(members: IndexDocEntry[]): IndexDocEntry[] {
  return [...members].sort(byName)
}

/** Espelha orderMembersLevelDescThenName (render-party-sheet.ts). */
export function orderByLevelDesc(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): IndexDocEntry[] {
  return [...members].sort((a, b) => {
    const na = nivelOf(docs?.get(a.id))
    const nb = nivelOf(docs?.get(b.id))
    if (nb !== na) return nb - na
    return byName(a, b)
  })
}

/** Espelha orderMembersMaxAttackDesc (render-party-sheet.ts). */
export function orderByMaxAttackDesc(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): IndexDocEntry[] {
  return [...members].sort((a, b) => {
    const ma = maxAttackModifier(docs?.get(a.id)?.frontmatter)
    const mb = maxAttackModifier(docs?.get(b.id)?.frontmatter)
    const va = ma == null ? -Infinity : ma
    const vb = mb == null ? -Infinity : mb
    if (vb !== va) return vb - va
    return byName(a, b)
  })
}
