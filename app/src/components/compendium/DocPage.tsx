import { useParams } from 'react-router-dom'
import { useDoc } from '../../data/useDoc'

export function DocPage() {
  const id = useParams()['*'] ?? ''
  const { doc, error } = useDoc(id)

  if (error) return <p role="alert">Falha ao carregar o doc: {error.message}</p>
  if (!doc) return <p className="loading">Carregando…</p>

  return (
    <article className="doc-page">
      <h1>{doc.basename}</h1>
      {/* render markdown completo entra no próximo commit */}
      <pre className="doc-body-raw">{doc.body}</pre>
    </article>
  )
}
