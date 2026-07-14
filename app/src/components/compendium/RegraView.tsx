// VISUALIZADOR de REGRA (#246, F2 do épico #243) — docs de Sistema/Regras.
// Pedido AS-IS: "mostrar as regras do sistema de forma amigável e bonita".
// O corpo é markdown/prosa (com wikilinks, tabelas), então reusamos o
// MarkdownBody dentro da mesma coluna de leitura confortável do #247
// (.doc-reading-body). Os Elementos de Regra (quando houver) vão no fim,
// gated pelo Modo Mestre — o visualizador dedicado é a fase F7.
//
// `type === 'Regra'` cobre Sistema/Regras E as folder-notes de Criação de
// Personagem (Técnicas/Habilidades/…, que são páginas-índice dataview) — a
// coluna de leitura renderiza ambas bem (o MarkdownBody avalia o dataview).
import type { VaultDoc } from '../../data/types'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { RuleElementsSection } from './RuleElements'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { useSettings } from '../../settings'

export function isRegra(doc: VaultDoc): boolean {
  return doc.type === 'Regra'
}

export function RegraView({ doc, sidebar }: { doc: VaultDoc; sidebar?: boolean }) {
  const { mestre } = useSettings()
  return (
    <article className="doc-page doc-reading page">
      {sidebar ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      <header className="doc-header">
        <h1>📕 {doc.basename}</h1>
        <span className="doc-type">Regra{doc.subtype ? ` · ${doc.subtype}` : ''}</span>
      </header>
      <div className="doc-reading-body">
        <MarkdownBody doc={doc} />
      </div>
      {mestre && doc.ruleElements?.length ? (
        <RuleElementsSection elements={doc.ruleElements} />
      ) : null}
    </article>
  )
}
