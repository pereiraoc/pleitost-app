// CRIADOR DE AVENTURA do Modo Mestre (#194) — visualizador de planejamento:
// seleciona o nível do grupo e vê a RECOMPENSA esperada (expectedWealthForLevel
// de src/grupo/wealth.ts, espelho REUSADO do economy-table do autosheet — não
// duplicado) com o delta entre níveis, e a tabela de dificuldade por nível
// (computeEncounterDifficultyByLevel, port verbatim) pro roster de uma nota
// de aventura da vault (blocos ```combat-marker``` parseados pelo port do
// pleitost-sync em src/mestre/combat-marker.ts).
// A tela mora numa aba mestre-gated da página CRIATURAS (vide CreaturesPages).
import { useMemo, useState } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import type { FolderNode } from '../../data/catalog'
import { useDocs } from '../../data/useDoc'
import { useSettings } from '../../settings'
import { ECONOMY_WEALTH_DATA, expectedWealthForLevel } from '../../grupo/wealth'
import { parseCombatMarkerBlocks } from '../../mestre/combat-marker'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  formatDifficultyValue,
} from '../../mestre/encounter-compute'
import { combatantsFrom, resolveRosterEntries, rosterMonsterIds } from '../../mestre/roster'
import type { IndexDocEntry } from '../../data/types'
import { DifficultyBadge, fieldInputStyle, fieldLabelStyle, sectionStyle } from './ui'

// Notas de aventura/combate vivem na árvore de Campanhas da vault.
const CAMPANHAS_FOLDER = 'Campanhas'

/** Docs content da subárvore (folder notes excluídas, como nas listas). */
function docsUnder(node: FolderNode | undefined): IndexDocEntry[] {
  if (!node) return []
  return [
    ...node.docs.filter((d) => d.basename !== node.name),
    ...node.folders.flatMap((f) => docsUnder(f)),
  ]
}

export function CriadorAventura() {
  const { mestre } = useSettings()
  const catalog = useCatalog()

  const [nivel, setNivel] = useState(1)
  const [noteId, setNoteId] = useState('')

  // todas as notas da árvore Campanhas (17 docs — carga leve, cacheada)
  const campanhaEntries = useMemo(
    () => docsUnder(catalog.folderByPath.get(CAMPANHAS_FOLDER)),
    [catalog],
  )
  const campanhaDocs = useDocs(useMemo(() => campanhaEntries.map((e) => e.id), [campanhaEntries]))

  // só notas com EXATAMENTE 1 bloco combat-marker (regra MVP do sync)
  const candidatas = useMemo(() => {
    if (!campanhaDocs) return []
    return campanhaEntries.filter((e) => {
      const doc = campanhaDocs.get(e.id)
      return doc ? parseCombatMarkerBlocks(doc.body).ok : false
    })
  }, [campanhaEntries, campanhaDocs])

  const roster = useMemo(() => {
    const doc = noteId ? campanhaDocs?.get(noteId) : undefined
    if (!doc) return null
    const parsed = parseCombatMarkerBlocks(doc.body)
    return parsed.ok ? parsed.roster : null
  }, [noteId, campanhaDocs])

  // resolve wikilink target → doc do catálogo → carrega os docs de monstro
  const resolvedIds = useMemo(
    () => (roster ? rosterMonsterIds(roster, catalog) : []),
    [roster, catalog],
  )
  const monsterDocs = useDocs(resolvedIds)

  const resolvidas = useMemo(
    () => (roster ? resolveRosterEntries(roster, catalog, monsterDocs) : []),
    [roster, catalog, monsterDocs],
  )

  const combatants = useMemo(
    () =>
      combatantsFrom(
        resolvidas.flatMap((r) => (r.item ? [r.item] : [])),
        [],
      ),
    [resolvidas],
  )
  const byLevel = useMemo(() => computeEncounterDifficultyByLevel(combatants), [combatants])
  const monsterTotal = computeEncounterDifficulty(combatants).monsterTotal

  // gate defensivo — a página CRIATURAS já desabilita a aba sem Modo Mestre
  if (!mestre) return null

  const esperado = expectedWealthForLevel(nivel)
  const deltaProximo =
    (nivel >= 10 ? (ECONOMY_WEALTH_DATA.post10 ?? 0) : expectedWealthForLevel(nivel + 1)) - esperado

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="kicker">{'// CRIADOR DE AVENTURA'}</div>

      {/* ── nível do grupo ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// NÍVEL DO GRUPO'}</div>
        <label>
          <span style={fieldLabelStyle}>NÍVEL</span>
          <select
            aria-label="Nível do grupo"
            value={nivel}
            onChange={(e) => setNivel(Number(e.target.value))}
            style={{ ...fieldInputStyle, cursor: 'pointer', width: 90 }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── recompensa esperada (economia do plugin, via wealth.ts) ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// RECOMPENSA ESPERADA'}</div>
        <div style={{ fontSize: 14 }}>
          Riqueza esperada por herói no nível {nivel}:{' '}
          <strong>{esperado} PO</strong>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginLeft: 10 }}>
            Δ pro próximo nível: +{deltaProximo} PO
          </span>
        </div>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Nível</th>
              <th>Riqueza esperada</th>
              <th>Δ do nível anterior</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <tr
                key={n}
                aria-current={n === nivel ? 'true' : undefined}
                style={
                  n === nivel
                    ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }
                    : undefined
                }
              >
                <td>{n}</td>
                <td>{expectedWealthForLevel(n)} PO</td>
                <td>{n === 1 ? '—' : `+${expectedWealthForLevel(n) - expectedWealthForLevel(n - 1)} PO`}</td>
              </tr>
            ))}
            <tr>
              <td>&gt;10</td>
              <td>{ECONOMY_WEALTH_DATA.post10} PO</td>
              <td>+{(ECONOMY_WEALTH_DATA.post10 ?? 0) - expectedWealthForLevel(10)} PO</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── roster de uma nota de aventura da vault ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// ROSTER DA AVENTURA'}</div>
        <label>
          <span style={fieldLabelStyle}>NOTA COM BLOCO COMBAT-MARKER</span>
          <select
            aria-label="Nota de aventura"
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            style={{ ...fieldInputStyle, cursor: 'pointer', minWidth: 260, maxWidth: '100%' }}
          >
            <option value="">(nenhuma)</option>
            {candidatas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.basename ?? e.id}
              </option>
            ))}
          </select>
        </label>
        {roster ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resolvidas.map((r, i) => (
              <li key={`${r.entry.label}-${i}`} style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>
                  {r.entry.qty}× {r.entry.label}
                </span>{' '}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
                  {r.item ? `T${r.item.tier}${r.item.modificador ? ` · ${r.item.modificador}` : ''}` : r.motivo}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── dificuldade por nível (barra do tracker em forma de tabela) ── */}
      {roster ? (
        <div style={sectionStyle}>
          <div className="kicker">
            {'// DIFICULDADE POR NÍVEL'}
            <span style={{ marginLeft: 8, color: 'var(--accent)' }}>
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
                <tr
                  key={entry.level}
                  aria-current={entry.level === nivel ? 'true' : undefined}
                  style={
                    entry.level === nivel
                      ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }
                      : undefined
                  }
                >
                  <td>{entry.level}</td>
                  <td>T{entry.tier}</td>
                  <td>
                    <DifficultyBadge meta={entry} ratio={entry.ratio} />
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                    {formatDifficultyValue(entry.ratio)}% ({formatDifficultyValue(entry.monsterTotal)}/
                    {formatDifficultyValue(entry.playerTotal)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
