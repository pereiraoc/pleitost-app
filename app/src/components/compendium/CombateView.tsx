// VISUALIZADOR DE COMBATE (#249, F5 do épico #243) — mostra um doc
// `type: Combate` (Campanhas/Combates/*) como o combat-tracker/criador de
// combate do pleitost-autosheet: o ROSTER (contagem por monstro) + a
// DIFICULDADE computada por nível, em vez do markdown cru (```combat-marker```
// caía no <pre> fallback).
//
// REUSO (nada reimplementado): o corpo é renderizado pelo CombatMarkerBlock
// (src/mestre/CombatMarkerBlock), que parseia via combat-marker.ts e computa
// via encounter-compute.ts — os MESMOS módulos dos Criadores (#194/#195). O
// roster vem do bloco combat-marker do doc.body (parseCombatMarkerBlocks).
//
// CRIAÇÃO (Modo Mestre): o Criador de Combate JÁ EXISTE (#194) como aba
// mestre-gated da página CRIATURAS; a tela de Combates linka pra ele via
// `/npcs?tab=combate` (deep-link de aba, mesmo padrão do FichaPage). A folha
// Campanhas/Combates lista os combates numa grade (CombateGrid).
//
// Registro: registerDocView({id:'combate'}) + registerLeafView('Combate').
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { useSettings } from '../../settings'
import { parseCombatMarkerBlocks } from '../../mestre/combat-marker'
import { CombatMarkerBlock } from '../../mestre/CombatMarkerBlock'
import { combatantsFrom, resolveRosterEntries, rosterMonsterIds } from '../../mestre/roster'
import {
  computeEncounterDifficultyByLevel,
  type EncounterDifficultyByLevelEntry,
} from '../../mestre/encounter-compute'
import type { EncounterRoster } from '../../data/session-repo/contract'
import { EncounterLevelBar } from '../mestre/ui'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { registerDocView } from './doc-view-registry'
import { registerLeafView } from './leaf-view-registry'
import { DocRuleElements } from './RuleElements'

/** Categoria que dispara este visualizador. `doc.type` espelha
 *  `frontmatter.categoria` (extractor) — as notas em Campanhas/Combates são
 *  todas `categoria: Combate`. */
export const COMBATE_CATEGORY = 'Combate'

export function isCombate(doc: VaultDoc): boolean {
  return doc.type === COMBATE_CATEGORY
}

// ─────────────────────────── página de um Combate ───────────────────────────

/** Ficha de página de um Combate: nome + roster + dificuldade (a UI do tracker
 *  do plugin, via CombatMarkerBlock). Em Modo Mestre, um atalho pro Criador de
 *  Combate (#194) na página CRIATURAS. */
export function CombateSheet({ doc }: { doc: VaultDoc }) {
  const { mestre } = useSettings()
  const parsed = parseCombatMarkerBlocks(doc.body)
  const roster = parsed.ok ? parsed.roster : { entries: [] }

  return (
    <section className="page combate-page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <header className="combate-header">
        <h1>{doc.basename}</h1>
        <span className="doc-type">{COMBATE_CATEGORY}</span>
      </header>
      {roster.entries.length ? (
        <CombatMarkerBlock roster={roster} encounterPath={doc.id} />
      ) : (
        <p className="npc-empty">// SEM BLOCO COMBAT-MARKER NESTA NOTA</p>
      )}
      {mestre ? (
        <div className="combate-actions">
          <Link to="/npcs?tab=combate" className="combate-novo-link">
            + Criar novo combate
          </Link>
        </div>
      ) : null}
      <DocRuleElements doc={doc} />
    </section>
  )
}

// ─────────────────────── grade de combates de uma pasta ───────────────────────

/** Cartão de um combate na grade: nome + barrinhas de dificuldade + resumo do
 *  roster. `total` (pontos de monstro) vai no data-attr pra ordenação/teste. */
function CombateCard({
  entry,
  doc,
  roster,
  byLevel,
  total,
}: {
  entry: IndexDocEntry
  doc: VaultDoc | undefined
  roster: EncounterRoster
  byLevel: EncounterDifficultyByLevelEntry[]
  total: number
}) {
  const entries = roster.entries
  return (
    <Link to={docPath(entry.id)} className="combat-grid-cell" data-enc-dif={total}>
      <span className="combat-card-name">{entry.basename ?? entry.id}</span>
      {/* barrinhas de dificuldade por nível — as mesmas que aparecem ao abrir */}
      {byLevel.length ? <EncounterLevelBar byLevel={byLevel} /> : null}
      {entries.length ? (
        <ul className="combat-card-roster">
          {entries.map((e, i) => (
            <li key={`${e.label}-${i}`}>
              {e.qty}× {e.label}
            </li>
          ))}
        </ul>
      ) : (
        <span className="combat-card-empty">{doc ? '// sem roster' : '…'}</span>
      )}
    </Link>
  )
}

/** Grade de combates de uma pasta (folha Campanhas/Combates). Cada carta mostra
 *  as barrinhas de dificuldade e a lista vem ordenada do mais fácil pro mais
 *  difícil (pontos dos monstros). Reusa o pipeline roster→combatentes→dificuldade
 *  do CombatMarkerBlock (rosterMonsterIds + resolveRosterEntries + combatantsFrom
 *  + computeEncounterDifficultyByLevel) — nada reimplementado. */
export function CombateGrid({ entries }: { entries: IndexDocEntry[] }) {
  const { mestre } = useSettings()
  const catalog = useCatalog()
  const docs = useDocs(entries.map((e) => e.id))

  // rosters parseados por combate
  const rosters = useMemo(
    () =>
      entries.map((entry) => {
        const doc = docs?.get(entry.id)
        const parsed = doc ? parseCombatMarkerBlocks(doc.body) : null
        const roster: EncounterRoster = parsed?.ok ? parsed.roster : { entries: [] }
        return { entry, doc, roster }
      }),
    [entries, docs],
  )
  // união dos ids de monstro de TODOS os combates → 1 só useDocs
  const monsterIds = useMemo(
    () => [...new Set(rosters.flatMap((r) => rosterMonsterIds(r.roster, catalog)))],
    [rosters, catalog],
  )
  const monsterDocs = useDocs(monsterIds)
  // dificuldade por combate + ordenação fácil→difícil (empate por nome)
  const cards = useMemo(
    () =>
      rosters
        .map((r) => {
          const resolvidas = resolveRosterEntries(r.roster, catalog, monsterDocs)
          const combatants = combatantsFrom(
            resolvidas.flatMap((x) => (x.item ? [x.item] : [])),
            [],
          )
          const byLevel = computeEncounterDifficultyByLevel(combatants)
          const total = byLevel[0]?.monsterTotal ?? 0
          return { ...r, byLevel, total }
        })
        .sort(
          (a, b) =>
            a.total - b.total ||
            (a.doc?.basename ?? a.entry.id).localeCompare(b.doc?.basename ?? b.entry.id, 'pt-BR'),
        ),
    [rosters, catalog, monsterDocs],
  )

  return (
    <div className="combat-grid-wrap">
      {mestre ? (
        <div className="combate-actions">
          <Link to="/npcs?tab=combate" className="combate-novo-link">
            + Criar novo combate
          </Link>
        </div>
      ) : null}
      {entries.length ? (
        <div className="combat-grid">
          {cards.map((c) => (
            <CombateCard
              key={c.entry.id}
              entry={c.entry}
              doc={c.doc}
              roster={c.roster}
              byLevel={c.byLevel}
              total={c.total}
            />
          ))}
        </div>
      ) : (
        <p className="npc-empty">// NENHUM COMBATE</p>
      )}
    </div>
  )
}

// ─────────────────────────── registro (side-effect) ───────────────────────────

registerDocView({
  id: 'combate',
  match: isCombate,
  view: (doc) => <CombateSheet doc={doc} />,
})

// FolderView: pasta homogênea de `type: Combate` vira grade de combates.
registerLeafView({ type: COMBATE_CATEGORY, view: (entries) => <CombateGrid entries={entries} /> })
