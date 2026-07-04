import type { ComponentType } from 'react'
import type { VaultDoc } from '../data/types'

export interface FenceProps {
  lang: string
  code: string
  doc: VaultDoc
}

/** M1: query crua colapsada (rótulo = a própria lang do fence). Avaliador em M2. */
function DataviewFence({ lang, code }: FenceProps) {
  return (
    <details className="fence-dataview">
      <summary>{lang}</summary>
      <pre>{code}</pre>
    </details>
  )
}

/** M1: linhas cruas da DSL; a AST (doc.ruleElements) vira UI em milestone futuro. */
function AutosheetRulesFence({ code }: FenceProps) {
  if (!code.trim()) return null
  return <pre className="fence-autosheet-rules">{code}</pre>
}

export function FenceFallback({ lang, code }: FenceProps) {
  return <pre className={`fence-${lang}`}>{code}</pre>
}

/**
 * Registro central lang → renderer de fence do body. Novos tipos de bloco
 * (carta-item, button, ...) entram AQUI, nunca com if/else no call-site.
 */
export const FENCES: Record<string, ComponentType<FenceProps>> = {
  dataview: DataviewFence,
  'autosheet-rules': AutosheetRulesFence,
}
