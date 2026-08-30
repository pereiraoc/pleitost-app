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
import { useMemo, useState } from 'react'
import { reskinName } from '../../data/reskin'
import { Link } from 'react-router-dom'
import type { Catalog } from '../../data/catalog'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useAssetIndex, type AssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { useLiveSession } from '../../data/session-repo/live-session'
import { docPath, compendiumFolderPath } from '../../paths'
import { useSettings } from '../../settings'
import { parseCombatMarkerBlocks } from '../../mestre/combat-marker'
import { CombatMarkerBlock } from '../../mestre/CombatMarkerBlock'
import { combatantsFrom, resolveRosterEntries, rosterMonsterIds } from '../../mestre/roster'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  type EncounterDifficultyByLevelEntry,
} from '../../mestre/encounter-compute'
import type { EncounterRoster, EncounterRosterEntry } from '../../data/session-repo/contract'
import { EncounterLevelBar, DifficultyBadge } from '../mestre/ui'
import { CriadorCombate } from '../mestre/CriadorCombate'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { registerDocView } from './doc-view-registry'
import { registerLeafView } from './leaf-view-registry'
import { DocRuleElements } from './RuleElements'

/** #397: afixo de criação de combate DENTRO da folha Campanhas/Combates —
 *  o usuário pediu que "criar combate" viva aqui, não em Criaturas. Botão
 *  expande o Criador de Combate (mestre-gated pelo próprio componente). */
function CriadorCombateAfixo() {
  const { mestre } = useSettings()
  const [open, setOpen] = useState(false)
  if (!mestre) return null
  return (
    <div className="combate-actions">
      <button
        type="button"
        className="combate-novo-link"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '× Fechar criador' : '+ Criar novo combate'}
      </button>
      {open ? <CriadorCombate /> : null}
    </div>
  )
}

/** #399: doc (real ou sintético) de uma linha do roster, pra resolver o avatar
 *  da criatura por creatureImageUrl (nome → raça → classe → emoji). Genérico
 *  (sourcePath null) vira um doc mínimo com a Raça/Classe persistidas (#389/#395). */
function docForRosterEntry(
  entry: EncounterRosterEntry,
  catalog: Catalog,
  monsterDocs: Map<string, VaultDoc> | undefined,
): VaultDoc | null {
  if (entry.sourcePath) {
    const res = catalog.resolve(entry.sourcePath)
    return res.kind === 'doc' ? (monsterDocs?.get(res.id) ?? null) : null
  }
  return {
    id: `generico:${entry.label}`,
    basename: entry.label,
    subtype: 'Monstro',
    frontmatter: {
      subcategoria: 'Monstro',
      ...(entry.raca ? { Raça: `[[${entry.raca}]]` } : {}),
      ...(entry.classe ? { Classe: `[[${entry.classe}]]` } : {}),
    },
  } as unknown as VaultDoc
}

/** #399: avatar de uma criatura do roster — imagem (nome→raça→classe) ou o
 *  emoji 🐲 de fallback (a criatura não tem retrato nem imagem de raça). */
function RosterAvatar({ doc, assets }: { doc: VaultDoc | null; assets: AssetIndex | undefined }) {
  const src = doc ? creatureImageUrl(doc, assets, true) : null
  return (
    <span className="combat-roster-avatar" aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="combat-roster-emoji">🐲</span>}
    </span>
  )
}

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
        <h1>{reskinName(doc.basename)}</h1>
        <span className="doc-type">{COMBATE_CATEGORY}</span>
      </header>
      {roster.entries.length ? (
        <CombatMarkerBlock roster={roster} encounterPath={doc.id} />
      ) : (
        <p className="npc-empty">// SEM BLOCO COMBAT-MARKER NESTA NOTA</p>
      )}
      {/* #397: criar combate mora na folha Campanhas/Combates (afixo do
          FolderView); a página de um combate só linka de volta pra lista. */}
      {mestre ? (
        <div className="combate-actions">
          <Link to={compendiumFolderPath('Campanhas/Combates')} className="combate-novo-link">
            ← Todos os combates
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
  catalog,
  monsterDocs,
  assets,
  mesaBadge,
}: {
  entry: IndexDocEntry
  doc: VaultDoc | undefined
  roster: EncounterRoster
  byLevel: EncounterDifficultyByLevelEntry[]
  total: number
  catalog: Catalog
  monsterDocs: Map<string, VaultDoc> | undefined
  assets: AssetIndex | undefined
  /** #398: dificuldade pra mesa ativa (quando o filtro está ligado). */
  mesaBadge: { ratio: number; meta: ReturnType<typeof computeEncounterDifficulty> } | null
}) {
  const entries = roster.entries
  return (
    <Link to={docPath(entry.id)} className="combat-grid-cell" data-enc-dif={total}>
      <span className="combat-card-name">{entry.basename ?? entry.id}</span>
      {/* #398: com a mesa ativa selecionada, mostra a dificuldade REAL pro grupo
          da sessão; senão, as barrinhas por nível (o padrão). */}
      {mesaBadge ? (
        <DifficultyBadge meta={mesaBadge.meta} ratio={mesaBadge.ratio} />
      ) : byLevel.length ? (
        <EncounterLevelBar byLevel={byLevel} />
      ) : null}
      {entries.length ? (
        <ul className="combat-card-roster">
          {entries.map((e, i) => (
            <li key={`${e.label}-${i}`}>
              {/* #399: avatar da criatura (imagem por nome→raça→classe, senão emoji) */}
              <RosterAvatar doc={docForRosterEntry(e, catalog, monsterDocs)} assets={assets} />
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
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const live = useLiveSession()
  const docs = useDocs(entries.map((e) => e.id))

  // #398: níveis dos heróis da mesa VIVA (só heróis pontuam, regra do sync).
  const sessionHeroLevels = useMemo(
    () =>
      (live?.characters ?? [])
        .filter((c) => c.kind === 'heroi')
        .map((c) => c.summary.nivel)
        .filter((n): n is number => typeof n === 'number' && n > 0),
    [live],
  )
  // #398: filtro "dificuldade pra mesa atual" — só faz sentido com sessão viva.
  const [filtrarMesa, setFiltrarMesa] = useState(false)
  const usarMesa = filtrarMesa && sessionHeroLevels.length > 0

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
  // dificuldade por combate + ordenação fácil→difícil. Com o filtro da mesa
  // ligado, a ordem/rótulo passam a ser a dificuldade REAL pro grupo da sessão
  // (ratio); senão, pelos pontos absolutos de monstro (total).
  const cards = useMemo(
    () =>
      rosters
        .map((r) => {
          const resolvidas = resolveRosterEntries(r.roster, catalog, monsterDocs)
          const items = resolvidas.flatMap((x) => (x.item ? [x.item] : []))
          const byLevel = computeEncounterDifficultyByLevel(combatantsFrom(items, []))
          const total = byLevel[0]?.monsterTotal ?? 0
          const mesa = usarMesa
            ? computeEncounterDifficulty(combatantsFrom(items, sessionHeroLevels))
            : null
          return { ...r, byLevel, total, mesa }
        })
        .sort((a, b) => {
          const key = usarMesa
            ? (a.mesa!.ratio - b.mesa!.ratio)
            : (a.total - b.total)
          return (
            key ||
            (a.doc?.basename ?? a.entry.id).localeCompare(b.doc?.basename ?? b.entry.id, 'pt-BR')
          )
        }),
    [rosters, catalog, monsterDocs, usarMesa, sessionHeroLevels],
  )

  return (
    <div className="combat-grid-wrap">
      {/* #397: a criação vive no afixo do FolderView (creator), não mais num
          link pra Criaturas. */}
      {/* #398: filtro pela mesa ativa — reordena e rotula a dificuldade pro
          grupo da sessão. Só aparece com heróis na sala. */}
      {sessionHeroLevels.length > 0 ? (
        <label className="combat-mesa-filter">
          <input
            type="checkbox"
            aria-label="Dificuldade para a mesa atual"
            checked={filtrarMesa}
            onChange={(e) => setFiltrarMesa(e.target.checked)}
          />
          <span>
            Dificuldade para a mesa atual ({sessionHeroLevels.length} herói
            {sessionHeroLevels.length === 1 ? '' : 's'})
          </span>
        </label>
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
              catalog={catalog}
              monsterDocs={monsterDocs}
              assets={assets}
              mesaBadge={c.mesa ? { ratio: c.mesa.ratio, meta: c.mesa } : null}
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
// #397: o afixo de criação (Criador de Combate, mestre-gated) mora aqui agora.
registerLeafView({
  type: COMBATE_CATEGORY,
  view: (entries) => <CombateGrid entries={entries} />,
  creator: () => <CriadorCombateAfixo />,
})
