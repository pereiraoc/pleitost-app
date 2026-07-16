// Editor in-place de Elementos de Regra no Modo Desenvolvedor (#253, F9). Do
// pedido AS-IS: "conseguir editar os elementos de regra por ali... pra garantir
// que eu consiga implementar mais coisas". Edita a lista crua, VALIDA AO VIVO
// pelo parser real do plugin (bundlado em src/generated via gen-parsers) — o
// MESMO que o F7 usa — e salva num RASCUNHO LOCAL (até "Publicar"). Erro de
// sintaxe bloqueia salvar.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { RuleElement, VaultDoc } from '../../data/types'
import { parseRuleElementLine, parseConditionLine } from '../../data/plugin-parsers'
import {
  setLocalDraft,
  clearLocalDraft,
  localDraftFor,
  useLocalDraftVersion,
} from '../../data/local-draft-store'
import { elementIssues } from './RuleElements'

const CONDICAO_SUBTIPO = 'Condição'

/** Re-parseia UMA linha crua no MESMO shape do extractor, escolhendo o parser
 *  pelo tipo do doc (Condição usa o subsistema de condição). É o que dá a
 *  validação viva batendo 1:1 com o que o F7 mostra. */
export function reparseElement(doc: VaultDoc, raw: string): RuleElement {
  if (doc.subtype === CONDICAO_SUBTIPO) {
    return { raw, parsed: [], condition: parseConditionLine(doc.basename ?? doc.id, raw) }
  }
  return { raw, parsed: parseRuleElementLine(raw, doc.basename ?? 'app') }
}

const boxStyle: CSSProperties = {
  marginTop: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '12px 14px',
  background: 'var(--panel)',
  border: '1px dashed color-mix(in srgb,var(--accent) 45%,var(--line2))',
  clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))',
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8 }

const inputStyle: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '6px 8px',
  background: 'var(--card)',
  color: 'var(--text)',
  border: '1px solid var(--line2)',
  resize: 'vertical',
}

const okStyle: CSSProperties = { color: '#4ade80', fontSize: 10, whiteSpace: 'nowrap', paddingTop: 8 }
const badStyle: CSSProperties = { color: 'var(--red)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', paddingTop: 8 }
const mutedStyle: CSSProperties = { color: 'var(--muted)', fontSize: 10, whiteSpace: 'nowrap', paddingTop: 8 }

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

/** Status curto de uma linha (reusa a MESMA classificação do F7). */
function lineStatus(el: RuleElement): { txt: string; style: CSSProperties } {
  if (el.raw.trim() === '') return { txt: 'vazio (ignorado)', style: mutedStyle }
  const issue = elementIssues(el)
  if (issue.syntax) return { txt: '⚠ erro de sintaxe', style: badStyle }
  if (issue.unknown > 0) return { txt: `⚠ não coberto (${issue.unknown})`, style: badStyle }
  return { txt: '✓ ok', style: okStyle }
}

export function RuleElementsEditor({ doc }: { doc: VaultDoc }) {
  useLocalDraftVersion() // re-render ao salvar/reverter
  const baseRaws = useMemo(() => (doc.ruleElements ?? []).map((e) => e.raw), [doc.ruleElements])
  const seed = baseRaws.join('\n')
  const [lines, setLines] = useState<string[]>(baseRaws)

  // Re-semeia quando os raws EFETIVOS mudam por fora (revert/publish); durante a
  // digitação o doc não muda, então não atrapalha.
  useEffect(() => setLines(baseRaws), [doc.id, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => lines.map((raw) => reparseElement(doc, raw)), [lines, doc])
  const syntaxErrors = parsed.filter((el) => el.raw.trim() !== '' && elementIssues(el).syntax).length
  const dirty = seed !== lines.join('\n')
  const hasDraft = localDraftFor(doc.id) !== undefined

  const setLine = (i: number, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? v : l)))
  const addLine = () => setLines((ls) => [...ls, ''])
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i))

  function save() {
    if (syntaxErrors > 0) return
    const els = lines.filter((l) => l.trim() !== '').map((raw) => reparseElement(doc, raw))
    setLocalDraft(doc.id, { ruleElements: els })
  }

  return (
    <section data-rule-editor="" style={boxStyle}>
      <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{'// EDITAR ELEMENTOS DE REGRA'}</span>
        <span style={{ color: 'var(--accent)', fontSize: 9 }}>MODO DEV</span>
        <span style={{ flex: 1 }} />
        {syntaxErrors > 0 ? (
          <span data-editor-status="error" style={badStyle}>
            ⚠ {syntaxErrors} com erro de sintaxe
          </span>
        ) : (
          <span data-editor-status="ok" style={okStyle}>
            ✓ sintaxe válida
          </span>
        )}
      </div>

      {lines.map((raw, i) => {
        const st = lineStatus(parsed[i]!)
        return (
          <div key={i} style={rowStyle}>
            <textarea
              data-rule-line={i}
              value={raw}
              rows={1}
              onChange={(e) => setLine(i, e.target.value)}
              style={inputStyle}
              spellCheck={false}
            />
            <span data-line-status style={st.style}>
              {st.txt}
            </span>
            <button
              type="button"
              aria-label={`remover linha ${i + 1}`}
              onClick={() => removeLine(i)}
              style={{ ...btn, padding: '5px 9px' }}
            >
              ✕
            </button>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={addLine} style={btn}>
          + linha
        </button>
        <span style={{ flex: 1 }} />
        {hasDraft ? (
          <button type="button" onClick={() => clearLocalDraft(doc.id)} style={btn}>
            Reverter
          </button>
        ) : null}
        <button
          type="button"
          data-save
          onClick={save}
          disabled={syntaxErrors > 0 || !dirty}
          style={{
            ...btn,
            borderColor: 'var(--accent)',
            color: syntaxErrors > 0 || !dirty ? 'var(--muted)' : 'var(--accent)',
            cursor: syntaxErrors > 0 || !dirty ? 'not-allowed' : 'pointer',
            opacity: syntaxErrors > 0 || !dirty ? 0.5 : 1,
          }}
        >
          Salvar rascunho
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
        Rascunho LOCAL — só você vê até publicar. Erro de sintaxe bloqueia salvar.
      </div>
    </section>
  )
}
