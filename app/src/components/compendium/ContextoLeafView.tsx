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

/** Remove da nota de Contexto o TEMPLATE da vault que só re-declara o FM: a
 *  linha-tag `#Contexto` (tag do Obsidian, viraria heading) e o callout
 *  `> [!quote] Contexto …` cujas linhas de conteúdo são só referências
 *  `= this.X` — na linha do tempo, data e título já são o frame da entrada.
 *  Prosa REAL (quotes/bullets/headings próprios) fica intacta. */
function semTemplate(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (/^#[^\s#]\S*\s*$/.test(line)) {
      i++
      continue
    }
    if (/^>\s*\[!quote\]\s*Contexto/i.test(line)) {
      let j = i + 1
      let soTemplate = true
      while (j < lines.length && /^>/.test(lines[j]!)) {
        const conteudo = lines[j]!.replace(/^>\s*/, '').trim()
        if (conteudo !== '' && !conteudo.includes('= this.')) {
          soTemplate = false
          break
        }
        j++
      }
      if (soTemplate) {
        i = j
        continue
      }
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

/** Corpo exibido na entrada da linha do tempo: a prosa REAL da nota (sem o
 *  template), senão a `Descrição` do FM (wikilinks resolvem no markdown),
 *  senão nada — data + título bastam. */
function acontecimento(doc: VaultDoc): string {
  const corpo = semTemplate(doc.body).trim()
  if (corpo !== '') return corpo
  const desc = doc.frontmatter['Descrição']
  return typeof desc === 'string' ? desc.trim() : ''
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
          const corpo = doc ? acontecimento(doc) : ''
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
