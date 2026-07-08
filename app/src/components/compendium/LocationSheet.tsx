import { useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { InlineFieldValue } from './InlineFieldValue'
import { VaultImage } from './VaultImage'
import { COMPENDIO_KICKER } from '../layout/design-nav'

// Ficha de Localização do compêndio (issue #66). Substitui o markdown genérico
// (DocView) por uma ficha com abas Detalhes/Comércio/Hexploração na linguagem
// visual do design (mono kicker, borda/clip cortado, aba ativa com underline
// accent — mesmo padrão dos grupoTabs/npcTabs). Comércio e Hexploração são
// fundação das próximas issues de hexcrawl (#72 loja, #67 mapa), aqui só
// scaffolding.

/** Categoria que dispara esta ficha. `doc.type` espelha `frontmatter.categoria`
 *  (extractor/parse-doc.mjs:57), então checar `type` é checar a categoria. */
export const LOCATION_CATEGORY = 'Localização'

export function isLocation(doc: VaultDoc): boolean {
  return doc.type === LOCATION_CATEGORY
}

/** clip-path de canto cortado do design (mesmo polígono de .type-card/.doc-hero). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

// ─────────────────────────── Aba Detalhes ───────────────────────────

/** Campos da aba Detalhes, na ordem de exibição (fonte de verdade do schema
 *  da ficha — os rótulos são declarados aqui, nunca inventados no render).
 *  `subtype` lê doc.subtype (= frontmatter.subcategoria); `text` lê
 *  frontmatter[key]; `recursos` lê a lista frontmatter.Recursos. Campos
 *  ausentes/vazios são omitidos. */
type DetailField =
  | { kind: 'subtype'; label: string }
  | { kind: 'text'; label: string; key: string }
  | { kind: 'recursos'; label: string }

const DETAIL_FIELDS: DetailField[] = [
  { kind: 'subtype', label: 'Tipo' },
  { kind: 'text', label: 'Descrição', key: 'Descrição' },
  { kind: 'recursos', label: 'Recursos' },
  { kind: 'text', label: 'Geolocalização', key: 'Geolocalização' },
  { kind: 'text', label: 'Contexto', key: 'Contexto' },
  { kind: 'text', label: 'Organizações Influentes', key: 'Organizações_Influentes' },
  { kind: 'text', label: 'Acontecimento Recente', key: 'Acontecimento_Recente' },
]

/** Valor escalar exibível de um FM (string/número/boolean não-vazio) ou null. */
function fieldText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/** Itens não-vazios da lista Recursos (wikilinks ou strings simples). */
function locationRecursos(doc: VaultDoc): string[] {
  const raw = doc.frontmatter['Recursos']
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
}

const HERO_STYLE: CSSProperties = {
  width: '100%',
  maxHeight: 340,
  objectFit: 'cover',
  display: 'block',
  border: '1px solid var(--line2)',
  clipPath: clip(14),
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  )
}

function DetalhesTab({ doc }: { doc: VaultDoc }) {
  const img = doc.images.find((i) => i.from === 'body') ?? doc.images[0]
  const recursos = locationRecursos(doc)

  const rows: ReactNode[] = []
  for (const field of DETAIL_FIELDS) {
    if (field.kind === 'subtype') {
      const tipo = fieldText(doc.subtype)
      if (tipo) rows.push(<DetailRow key="Tipo" label={field.label}>{tipo}</DetailRow>)
    } else if (field.kind === 'recursos') {
      if (recursos.length) {
        rows.push(
          <DetailRow key="Recursos" label={field.label}>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {recursos.map((r, i) => (
                <span key={i}>
                  <InlineFieldValue value={r} />
                </span>
              ))}
            </span>
          </DetailRow>,
        )
      }
    } else {
      const text = fieldText(doc.frontmatter[field.key])
      if (text != null) {
        rows.push(
          <DetailRow key={field.key} label={field.label}>
            <InlineFieldValue value={text} />
          </DetailRow>,
        )
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {img ? <VaultImage target={img.target} style={HERO_STYLE} /> : null}
      {rows.length ? (
        <table className="inline-fields">
          <tbody>{rows}</tbody>
        </table>
      ) : (
        <EmptyPanel>{'// SEM DETALHES REGISTRADOS'}</EmptyPanel>
      )}
    </div>
  )
}

// ───────────────────── Comércio / Hexploração (scaffold) ─────────────────────

/** Empty state sóbrio na linguagem do design (mono, borda tracejada, muted). */
function EmptyPanel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div
      style={{
        padding: 50,
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.12em',
        color: 'var(--muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        clipPath: clip(14),
      }}
    >
      <div>{children}</div>
      {note ? <div style={{ fontSize: 11, letterSpacing: '.06em', opacity: 0.8 }}>{note}</div> : null}
    </div>
  )
}

function ComercioTab() {
  // Scaffold: a lógica de loja é a issue #72. Placeholder sóbrio por ora.
  return <EmptyPanel note="Loja em breve.">{'// COMÉRCIO'}</EmptyPanel>
}

// ───────────────────────────── Abas ─────────────────────────────

interface LocTab {
  id: 'detalhes' | 'comercio' | 'hexploracao'
  label: string
  /** Predicado de habilitação; ausente = sempre habilitada. */
  enabled?: (doc: VaultDoc) => boolean
}

/** Stub da issue #67: a fonte do mapa de hexcrawl ainda não existe no FM, então
 *  nenhuma localização tem mapa configurado e a aba Hexploração fica
 *  desabilitada. Quando #67 definir o mapa, esta função passa a lê-lo (fonte de
 *  verdade única) e a aba habilita sozinha. */
export function locationHasHexMap(_doc: VaultDoc): boolean {
  return false
}

const HEX_DISABLED_NOTE =
  'Hexploração será habilitada quando esta localização tiver um mapa de hexcrawl configurado (issue #67).'

const LOCATION_TABS: LocTab[] = [
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'comercio', label: 'Comércio' },
  { id: 'hexploracao', label: 'Hexploração', enabled: locationHasHexMap },
]

export function LocationSheet({ doc }: { doc: VaultDoc }) {
  const [tab, setTab] = useState<LocTab['id']>('detalhes')

  return (
    <article className="doc-page page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <header className="doc-header">
        <h1>{doc.basename}</h1>
        <span className="doc-type">
          {LOCATION_CATEGORY}
          {doc.subtype ? ` · ${doc.subtype}` : ''}
        </span>
      </header>

      {/* Fila de abas — mesmo padrão dos grupoTabs (mono/underline accent) com a
          convenção :disabled existente (opacity .38, cursor default). */}
      <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {LOCATION_TABS.map((t) => {
          const enabled = t.enabled ? t.enabled(doc) : true
          const on = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              disabled={!enabled}
              title={!enabled && t.id === 'hexploracao' ? HEX_DISABLED_NOTE : undefined}
              onClick={() => enabled && setTab(t.id)}
              style={{
                padding: '11px 16px',
                background: on ? 'color-mix(in srgb,var(--accent) 7%,transparent)' : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                fontFamily: 'var(--body)',
                fontWeight: 600,
                letterSpacing: '.07em',
                fontSize: 12,
                color: on ? 'var(--accent)' : 'var(--muted)',
                cursor: enabled ? 'pointer' : 'default',
                opacity: enabled ? 1 : 0.38,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 4 }}>
        {tab === 'detalhes' ? <DetalhesTab doc={doc} /> : null}
        {tab === 'comercio' ? <ComercioTab /> : null}
      </div>
    </article>
  )
}
