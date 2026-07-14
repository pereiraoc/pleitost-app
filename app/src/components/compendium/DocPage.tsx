import { useParams } from 'react-router-dom'
import { useDoc } from '../../data/useDoc'
import type { VaultDoc } from '../../data/types'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { InlineFieldValue } from './InlineFieldValue'
import { InlineFieldsTable } from './InlineFieldsTable'
import { VaultImage } from './VaultImage'
import { LocationSheet, isLocation } from './LocationSheet'
import { registerDocView, resolveDocView } from './doc-view-registry'
import { RuleElementsSection } from './RuleElements'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { useSettings } from '../../settings'

// Localização (categoria=Localização) vira ficha com abas (issue #66) — a
// PRIMEIRA entrada do registro de visualizadores (#243). As fases F1/F3
// registram Item/Organização/História do mesmo jeito, em arquivos próprios.
registerDocView({
  id: 'localizacao',
  match: isLocation,
  view: (doc, { sidebar }) => <LocationSheet doc={doc} sidebar={sidebar} />,
})

/** Renderiza um doc já carregado (separado do fetch pra ser testável).
 *  `sidebar`: renderizado na sidebar de DETALHES (esconde a aba Hexploração). */
export function DocView({ doc, sidebar }: { doc: VaultDoc; sidebar?: boolean }) {
  // Modo Mestre: expõe os Elementos de Regra da nota depois do corpo (#193)
  const { mestre } = useSettings()
  // Visualizador dedicado do tipo (registro), senão o markdown genérico.
  const viewer = resolveDocView(doc)
  if (viewer) return viewer(doc, { sidebar })

  const grupos = doc.grupo ? (Array.isArray(doc.grupo) ? doc.grupo : [doc.grupo]) : []
  const hero = doc.images.find((img) => img.from.startsWith('frontmatter:'))

  return (
    <article className="doc-page page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      {hero ? <VaultImage target={hero.target} className="doc-hero" zoom /> : null}
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        {doc.type ? (
          <span className="doc-type">
            {doc.type}
            {doc.subtype ? ` · ${doc.subtype}` : ''}
          </span>
        ) : null}
        {grupos.map((grupo) => (
          <span key={grupo} className="grupo-chip">
            <InlineFieldValue value={grupo} />
          </span>
        ))}
      </header>
      <InlineFieldsTable fields={doc.inlineFields} />
      <MarkdownBody doc={doc} />
      {mestre && doc.ruleElements?.length ? (
        <RuleElementsSection elements={doc.ruleElements} />
      ) : null}
    </article>
  )
}

export function DocPage() {
  const id = useParams()['*'] ?? ''
  const { doc, error } = useDoc(id)

  if (error) return <p role="alert">Falha ao carregar o doc: {error.message}</p>
  if (!doc) return <p className="loading">Carregando…</p>
  return <DocView doc={doc} />
}
