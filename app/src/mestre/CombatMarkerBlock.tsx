// BLOCO DE COMBAT-MARKER (#249, F5 do épico #243) — renderiza o roster de um
// fence ```combat-marker```/```combat-marker-small``` (o mesmo bloco que o
// pleitost-autosheet usa nas notas de combate) + a dificuldade computada, na
// linguagem visual do app. É a UI compartilhada entre:
//   - o FENCE (CombatMarkerFence em markdown/fence-registry) que substitui o
//     <pre> cru quando o body embute o bloco;
//   - a CombateView (página de um doc `type: Combate` no compêndio).
//
// REUSO (nada reimplementado): parseCombatMarkerBlocks/splitBlockSource +
// parseRosterLine de src/mestre/combat-marker.ts (port do pleitost-sync/autosheet)
// pra parsear o roster, e computeEncounterDifficulty/…ByLevel de
// src/mestre/encounter-compute.ts (port verbatim do compute do autosheet) pra a
// dificuldade — os MESMOS módulos que o CriadorAventura/CriadorCombate usam. Os
// wikilinks de monstro são resolvidos contra o catálogo pra ler Tier/Modificador
// da ficha (resolveRosterEntries em src/mestre/roster.ts, fonte única).
import { useMemo } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import { parseCombatMarkerBlocks, splitBlockSource } from './combat-marker'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  formatDifficultyValue,
} from './encounter-compute'
import { combatantsFrom, resolveRosterEntries, rosterMonsterIds } from './roster'
import type { EncounterRoster } from '../data/session-repo/contract'
import { DifficultyBadge } from '../components/mestre/ui'

/** Parseia o roster de um fence combat-marker cru (só o conteúdo entre as
 *  cercas). Reusa splitBlockSource + parseRosterLine (combat-marker.ts): o
 *  state @estado/linhas de iniciativa são ignorados, como no sync. */
function parseFenceRoster(code: string): EncounterRoster {
  // parseCombatMarkerBlocks espera markdown com as cercas; aqui já temos só o
  // corpo do fence, então split direto (o markdown renderer entrega sem cercas).
  const { rosterLines } = splitBlockSource(code)
  // reusa o pipeline do parser embrulhando de volta num bloco pra 1 caminho só
  const wrapped = ['```combat-marker', ...rosterLines, '```'].join('\n')
  const parsed = parseCombatMarkerBlocks(wrapped)
  return parsed.ok ? parsed.roster : { entries: [] }
}

/** Roster + dificuldade de um combate. `code` = corpo cru de um fence
 *  combat-marker; `roster` = roster já parseado (a CombateView passa o do doc). */
export function CombatMarkerBlock({ code, roster: rosterProp }: { code?: string; roster?: EncounterRoster }) {
  const catalog = useCatalog()
  const roster = useMemo<EncounterRoster>(
    () => rosterProp ?? parseFenceRoster(code ?? ''),
    [rosterProp, code],
  )

  const monsterIds = useMemo(() => rosterMonsterIds(roster, catalog), [roster, catalog])
  const monsterDocs = useDocs(monsterIds)
  const resolvidas = useMemo(
    () => resolveRosterEntries(roster, catalog, monsterDocs),
    [roster, catalog, monsterDocs],
  )

  const combatants = useMemo(
    () => combatantsFrom(resolvidas.flatMap((r) => (r.item ? [r.item] : [])), []),
    [resolvidas],
  )
  const monsterTotal = useMemo(() => computeEncounterDifficulty(combatants).monsterTotal, [combatants])
  const byLevel = useMemo(() => computeEncounterDifficultyByLevel(combatants), [combatants])

  if (roster.entries.length === 0) return null

  return (
    <div className="combat-marker">
      {/* ── roster ── */}
      <div className="combat-roster">
        <div className="kicker">{'// ROSTER'}</div>
        <ul className="combat-roster-list">
          {resolvidas.map((r, i) => (
            <li key={`${r.entry.label}-${i}`} className="combat-roster-item">
              <span className="combat-roster-qty">
                {r.entry.qty}× {r.entry.label}
              </span>
              <span className="combat-roster-meta">
                {r.item
                  ? `T${r.item.tier}${r.item.modificador ? ` · ${r.item.modificador}` : ''}`
                  : r.motivo}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── dificuldade por nível (a "barra" do tracker do plugin em tabela) ── */}
      <div className="combat-difficulty">
        <div className="kicker">
          {'// DIFICULDADE POR NÍVEL'}
          <span className="combat-difficulty-pts">
            Monstros {formatDifficultyValue(monsterTotal)} pts
          </span>
        </div>
        <table className="doc-table" data-mestre-dificuldade="">
          <thead>
            <tr>
              <th>Nível</th>
              <th>Tier</th>
              <th>Dificuldade</th>
              <th>Razão</th>
            </tr>
          </thead>
          <tbody>
            {byLevel.map((entry) => (
              <tr key={entry.level}>
                <td>{entry.level}</td>
                <td>T{entry.tier}</td>
                <td>
                  <DifficultyBadge meta={entry} ratio={entry.ratio} />
                </td>
                <td className="combat-difficulty-ratio">
                  {formatDifficultyValue(entry.ratio)}% ({formatDifficultyValue(entry.monsterTotal)}/
                  {formatDifficultyValue(entry.playerTotal)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
