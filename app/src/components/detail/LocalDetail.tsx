// Info do LOCAL do mapa na sidebar DETALHES (#89) — mesma fonte de verdade da
// ficha de Localização (frontmatter: Tipo/Descrição/Recursos), nunca inventada.
// Substitui o bloco lateral do mapa (RightBar #70): a info aparece na sidebar
// global; e dá pra abrir o COMÉRCIO ali mesmo, ou o doc completo.
import { useDoc } from '../../data/useDoc'
import { useDetail } from '../../data/detail-context'
import { localTypeFromSubtype } from '../../data/commerce'
import { InlineFieldValue } from '../compendium/InlineFieldValue'

export function LocalDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  const detail = useDetail()
  if (!doc) return <div className="loading">Carregando…</div>

  const tipo = typeof doc.subtype === 'string' && doc.subtype.trim() ? doc.subtype : ''
  const descricao =
    typeof doc.frontmatter['Descrição'] === 'string' ? (doc.frontmatter['Descrição'] as string) : ''
  const recursos = Array.isArray(doc.frontmatter['Recursos'])
    ? (doc.frontmatter['Recursos'] as unknown[]).filter(
        (r): r is string => typeof r === 'string' && r.trim() !== '',
      )
    : []
  const temComercio = localTypeFromSubtype(doc.subtype) != null

  return (
    <div className="local-detail">
      <div className="local-detail-nome">{doc.basename}</div>
      {tipo ? (
        <div className="local-field">
          <span className="local-field-label">TIPO</span>
          <span>{tipo}</span>
        </div>
      ) : null}
      {descricao ? (
        <div className="local-field local-field-col">
          <span className="local-field-label">DESCRIÇÃO</span>
          <span style={{ lineHeight: 1.5 }}>
            <InlineFieldValue value={descricao} />
          </span>
        </div>
      ) : null}
      {recursos.length ? (
        <div className="local-field local-field-col">
          <span className="local-field-label">RECURSOS</span>
          <div className="local-recursos">
            {recursos.map((r, i) => (
              <span key={i} className="local-recurso">
                <InlineFieldValue value={r} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="local-detail-actions">
        {temComercio ? (
          <button
            data-ver-comercio=""
            className="local-action accent"
            onClick={() => detail?.open({ kind: 'comercio', id })}
          >
            💍 Ver comércio
          </button>
        ) : null}
        <button className="local-action" onClick={() => detail?.open({ kind: 'doc', id })}>
          Abrir doc completo
        </button>
      </div>
    </div>
  )
}
