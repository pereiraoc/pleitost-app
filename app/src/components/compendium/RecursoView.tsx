// Visualizador de RECURSO (2026-09-07) — nota de transporte/moradia/
// alimentação do mundo (Contexto/Recursos). O corpo da nota é o template
// (tag #Recurso + callout `= this.X`) + um parágrafo de descrição + o callout
// literal "Especificação". Mesmo padrão da PessoaView: campos do FM como
// cards (rótulos declarados no schema abaixo), descrição em prosa e a
// especificação (calloutTemplateFields) em cards — nada de template cru.
import type { CSSProperties, ReactNode } from 'react'
import { reskinName } from '../../data/reskin'
import type { VaultDoc } from '../../data/types'
import { formatValorMoeda } from '../../data/moeda'
import { InlineFieldValue } from './InlineFieldValue'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { clip } from '../ficha/bits'
import { FieldBlock } from './FieldBlock'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { calloutTemplateFields } from './callout-template-fields'
import { RECURSO_TYPE, isRecursoDoc, parseRecurso } from '../../recursos/parse-recurso'

export function isRecurso(doc: VaultDoc): boolean {
  return isRecursoDoc(doc)
}

/** Rótulos dos campos do template de Recurso, na ordem de exibição (FONTE DE
 *  VERDADE do schema da view — o FM guarda `Preço`, `Marca`… com estes nomes). */
const RECURSO_FIELDS: { key: string; label: string; moeda?: boolean; sufixo?: string }[] = [
  { key: 'Tipo', label: 'Tipo' },
  { key: 'Marca', label: 'Marca' },
  { key: 'Preço', label: 'Preço', moeda: true },
  { key: 'Usado', label: 'Usado', moeda: true },
  { key: 'Compra', label: 'Compra', moeda: true },
  { key: 'Manutenção', label: 'Manutenção', moeda: true, sufixo: ' por mês' },
  { key: 'Nível', label: 'Nível' },
  { key: 'Onde', label: 'Onde' },
]

function fieldText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map(fieldText).filter((s): s is string => s !== null)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

/** Corpo sem a tag e sem os callouts (o template e a Especificação viram cards). */
function prosaDoCorpo(body: string): string {
  return body
    .split('\n')
    .filter((l) => !/^\s*#Recurso\s*$/.test(l) && !/^\s*>/.test(l))
    .join('\n')
    .trim()
}

const PANEL: CSSProperties = {
  padding: '14px 16px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
}

export function RecursoView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  const rec = parseRecurso(doc)
  const fm = doc.frontmatter
  const resumo = fieldText(fm['Resumo'])
  const cobranca = fieldText(fm['Cobrança'])

  const cards: ReactNode[] = []
  const rotulosExibidos = new Set<string>(['resumo', 'cobrança'])
  for (const f of RECURSO_FIELDS) {
    const raw = fm[f.key]
    const text = fieldText(raw)
    if (text == null) continue
    rotulosExibidos.add(f.label.toLowerCase())
    const valor =
      f.moeda && typeof raw === 'number'
        ? `${formatValorMoeda(raw)}${f.key === 'Preço' && cobranca ? ` · ${cobranca}` : ''}${f.sufixo ?? ''}`
        : text
    cards.push(
      <FieldBlock key={f.key} label={f.label}>
        <InlineFieldValue value={valor} />
      </FieldBlock>,
    )
  }
  const espec = calloutTemplateFields(doc.body, rotulosExibidos)
  const prosa = prosaDoCorpo(doc.body)

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      <header className="doc-header">
        <h1>{reskinName(doc.basename)}</h1>
        <span className="doc-type">
          {RECURSO_TYPE}
          {rec?.aba ?? doc.subtype ? ` · ${rec?.aba ?? doc.subtype}` : ''}
        </span>
      </header>

      {resumo ? (
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 17,
            lineHeight: 1.6,
            color: 'var(--muted)',
            fontStyle: 'italic',
            margin: '2px 0 6px',
          }}
        >
          <InlineFieldValue value={resumo} />
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '46rem' }}>
        {cards}
        {prosa ? (
          <div style={PANEL}>
            <MarkdownBody doc={{ ...doc, body: prosa }} />
          </div>
        ) : null}
        {espec.length ? (
          <section>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '.16em',
                color: 'var(--muted)',
                margin: '0 0 9px',
              }}
            >
              {'// ESPECIFICAÇÃO'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {espec.map((f) => (
                <FieldBlock key={`espec:${f.label}`} label={f.label}>
                  {f.value.includes('\n') ? (
                    <MarkdownBody doc={{ ...doc, body: f.value }} />
                  ) : (
                    <InlineFieldValue value={f.value} />
                  )}
                </FieldBlock>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  )
}
