// Roster de combate a partir de blocos ```combat-marker``` nas notas de
// aventura da vault — port do pleitost-sync (READ-ONLY), que por sua vez
// delega parsing pro pleitost-autosheet:
//  - pleitost-sync/src/core/encounter.ts: parseCombatMarkerBlocks +
//    extractCombatMarkerBlocks + rosterEntryFromParsed (regra MVP: nota com
//    2+ blocos é rejeitada — combate prep tem exatamente 1 bloco).
//  - pleitost-autosheet/src/render/modes/combat-tracker/parse-roster.ts:
//    parseRosterLine (porte 1:1 do pleitost-combat-marker legado).
//  - pleitost-autosheet/src/render/modes/combat-tracker/block-source.ts:
//    splitBlockSource (roster antes do marker @estado, state depois).
// O state (@estado) é IGNORADO aqui, como no sync: o app prepara combate
// "fresco"; state vivo mora em session_encounters.
import type { EncounterRoster, EncounterRosterEntry } from '../data/session-repo/contract'

/* ── parse-roster.ts (autosheet) ─────────────────────────────────────── */

// Formato da linha: `- [N] <target> [init1[, init2[, ...]]]`, onde target é
// wikilink (`[[Goblin]]`/`[[Goblin|G1]]`) ou texto solto (genérico).
export interface ParsedRosterLine {
  quantity: number
  target: string
  initiatives: number[]
}

const PREFIX_RX = /^-\s*(?:(\d+)\s+)?(.*)$/
const TAIL_LIST_RX = /^[-+]?\d+(?:\.\d+)?(?:\s*,\s*[-+]?\d+(?:\.\d+)?)*$/
const TAIL_AFTER_TEXT_RX = /^(.*?)(?:\s+([-+]?\d+(?:\.\d+)?(?:\s*,\s*[-+]?\d+(?:\.\d+)?)*)\s*)$/

function toNullableNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

export function parseRosterLine(rawLine: string): ParsedRosterLine | null {
  const line = String(rawLine ?? '').trim()
  if (!line) return null
  const prefixMatch = line.match(PREFIX_RX)
  if (!prefixMatch) return null

  const quantity = Math.max(1, Number(prefixMatch[1] ?? 1) || 1)
  const remainder = String(prefixMatch[2] ?? '').trim()
  let target = remainder
  let initiatives: number[] = []

  const linkEnd = remainder.lastIndexOf(']]')
  if (linkEnd >= 0) {
    target = remainder.slice(0, linkEnd + 2).trim()
    const tail = remainder.slice(linkEnd + 2).trim()
    if (tail && TAIL_LIST_RX.test(tail)) {
      initiatives = tail.split(',')
        .map((entry) => toNullableNumber(entry))
        .filter((entry): entry is number => entry !== null)
    }
  } else {
    const tailMatch = remainder.match(TAIL_AFTER_TEXT_RX)
    if (tailMatch) {
      target = String(tailMatch[1] ?? '').trim()
      initiatives = String(tailMatch[2] ?? '')
        .split(',')
        .map((entry) => toNullableNumber(entry))
        .filter((entry): entry is number => entry !== null)
    }
  }

  return { quantity, target: target.trim(), initiatives }
}

/* ── block-source.ts (autosheet) ─────────────────────────────────────── */

export const STATE_MARKERS: ReadonlySet<string> = new Set(['@estado', '@state', '@tracker-state'])

export interface SplitBlockSource {
  rosterLines: string[]
  stateLines: string[]
}

/** Split do source em rosterLines (antes do marker) e stateLines (depois).
 *  Trim trailing empty lines do roster pra evitar blank trailing entries. */
export function splitBlockSource(source: string): SplitBlockSource {
  const lines = String(source ?? '').split('\n')
  const markerIndex = lines.findIndex((line) => STATE_MARKERS.has(line.trim().toLowerCase()))
  const rosterLines = (markerIndex >= 0 ? lines.slice(0, markerIndex) : lines).slice()
  while (rosterLines.length && !rosterLines[rosterLines.length - 1]!.trim()) rosterLines.pop()
  const stateLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : []
  return { rosterLines, stateLines }
}

/* ── encounter.ts (pleitost-sync) ────────────────────────────────────── */

/** Resultado do parser de uma nota inteira. */
export type ParseCombatMarkerBlocksResult =
  | { ok: true; roster: EncounterRoster; blockCount: 1 }
  | { ok: false; reason: 'no-block'; blockCount: 0 }
  | { ok: false; reason: 'multiple-blocks'; blockCount: number }

/** Encontra blocos ```combat-marker``` no conteúdo de uma nota.
 *  MVP (decisão do user no sync): rejeita notas com 2+ blocos — combate
 *  prep precisa ter exatamente 1 bloco. Roster vem do 1º bloco. */
export function parseCombatMarkerBlocks(noteContent: string): ParseCombatMarkerBlocksResult {
  const blocks = extractCombatMarkerBlocks(noteContent)
  if (blocks.length === 0) return { ok: false, reason: 'no-block', blockCount: 0 }
  if (blocks.length > 1) {
    return { ok: false, reason: 'multiple-blocks', blockCount: blocks.length }
  }
  const { rosterLines } = splitBlockSource(blocks[0]!)
  const entries: EncounterRosterEntry[] = []
  for (const raw of rosterLines) {
    const parsed = parseRosterLine(raw)
    if (!parsed) continue
    const entry = rosterEntryFromParsed(parsed)
    if (entry) entries.push(entry)
  }
  return { ok: true, roster: { entries }, blockCount: 1 }
}

/** Extrai todos os blocos de código com tag `combat-marker` do markdown. */
function extractCombatMarkerBlocks(content: string): string[] {
  const blocks: string[] = []
  const lines = content.split('\n')
  let inBlock = false
  let current: string[] = []
  for (const line of lines) {
    if (!inBlock) {
      // Aceita as 4 variantes que o autosheet processa (combat-marker,
      // combat-marker-small, combat-tracker, combat-tracker-small) —
      // canônico em @autosheet/cola/process-combat-marker-block.ts.
      const m = line.match(/^```\s*(?:combat-marker|combat-marker-small|combat-tracker|combat-tracker-small)\s*$/)
      if (m) {
        inBlock = true
        current = []
      }
    } else {
      if (line.match(/^```\s*$/)) {
        inBlock = false
        blocks.push(current.join('\n'))
      } else {
        current.push(line)
      }
    }
  }
  return blocks
}

/** Converte ParsedRosterLine pra EncounterRosterEntry — extrai sourcePath
 *  do wikilink + label de exibição. */
function rosterEntryFromParsed(parsed: ParsedRosterLine): EncounterRosterEntry | null {
  const target = parsed.target.trim()
  if (!target) return null
  // Wikilink: "[[Path|Alias]]" ou "[[Path]]"
  const m = target.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
  if (m) {
    const targetPath = m[1]!.trim()
    const alias = (m[2] ?? targetPath).trim()
    return {
      sourcePath: targetPath,
      label: alias,
      qty: parsed.quantity,
    }
  }
  // Texto raw (genérico): "Generico", "Goblin Lider", etc — sem source.
  return {
    sourcePath: null,
    label: target,
    qty: parsed.quantity,
  }
}
