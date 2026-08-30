import type { VaultDoc } from '../../data/types'
import { reskinName } from '../../data/reskin'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { VaultImage } from './VaultImage'
import { DocRuleElements } from './RuleElements'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { corpoContexto, dataDisplay, fmAssunto, fmData } from './contexto-template'

// Visualizador de HISTÓRIA / CONTEXTO (issue #247, F3 do épico #243) — docs de
// "Contexto Atual" e "Contexto Histórico". O corpo desses docs é markdown REAL
// (prosa da história, tabelas de dados), então reusamos o MarkdownBody
// existente e só cuidamos da TIPOGRAFIA DE LEITURA: coluna de leitura
// confortável, título e espaçamento agradáveis. Só LEITURA (edição é fase
// futura, modo desenvolvedor).
//
// Registrado no barrel register-doc-views.tsx; NÃO toca o DocView nem as
// outras views.

/** Categoria que dispara esta view. `doc.type` espelha `frontmatter.categoria`
 *  (extractor). "Contexto" cobre tanto Contexto Atual (subcategoria "Dados")
 *  quanto Contexto Histórico (subcategoria "Passado"). */
export const HISTORIA_CATEGORY = 'Contexto'

export function isHistoria(doc: VaultDoc): boolean {
  return doc.type === HISTORIA_CATEGORY
}

export function HistoriaView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  const hero = doc.images.find((img) => img.from.startsWith('frontmatter:'))
  // Report 2026-08-30: o corpo passa pelo strip do TEMPLATE da vault — o
  // callout `> [!quote] Contexto …` só re-declara o FM e vazava na página
  // como "Contexto Atual ❔". Assunto/Data viram o lead do header.
  const assunto = fmAssunto(doc)
  const data = fmData(doc)
  const corpo = corpoContexto(doc)

  return (
    <article className={embedded ? 'doc-page doc-reading' : 'doc-page doc-reading page'}>
      {sidebar || embedded ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      {hero ? <VaultImage target={hero.target} className="doc-hero" zoom /> : null}
      <header className="doc-header">
        <h1>{reskinName(doc.basename)}</h1>
        {doc.type ? (
          <span className="doc-type">
            {doc.type}
            {doc.subtype ? ` · ${doc.subtype}` : ''}
            {data ? ` · ${dataDisplay(data)}` : ''}
          </span>
        ) : null}
        {assunto ? <p className="doc-lead">{assunto}</p> : null}
      </header>
      <div className="doc-reading-body">
        <MarkdownBody doc={{ ...doc, body: corpo }} hideLeadingTitle />
      </div>
      <DocRuleElements doc={doc} />
    </article>
  )
}
