// Report 2026-08-29 (#519): a folha de notas de CONTEXTO não é mais a DocTable.
//   - Pasta cujas notas têm FM `Data` (Passado da POA) → LINHA DO TEMPO:
//     entradas ordenadas por data, com a data visível e o conteúdo já aberto.
//   - Sem datas → ÍNDICE EM BOTÕES (mesma linguagem visual dos cards de
//     subpasta), cada um abrindo a nota na HistoriaView.
// Registra por side-effect o leaf-view 'Contexto' (mesmo padrão do ItemView);
// o FolderView não conhece o tipo por nome.
import { Link } from 'react-router-dom'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { registerLeafView } from './leaf-view-registry'
import { HISTORIA_CATEGORY } from './HistoriaView'

function fmData(doc: VaultDoc | undefined): string | null {
  const raw = doc?.frontmatter['Data']
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/** '1968-12-13' → '13/12/1968' (só FORMATA o FM `Data`; datas fora do padrão
 *  ISO aparecem como estão — nada é inventado). */
function dataDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function ContextoFolha({ entries }: { entries: IndexDocEntry[] }) {
  const docs = useDocs(entries.map((e) => e.id))
  const dated = docs ? entries.filter((e) => fmData(docs.get(e.id))) : []

  if (docs && dated.length > 0) {
    // sort estável: com data → ordem cronológica; sem data → depois, na ordem
    // original da pasta
    const ordered = [...entries].sort((a, b) => {
      const da = fmData(docs.get(a.id))
      const db = fmData(docs.get(b.id))
      if (da && db) return da.localeCompare(db)
      return da ? -1 : db ? 1 : 0
    })
    return (
      <div className="ctx-timeline">
        {ordered.map((e) => {
          const doc = docs.get(e.id)
          const data = fmData(doc)
          return (
            <article key={e.id} className="ctx-tl-item">
              {data ? <span className="ctx-tl-date">{dataDisplay(data)}</span> : null}
              <h2 className="ctx-tl-title">{e.basename ?? e.id}</h2>
              {doc ? <MarkdownBody doc={doc} hideLeadingTitle /> : null}
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <div className="type-grid">
      {entries.map((e) => (
        <Link key={e.id} to={docPath(e.id)} className="type-card">
          <span className="type-card-name">{e.basename ?? e.id}</span>
        </Link>
      ))}
    </div>
  )
}

registerLeafView({
  type: HISTORIA_CATEGORY,
  view: (entries) => <ContextoFolha entries={entries} />,
})
