import type { ComponentType } from 'react'
import type { VaultDoc } from '../data/types'
import { DataviewBlock } from '../dataview/DataviewBlock'
import { CombatMarkerBlock } from '../mestre/CombatMarkerBlock'
import { BountyFence } from './bounty/BountyFence'

export interface FenceProps {
  lang: string
  code: string
  doc: VaultDoc
}

/** M1: linhas cruas da DSL; a AST (doc.ruleElements) vira UI em milestone futuro. */
function AutosheetRulesFence({ code }: FenceProps) {
  if (!code.trim()) return null
  return <pre className="fence-autosheet-rules">{code}</pre>
}

/** #249: fence ```combat-marker(-small)``` — o mesmo bloco que o
 *  pleitost-autosheet usa nas notas de combate. Parseia o roster + computa a
 *  dificuldade (via CombatMarkerBlock, que reusa combat-marker.ts +
 *  encounter-compute.ts) em vez do <pre> cru. Funciona na CombateView e em
 *  qualquer doc que embuta o bloco. */
function CombatMarkerFence({ code }: FenceProps) {
  return <CombatMarkerBlock code={code} />
}

export function FenceFallback({ lang, code }: FenceProps) {
  return <pre className={`fence-${lang}`}>{code}</pre>
}

/**
 * Registro central lang → renderer de fence do body. Novos tipos de bloco
 * (carta-item, button, ...) entram AQUI, nunca com if/else no call-site.
 */
export const FENCES: Record<string, ComponentType<FenceProps>> = {
  dataview: DataviewBlock, // avaliada de verdade; fallback interno pro colapsado
  'autosheet-rules': AutosheetRulesFence,
  // #249: as 2 tags que aparecem nas notas de combate da vault (o autosheet
  // processa 4 variantes; -small/plain são as usadas nas notas de prep).
  'combat-marker': CombatMarkerFence,
  'combat-marker-small': CombatMarkerFence,
  bounty: BountyFence, // #248: carta de aventura (rank/subcat/recompensa/objetivos)
}
