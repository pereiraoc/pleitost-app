import { useParams, useNavigate } from 'react-router-dom'
import { useDoc } from '../../data/useDoc'
import type { VaultDoc } from '../../data/types'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { InlineFieldValue } from './InlineFieldValue'
import { InlineFieldsTable } from './InlineFieldsTable'
import { VaultImage } from './VaultImage'
import { resolveDocView } from './doc-view-registry'
import './register-doc-views'
import { DocRuleElements } from './RuleElements'
import { compendioKicker } from '../layout/design-nav'

/** Renderiza um doc já carregado (separado do fetch pra ser testável).
 *  `sidebar`: renderizado na sidebar de DETALHES (esconde a aba Hexploração). */
export function DocView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  // Visualizador dedicado do tipo (registro), senão o markdown genérico.
  const viewer = resolveDocView(doc)
  if (viewer) return viewer(doc, { sidebar, embedded })

  const grupos = doc.grupo ? (Array.isArray(doc.grupo) ? doc.grupo : [doc.grupo]) : []
  const hero = doc.images.find((img) => img.from.startsWith('frontmatter:'))

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {embedded ? null : <div className="kicker">{compendioKicker(doc.type)}</div>}
      {hero ? <VaultImage target={hero.target} className="doc-hero" zoom /> : null}
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        {/* Feedback do mestre: a categoria (doc.type) foi pro kicker; aqui fica
            só o subtype quando existe (ex.: "Arcana Negra"). */}
        {doc.subtype ? <span className="doc-type">{doc.subtype}</span> : null}
        {grupos.map((grupo) => (
          <span key={grupo} className="grupo-chip">
            <InlineFieldValue value={grupo} />
          </span>
        ))}
      </header>
      <InlineFieldsTable fields={doc.inlineFields} />
      <MarkdownBody doc={doc} heroTarget={hero?.target} />
      <DocRuleElements doc={doc} />
    </article>
  )
}

export function DocPage() {
  const id = useParams()['*'] ?? ''
  const { doc, error } = useDoc(id)
  const navigate = useNavigate()

  if (error) return <p role="alert">Falha ao carregar o doc: {error.message}</p>
  if (!doc) return <p className="loading">Carregando…</p>
  return (
    <div>
      {/* #bug1: botão de VOLTAR ao abrir um item/doc pela rota /doc — antes não
          havia como voltar pra página anterior. Volta no histórico do router. */}
      <button className="grupo-voltar" onClick={() => navigate(-1)}>
        ← VOLTAR
      </button>
      <DocView doc={doc} />
    </div>
  )
}
