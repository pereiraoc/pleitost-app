// ESCUDO DO MESTRE — painel NOTAS: a seção de notas para o mestre (cfg
// secoes.notas_mestre) da aventura em curso na mesa, pra consultar sem sair
// do escudo. Um bloco dobrável por `###` (Preparação, Dicas de condução, …),
// todos fechados — o escudo fica compacto e o mestre abre o que precisa.
// Mesma linguagem de dobra da página da aventura (.ctx-acc nativo).
import { ArquivosCifradosProvider } from '../../../data/arquivos-cifrados'
import { useAventuraEmCurso } from '../../../aventura/use-aventura-em-curso'
import { subsecoes } from '../../../aventura/markdown-sections'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { Aviso, AventuraTrancada, SemAventura } from './SubCena'

export function SubNotas() {
  const { av, doc, locked, model, cfg } = useAventuraEmCurso()
  const corpo = (() => {
    if (!av) return <SemAventura />
    if (!doc) return <div className="loading">Carregando aventura…</div>
    if (locked || !model) return <AventuraTrancada doc={doc} />
    if (!model.notasMestre) return <Aviso>{`// A AVENTURA NÃO TEM ${cfg.secoes.notas_mestre.toUpperCase()}`}</Aviso>
    const { intro, secoes } = subsecoes(model.notasMestre, 3)
    return (
      <ArquivosCifradosProvider doc={doc}>
        <div className="av-formato" data-av-formato="escudo">
          <h2 className="av-sub-titulo">{cfg.secoes.notas_mestre}</h2>
          {intro ? <MarkdownBody doc={{ ...doc, body: intro }} /> : null}
          {secoes.map((s) => (
            <details key={s.titulo} className="ctx-acc" data-escudo-nota={s.titulo}>
              <summary className="ctx-acc-head">
                <span className="ctx-acc-title">{s.titulo}</span>
              </summary>
              <div className="ctx-acc-body">
                <MarkdownBody doc={{ ...doc, body: s.corpo }} />
              </div>
            </details>
          ))}
        </div>
      </ArquivosCifradosProvider>
    )
  })()
  return (
    <div data-escudo-sub="notas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {corpo}
    </div>
  )
}
