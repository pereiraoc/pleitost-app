import type { CSSProperties, ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { DocRuleElements } from './RuleElements'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { clip } from '../ficha/bits'
import { FieldBlock } from './FieldBlock'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { calloutTemplateFields } from './callout-template-fields'

// Visualizador de PESSOA (report 2026-08-29, Emílio Garrastazu Médici) — o
// corpo dessas notas é SÓ o template Dataview (tag #Pessoa + callout `= this.X`)
// e o markdown genérico vazava a tag e amassava os campos numa linha. Mesmo
// padrão do OrgView (#247): leitura bonita das infos do FM na linguagem visual
// do app; rótulos declarados no schema abaixo, campos vazios omitidos.
//
// Registrado no barrel register-doc-views.tsx; NÃO toca o DocView nem as
// outras views.

/** Categoria que dispara esta view (`doc.type` espelha `frontmatter.categoria`). */
export const PESSOA_CATEGORY = 'Pessoa'

export function isPessoa(doc: VaultDoc): boolean {
  return doc.type === PESSOA_CATEGORY
}

/** FUNÇÃO é o lead da pessoa (o template da vault a usa de subtítulo do
 *  callout: "`= this.Função`: `= this.file.name`"). */
const FUNCAO_KEY = 'Função'

/** Demais campos do template de Pessoa da vault, na ordem de exibição (FONTE
 *  DE VERDADE do schema — rótulos declarados aqui, nunca inventados no render). */
const PESSOA_FIELDS: { key: string; label: string }[] = [
  { key: 'Organização', label: 'Organização' },
  { key: 'Personalidade', label: 'Personalidade' },
  { key: 'Aparência', label: 'Aparência' },
  { key: 'Objetivo_de_Longo_Prazo', label: 'Objetivo de Longo Prazo' },
  { key: 'Objetivo_Imediato', label: 'Objetivo Imediato' },
]

/** Valor escalar exibível de um FM (string/número não-vazio) ou null. */
function fieldText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number') return String(value)
  return null
}

const HERO_STYLE: CSSProperties = {
  width: '100%',
  maxHeight: 320,
  objectFit: 'cover',
  display: 'block',
  border: '1px solid var(--line2)',
  clipPath: clip(14),
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: 44,
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.12em',
        color: 'var(--muted)',
        clipPath: clip(14),
      }}
    >
      {children}
    </div>
  )
}

export function PessoaView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  const img = doc.images.find((i) => i.from.startsWith('frontmatter:')) ?? doc.images[0]
  const funcao = fieldText(doc.frontmatter[FUNCAO_KEY])

  const cards: ReactNode[] = []
  const rotulosExibidos = new Set<string>([FUNCAO_KEY.toLowerCase()])
  for (const field of PESSOA_FIELDS) {
    const text = fieldText(doc.frontmatter[field.key])
    if (text == null) continue
    rotulosExibidos.add(field.label.toLowerCase())
    cards.push(
      <FieldBlock key={field.key} label={field.label}>
        <InlineFieldValue value={text} />
      </FieldBlock>,
    )
  }
  // Prosa literal no callout do corpo (template POA) → cards, como na OrgView.
  for (const f of calloutTemplateFields(doc.body, rotulosExibidos)) {
    cards.push(
      <FieldBlock key={`callout:${f.label}`} label={f.label}>
        {f.value.includes('\n') ? (
          <MarkdownBody doc={{ ...doc, body: f.value }} />
        ) : (
          <InlineFieldValue value={f.value} />
        )}
      </FieldBlock>,
    )
  }

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      {img ? <VaultImage target={img.target} style={HERO_STYLE} zoom /> : null}
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        <span className="doc-type">
          {PESSOA_CATEGORY}
          {doc.subtype ? ` · ${doc.subtype}` : ''}
        </span>
      </header>

      {funcao ? (
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
          <InlineFieldValue value={funcao} />
        </p>
      ) : null}

      {cards.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '46rem' }}>
          {cards}
        </div>
      ) : funcao ? null : (
        <EmptyPanel>{'// PESSOA SEM INFORMAÇÕES REGISTRADAS'}</EmptyPanel>
      )}

      <DocRuleElements doc={doc} />
    </article>
  )
}
