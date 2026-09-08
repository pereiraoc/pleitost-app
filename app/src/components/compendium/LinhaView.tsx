// Visualizador de LINHA (2026-09-08) — nota da malha de transportes do mundo
// (Contexto/Malha de Transportes). Mesmo padrão da RecursoView: campos do FM
// como blocos verticais (rótulos = os nomes do template), paradas em lista
// numerada na ordem da nota, descrição em prosa, aparência (pra imagem) por
// último — nada de template cru.
import type { CSSProperties, ReactNode } from 'react'
import { reskinName } from '../../data/reskin'
import type { VaultDoc } from '../../data/types'
import { InlineFieldValue } from './InlineFieldValue'
import { COMPENDIO_KICKER } from '../layout/design-nav'
import { clip } from '../ficha/bits'
import { FieldBlock } from './FieldBlock'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { LINHA_TYPE, isLinhaDoc, parseLinha } from '../../transporte/parse-linha'

export function isLinha(doc: VaultDoc): boolean {
  return isLinhaDoc(doc)
}

/** Rótulos dos campos do template de Linha, na ordem de exibição (FONTE DE
 *  VERDADE do schema da view — o FM guarda `Letreiro`, `Operador`… com estes nomes). */
const LINHA_FIELDS: { key: string; label: string }[] = [
  { key: 'Letreiro', label: 'Letreiro' },
  { key: 'Operador', label: 'Operador' },
  { key: 'Acesso', label: 'Acesso' },
  { key: 'Tarifa', label: 'Tarifa' },
  { key: 'Horário', label: 'Horário' },
]

function fieldText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number') return String(value)
  return null
}

/** Corpo sem a tag e sem os callouts (o template e a Aparência viram blocos). */
function prosaDoCorpo(body: string): string {
  return body
    .split('\n')
    .filter((l) => !/^\s*#Linha\s*$/.test(l) && !/^\s*>/.test(l))
    .join('\n')
    .trim()
}

/** Qualidade 1..5 como estrelas — o número é o dado, as estrelas o desenho. */
export function estrelas(q: number): string {
  return '★'.repeat(q) + '☆'.repeat(Math.max(0, 5 - q))
}

const PANEL: CSSProperties = {
  padding: '14px 16px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
}

export function LinhaView({ doc, sidebar, embedded }: { doc: VaultDoc; sidebar?: boolean; embedded?: boolean }) {
  const linha = parseLinha(doc)
  const fm = doc.frontmatter
  const resumo = fieldText(fm['Resumo'])

  const cards: ReactNode[] = []
  for (const f of LINHA_FIELDS) {
    const text = fieldText(fm[f.key])
    if (text == null) continue
    cards.push(
      <FieldBlock key={f.key} label={f.label}>
        <InlineFieldValue value={text} />
      </FieldBlock>,
    )
  }
  const prosa = prosaDoCorpo(doc.body)

  return (
    <article className={embedded ? 'doc-page' : 'doc-page page'}>
      {sidebar || embedded ? null : <div className="kicker">{COMPENDIO_KICKER}</div>}
      <header className="doc-header">
        <h1>{reskinName(doc.basename)}</h1>
        <span className="doc-type">
          {LINHA_TYPE}
          {linha?.modo ? ` · ${linha.modo}` : ''}
        </span>
      </header>

      {resumo ? (
        <p style={{ fontFamily: 'var(--body)', fontSize: 17, lineHeight: 1.6, color: 'var(--muted)', fontStyle: 'italic', margin: '2px 0 6px' }}>
          <InlineFieldValue value={resumo} />
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '46rem' }}>
        {cards}
        {linha && linha.qualidade > 0 ? (
          <FieldBlock label="Qualidade">
            <span data-qualidade={linha.qualidade} style={{ letterSpacing: '.08em' }}>
              {estrelas(linha.qualidade)}
            </span>
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{`${linha.qualidade} de 5`}</span>
          </FieldBlock>
        ) : null}
        {linha && linha.paradas.length ? (
          <FieldBlock label={linha.circular ? 'Paradas (circular)' : 'Paradas'}>
            <ol data-paradas="" style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {linha.paradas.map((p, i) => (
                <li key={`${i}:${p}`}>
                  <InlineFieldValue value={`[[${p}]]`} />
                </li>
              ))}
            </ol>
          </FieldBlock>
        ) : null}
        {prosa ? (
          <div style={PANEL}>
            <MarkdownBody doc={{ ...doc, body: prosa }} />
          </div>
        ) : null}
        {linha?.aparencia ? (
          <FieldBlock label="Aparência">
            <InlineFieldValue value={linha.aparencia} />
          </FieldBlock>
        ) : null}
      </div>
    </article>
  )
}
