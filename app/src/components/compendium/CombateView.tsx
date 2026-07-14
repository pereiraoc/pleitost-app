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
import { Link } from 'react-router-dom'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { useSettings } from '../../settings'
import { parseCombatMarkerBlocks } from '../../mestre/combat-marker'
import { CombatMarkerBlock } from '../../mestre/CombatMarkerBlock'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { registerDocView } from './doc-view-registry'
import { registerLeafView } from './leaf-view-registry'

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
        <CombatMarkerBlock roster={roster} />
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
    </section>
  )
}

// ─────────────────────── grade de combates de uma pasta ───────────────────────

/** Cartão de um combate na grade: nome + resumo do roster (contagem por
 *  monstro), linkando pro doc. O resumo lê o roster do body (parse reusado). */
function CombateCard({ entry, doc }: { entry: IndexDocEntry; doc: VaultDoc | undefined }) {
  const parsed = doc ? parseCombatMarkerBlocks(doc.body) : null
  const entries = parsed?.ok ? parsed.roster.entries : []
  return (
    <Link to={docPath(entry.id)} className="combat-grid-cell">
      <span className="combat-card-name">{entry.basename ?? entry.id}</span>
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

/** Grade de combates de uma pasta (folha Campanhas/Combates). Cada carta linka
 *  pro doc e resume o roster. Em Modo Mestre, um botão pro Criador de Combate. */
export function CombateGrid({ entries }: { entries: IndexDocEntry[] }) {
  const { mestre } = useSettings()
  const docs = useDocs(entries.map((e) => e.id))
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
          {entries.map((entry) => (
            <CombateCard key={entry.id} entry={entry} doc={docs?.get(entry.id)} />
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
