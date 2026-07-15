import type { CSSProperties, ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { DocRuleElements } from './RuleElements'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { clip } from '../ficha/bits'

// Visualizador de ORGANIZAÇÃO (issue #247, F3 do épico #243) — substitui o
// markdown genérico (template Dataview) por uma leitura BONITA das infos da
// organização na linguagem visual do app (kicker mono, painéis cortados,
// tokens). Só LEITURA — a edição fica pro modo desenvolvedor (fase futura).
//
// Registrado no barrel register-doc-views.tsx; NÃO toca o DocView nem as
// outras views.

/** Categoria que dispara esta view. `doc.type` espelha `frontmatter.categoria`
 *  (extractor/parse-doc.mjs), então checar `type` é checar a categoria. */
export const ORG_CATEGORY = 'Organização'

export function isOrg(doc: VaultDoc): boolean {
  return doc.type === ORG_CATEGORY
}

/** Campos exibíveis da organização, na ordem de exibição (FONTE DE VERDADE do
 *  schema — os rótulos são declarados aqui, nunca inventados no render). Cada
 *  entrada lê frontmatter[key]; ausentes/vazios são omitidos. `resumo` recebe
 *  destaque (subtítulo), o resto vira linha de campo. */
interface OrgField {
  key: string
  label: string
}

/** Resumo é o subtítulo/lead da organização (destaque acima dos campos). */
const RESUMO_KEY = 'Resumo'

/** Demais campos, em linhas rotuladas. */
const ORG_FIELDS: OrgField[] = [
  { key: 'Líder', label: 'Líder' },
  { key: 'Objetivo_de_Longo_Prazo', label: 'Objetivo de Longo Prazo' },
  { key: 'Objetivo_Imediato', label: 'Objetivo Imediato' },
  { key: 'Influência', label: 'Influência' },
  { key: 'Descrição', label: 'Descrição' },
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

/** Empty state sóbrio (mono, borda tracejada) — quando nada está preenchido. */
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

/** Card de um campo (rótulo mono acima, valor em corpo). */
function FieldCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--body)', fontSize: 15, lineHeight: 1.5 }}>{children}</span>
    </div>
  )
}

export function OrgView({
  doc,
  sidebar,
  embedded,
}: {
  doc: VaultDoc
  sidebar?: boolean
  embedded?: boolean
}) {
  const img = doc.images.find((i) => i.from.startsWith('frontmatter:')) ?? doc.images[0]
  const resumo = fieldText(doc.frontmatter[RESUMO_KEY])

  const cards: ReactNode[] = []
  for (const field of ORG_FIELDS) {
    const text = fieldText(doc.frontmatter[field.key])
    if (text == null) continue
    cards.push(
      <FieldCard key={field.key} label={field.label}>
        <InlineFieldValue value={text} />
      </FieldCard>,
    )
  }

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      {img ? <VaultImage target={img.target} style={HERO_STYLE} zoom /> : null}
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        <span className="doc-type">
          {ORG_CATEGORY}
          {doc.subtype ? ` · ${doc.subtype}` : ''}
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

      {cards.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
            gap: 12,
          }}
        >
          {cards}
        </div>
      ) : resumo ? null : (
        <EmptyPanel>{'// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS'}</EmptyPanel>
      )}

      <DocRuleElements doc={doc} />
    </article>
  )
}
