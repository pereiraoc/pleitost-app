// Editor de TEXTO (corpo markdown) no Modo Desenvolvedor (#253, F9). Do pedido
// AS-IS: "edição dos textos/FM das views (Atlas/Aventuras/Histórias/etc.)".
// Edita o `body` cru → RASCUNHO LOCAL (até publicar), com PREVIEW ao vivo pelo
// MESMO MarkdownBody que as views usam (wikilinks/inline fields/dataview). Geral
// pra qualquer doc — montado no slot dev universal (DocRuleElements).
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import {
  setLocalDraft,
  clearLocalDraftField,
  localDraftFor,
  useLocalDraftVersion,
} from '../../data/local-draft-store'

const boxStyle: CSSProperties = {
  marginTop: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '12px 14px',
  background: 'var(--panel)',
  border: '1px dashed color-mix(in srgb,var(--accent) 45%,var(--line2))',
  clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))',
}

const textareaStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  lineHeight: 1.5,
  padding: '8px 10px',
  minHeight: 160,
  background: 'var(--card)',
  color: 'var(--text)',
  border: '1px solid var(--line2)',
  resize: 'vertical',
}

const btn: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.04em',
  padding: '5px 12px',
  border: '1px solid var(--line2)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
}

export function DocContentEditor({ doc }: { doc: VaultDoc }) {
  useLocalDraftVersion() // re-render ao salvar/reverter
  const seed = doc.body ?? ''
  const [body, setBody] = useState(seed)

  // Re-semeia quando o corpo EFETIVO muda por fora (revert/publish); durante a
  // digitação o doc não muda, então não atrapalha.
  useEffect(() => setBody(seed), [doc.id, seed])

  const dirty = body !== seed
  const draft = localDraftFor(doc.id)
  const hasBodyDraft = draft?.body !== undefined
  // Preview ao vivo com o MESMO renderer das views (o rascunho ainda não salvo).
  const previewDoc = useMemo<VaultDoc>(() => ({ ...doc, body }), [doc, body])

  return (
    <section data-content-editor="" style={boxStyle}>
      <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{'// EDITAR TEXTO'}</span>
        <span style={{ color: 'var(--accent)', fontSize: 9 }}>MODO DEV</span>
        <span style={{ flex: 1 }} />
        {dirty ? <span style={{ color: 'var(--muted)', fontSize: 10 }}>alterado (não salvo)</span> : null}
      </div>

      <textarea
        data-content-body=""
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={textareaStyle}
        spellCheck={false}
      />

      <div className="kicker" style={{ fontSize: 9 }}>
        {'// PREVIEW'}
      </div>
      <div data-content-preview="" className="doc-reading-body" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
        <MarkdownBody doc={previewDoc} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 10, color: 'var(--muted)' }}>
          Rascunho LOCAL — só você vê até publicar.
        </span>
        {hasBodyDraft ? (
          <button type="button" onClick={() => clearLocalDraftField(doc.id, 'body')} style={btn}>
            Reverter texto
          </button>
        ) : null}
        <button
          type="button"
          data-save-content
          onClick={() => setLocalDraft(doc.id, { body })}
          disabled={!dirty}
          style={{
            ...btn,
            borderColor: 'var(--accent)',
            color: dirty ? 'var(--accent)' : 'var(--muted)',
            cursor: dirty ? 'pointer' : 'not-allowed',
            opacity: dirty ? 1 : 0.5,
          }}
        >
          Salvar texto
        </button>
      </div>
    </section>
  )
}
