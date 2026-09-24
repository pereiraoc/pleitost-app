// PICKS de subclasse no FM do herói (2026-09-24): a escolha de nível 1 grava
// uma linha `{ "[[Opção]]": "Escolha.[[Pai]]" }` em Habilidades.Lista
// (applySubclassPick da ficha). Aqui: ler os picks atuais direto do FM (sem
// esperar a re-projeção das regras — é o que deixa o passo responsivo) e
// montar as linhas de VÁRIOS picks de uma vez (Bardo: Método + Estilo).
import { fmPath } from '../ficha/hero-model'
import { withSubclassPick } from '../ficha/HabilidadesTab'

export type Pick = { parent: string; alvo: string }

const TAG_RE = /^Escolha(?:\.\d+)?\.\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/
const KEY_RE = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/

export function linhasHabilidades(fm: Record<string, unknown>): Record<string, unknown>[] {
  const rows = fmPath(fm, 'Habilidades', 'Lista')
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/** parent (basename da escolha) → alvo (basename da opção) dos picks gravados. */
export function picksAtuais(fm: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of linhasHabilidades(fm)) {
    const entries = Object.entries(row)
    if (entries.length !== 1) continue
    const [key, source] = entries[0]!
    const tag = typeof source === 'string' ? TAG_RE.exec(source) : null
    const alvo = KEY_RE.exec(key)
    if (tag && alvo) out.set(tag[1]!.trim(), alvo[1]!.trim())
  }
  return out
}

/** Linhas de Habilidades.Lista com os picks aplicados em sequência (cada um
 *  troca a linha da própria escolha ou acrescenta). */
export function linhasComPicks(base: Record<string, unknown>[], picks: Pick[]): Record<string, unknown>[] {
  let rows = base
  for (const p of picks) rows = withSubclassPick(rows, p.parent, `[[${p.alvo}]]`)
  return rows
}
