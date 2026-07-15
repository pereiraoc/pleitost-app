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
import { useMemo, useState, type KeyboardEvent } from 'react'
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
import { DifficultyBadge, EncounterLevelBar } from '../components/mestre/ui'
import { useDetail } from '../data/detail-context'
import { useSettings } from '../settings'
import { useSessionRepo, useSessionUser } from '../data/session-repo/provider'
import { useLiveSession } from '../data/session-repo/live-session'
import { addRosterToInitiative } from '../data/session-repo/encounter-actions'

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
  const detail = useDetail()
  const { mestre } = useSettings()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const live = useLiveSession()
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

  // #266: pré-seleção de máscara dos NPCs ao adicionar à sessão. "disfarçado"
  // é o DEFAULT do combat-tracker (NPC nasce mascarado), então o toggle começa
  // marcado; "invisível" começa desmarcado (NPC visível na lista).
  const [invisivel, setInvisivel] = useState(false)
  const [disfarcado, setDisfarcado] = useState(true)
  const [status, setStatus] = useState('')

  // Gate do "Adicionar à sessão": Modo Mestre + servidor + sala ativa (mesmo
  // gate do Criador de Combate / #229). Sem isso, o bloco fica só de leitura.
  const podeAdicionar = mestre && !!repo && !!user && !!live

  if (roster.entries.length === 0) return null

  const adicionar = async () => {
    if (!repo || !user || !live) return
    await addRosterToInitiative({
      repo,
      catalog,
      live,
      memberId: user.id,
      name: 'Combate',
      entries: roster.entries,
      mask: { invisivel, disfarcado },
    })
    const total = roster.entries.reduce((n, e) => n + Math.max(1, e.qty), 0)
    setStatus(`${total} combatente${total === 1 ? '' : 's'} adicionado${total === 1 ? '' : 's'} à iniciativa.`)
  }

  return (
    <div className="combat-marker">
      {/* ── barrinhas de dificuldade no TOPO (espelho do gm-enc-levelbar do
          combat-tracker do plugin) — o pedido AS-IS do #266. ── */}
      <div className="combat-difficulty-bars" data-combat-difficulty-bars="">
        <span className="combat-difficulty-bars-label">{'// DIFICULDADE'}</span>
        <EncounterLevelBar byLevel={byLevel} />
      </div>

      {/* ── roster: cada linha é CLICÁVEL → abre a ficha-resumo no painel
          DETALHES da direita (via useDetail; o doc resolve pelo catálogo). ── */}
      <div className="combat-roster">
        <div className="kicker">{'// ROSTER'}</div>
        <ul className="combat-roster-list">
          {resolvidas.map((r, i) => {
            // sourceId = id do doc no catálogo (rosterItemFromDoc). Genérico/
            // sem ficha → não abre resumo (não há doc), fica estático.
            const docId = r.item?.sourceId ?? null
            const abrir = docId && detail ? () => detail.open({ kind: 'resumo', id: docId }) : null
            return (
              <li
                key={`${r.entry.label}-${i}`}
                className={`combat-roster-item${abrir ? ' is-clickable' : ''}`}
                {...(abrir
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      onClick: abrir,
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrir()
                        }
                      },
                      title: `Ver ficha-resumo de ${r.entry.label}`,
                    }
                  : {})}
              >
                <span className="combat-roster-qty">
                  {r.entry.qty}× {r.entry.label}
                </span>
                <span className="combat-roster-meta">
                  {r.item
                    ? `T${r.item.tier}${r.item.modificador ? ` · ${r.item.modificador}` : ''}`
                    : r.motivo}
                </span>
              </li>
            )
          })}
        </ul>

        {/* ── controles do Mestre (#266): adicionar o roster à iniciativa da
            sessão + toggles invisível/disfarçado. Só aparece no gate GM. ── */}
        {podeAdicionar ? (
          <div className="combat-roster-actions" data-combat-roster-actions="">
            <div className="combat-roster-toggles">
              <label className="combat-roster-toggle">
                <input
                  type="checkbox"
                  checked={invisivel}
                  onChange={(e) => setInvisivel(e.target.checked)}
                  aria-label="Iniciar invisível"
                />
                <span>Iniciar invisível</span>
              </label>
              <label className="combat-roster-toggle">
                <input
                  type="checkbox"
                  checked={disfarcado}
                  onChange={(e) => setDisfarcado(e.target.checked)}
                  aria-label="Iniciar disfarçado"
                />
                <span>Iniciar disfarçado</span>
              </label>
            </div>
            <button
              type="button"
              className="combat-roster-add"
              onClick={() => void adicionar()}
            >
              + Adicionar à sessão
            </button>
          </div>
        ) : null}
        {status ? (
          <div role="status" className="combat-roster-status">
            {status}
          </div>
        ) : null}
      </div>

      {/* ── dificuldade por nível detalhada (a "barra" do tracker em tabela) ── */}
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
