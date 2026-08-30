// Report 2026-08-29 (#519): a folha de notas de CONTEXTO não é mais a DocTable.
//   - Pasta cujas notas têm FM `Data` (Passado da POA) → LINHA DO TEMPO:
//     entradas ordenadas por data, com a data visível e o conteúdo já aberto.
//   - Sem datas (Atualidade) → CARDS EMPILHADOS EXPANSÍVEIS (report
//     2026-08-30): um card horizontal por nota (título + Assunto do FM),
//     clicável pra expandir o corpo ALI MESMO — sem navegar. Link discreto
//     abre a página cheia.
// Registra por side-effect o leaf-view 'Contexto' (mesmo padrão do ItemView);
// o FolderView não conhece o tipo por nome.
import { Link } from 'react-router-dom'
import type { IndexDocEntry } from '../../data/types'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { registerLeafView } from './leaf-view-registry'
import { HISTORIA_CATEGORY } from './HistoriaView'
import { corpoContexto, dataDisplay, fmAssunto, fmData } from './contexto-template'

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
          const corpo = doc ? corpoContexto(doc) : ''
          return (
            <article key={e.id} className="ctx-tl-item">
              {data ? <span className="ctx-tl-date">{dataDisplay(data)}</span> : null}
              <h2 className="ctx-tl-title">{e.basename ?? e.id}</h2>
              {doc && corpo !== '' ? (
                <div className="ctx-tl-body">
                  <MarkdownBody doc={{ ...doc, body: corpo }} hideLeadingTitle />
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    )
  }

  // Atualidade: pilha vertical de cards expansíveis — <details> nativo
  // (acessível, sem estado JS). Corpo renderiza dentro do próprio card.
  return (
    <div className="ctx-stack">
      {entries.map((e) => {
        const doc = docs?.get(e.id)
        const assunto = fmAssunto(doc)
        const corpo = doc ? corpoContexto(doc) : ''
        return (
          <details key={e.id} className="ctx-acc">
            <summary className="ctx-acc-head">
              <span className="ctx-acc-title">{e.basename ?? e.id}</span>
              {assunto ? <span className="ctx-acc-assunto">{assunto}</span> : null}
            </summary>
            <div className="ctx-acc-body">
              {doc && corpo !== '' ? (
                <MarkdownBody doc={{ ...doc, body: corpo }} hideLeadingTitle />
              ) : (
                <p className="ctx-acc-vazio">Sem conteúdo ainda.</p>
              )}
              <Link className="ctx-acc-abrir" to={docPath(e.id)}>
                abrir página →
              </Link>
            </div>
          </details>
        )
      })}
    </div>
  )
}

registerLeafView({
  type: HISTORIA_CATEGORY,
  view: (entries) => <ContextoFolha entries={entries} />,
})
