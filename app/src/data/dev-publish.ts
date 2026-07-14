// Publicar + Exportar do Modo Dev (#252/#253, F8/F9) — os dois lados do
// round-trip pedido pelo usuário:
//   • PUBLICAR: manda os rascunhos locais pro overlay compartilhado (Supabase);
//     os jogadores recebem. "até publicar fica tudo realmente local."
//   • EXPORTAR: reconstrói o .md (frontmatter + body) de cada doc editado pra
//     colar de volta no Obsidian — "não estamos abandonando 100% o obsidian".
import { stringify as stringifyYaml } from 'yaml'
import type { DocPatch } from './overlay'
import type { VaultDoc } from './types'
import { loadDoc } from './useDoc'
import { allLocalDrafts, clearLocalDraft } from './local-draft-store'
import { allPublishedOverlays, publishOverlays } from './published-overlay-store'

/** Publica TODOS os rascunhos locais na tabela compartilhada e limpa os locais
 *  (agora vivem no overlay publicado que todos leem). Devolve quantos foram. */
export async function publishAllDrafts(updatedBy: string | null): Promise<number> {
  const entries = Object.entries(allLocalDrafts()).map(([id, patch]) => ({ id, patch }))
  if (entries.length === 0) return 0
  await publishOverlays(entries, updatedBy)
  for (const { id } of entries) clearLocalDraft(id)
  return entries.length
}

/** Reconstrói o .md de UM doc a partir do base + patch. As edições de
 *  `ruleElements` voltam pro FM `Elementos_de_Regra` (a fonte real no .md). */
export function reconstructMarkdown(base: VaultDoc, patch: DocPatch): string {
  const fm: Record<string, unknown> = { ...base.frontmatter, ...(patch.frontmatter ?? {}) }
  if (patch.ruleElements) {
    fm.Elementos_de_Regra = patch.ruleElements.map((e) => e.raw)
  }
  const body = patch.body ?? base.body
  const yaml = stringifyYaml(fm)
  return `---\n${yaml}---\n${body}`
}

/** Todos os docs editados (publicado ⊕ rascunho local; local vence). */
function mergedPatches(): Record<string, DocPatch> {
  const out: Record<string, DocPatch> = { ...allPublishedOverlays() }
  for (const [id, patch] of Object.entries(allLocalDrafts())) {
    out[id] = { ...out[id], ...patch }
  }
  return out
}

export interface ExportEntry {
  path: string
  md: string
}

/** Bundle pra colar de volta no Obsidian: 1 .md por doc editado (round-trip). */
export async function buildExportBundle(): Promise<ExportEntry[]> {
  const patches = mergedPatches()
  const out: ExportEntry[] = []
  for (const [id, patch] of Object.entries(patches)) {
    try {
      const base = await loadDoc(id)
      out.push({ path: base.path, md: reconstructMarkdown(base, patch) })
    } catch {
      /* base ausente (ex.: id local/sessao) — pula */
    }
  }
  return out
}

/** Quantos docs estão editados agora (local ⊕ publicado). */
export function editedDocCount(): number {
  return Object.keys(mergedPatches()).length
}

/** Dispara o download de um JSON { path → md } pro usuário aplicar na vault
 *  (scripts/apply-edits.mjs). `stamp` vem do chamador (Date fora deste módulo). */
export function downloadExportBundle(bundle: ExportEntry[], stamp: string): void {
  const byPath = Object.fromEntries(bundle.map((e) => [e.path, e.md]))
  const blob = new Blob([JSON.stringify(byPath, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pleitost-compendio-edits-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}
