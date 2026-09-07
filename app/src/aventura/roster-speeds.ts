// ROSTER DO FORMATO DE AVENTURA: o MESMO fence combat-marker do autosheet, com
// um sufixo opcional depois do wikilink — a velocidade de iniciativa do app
// por instância ("- 3 [[Arruaceiro]] lento", "- 4 [[X]] rápido, lento, lento,
// lento"). O parser do plugin/sync ignora o sufixo (só aceita números como
// iniciativa), então a nota segue válida no Obsidian. Aqui: reusa
// splitBlockSource + parseRosterLine (combat-marker.ts) pra o roster e lê o
// sufixo contra o registro de velocidades (initiative-blocks.speedFromLabel).
import type { EncounterRoster, EncounterRosterEntry } from '../data/session-repo/contract'
import { speedFromLabel, type SpeedTier } from '../data/initiative-blocks'
import { parseRosterLine, splitBlockSource } from '../mestre/combat-marker'

const LINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/

/** Sufixo de velocidades de uma linha crua (depois do último `]]`). */
export function speedsFromLine(rawLine: string): SpeedTier[] {
  const line = String(rawLine ?? '').trim()
  const linkEnd = line.lastIndexOf(']]')
  if (linkEnd < 0) return []
  const tail = line.slice(linkEnd + 2).trim()
  if (!tail) return []
  return tail
    .split(',')
    .map((t) => speedFromLabel(t))
    .filter((t): t is SpeedTier => t !== null)
}

/** Roster de um fence (só o conteúdo entre as cercas), com `speeds` por
 *  entrada quando a nota declara. Entradas com o MESMO alvo ficam separadas
 *  (é assim que "1 rápido + 3 lentos" se escreve). */
export function rosterFromFence(code: string): EncounterRoster {
  const { rosterLines } = splitBlockSource(code)
  const entries: EncounterRosterEntry[] = []
  for (const raw of rosterLines) {
    const parsed = parseRosterLine(raw)
    if (!parsed) continue
    const target = parsed.target.trim()
    if (!target) continue
    const m = LINK_RE.exec(target)
    const entry: EncounterRosterEntry = m
      ? { sourcePath: m[1]!.trim(), label: (m[2] ?? m[1]!).trim(), qty: parsed.quantity }
      : { sourcePath: null, label: target, qty: parsed.quantity }
    const speeds = speedsFromLine(raw)
    if (speeds.length) entry.speeds = speeds
    entries.push(entry)
  }
  return { entries }
}
