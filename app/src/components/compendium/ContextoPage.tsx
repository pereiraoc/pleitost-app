// TELA CONTEXTO (2026-09-09) — o mundo numa página só, sem passar pelo
// compêndio. Pedido do mestre:
//
//  * os dossiês do PRESENTE agrupados pelo GRUPO a que pertencem (a pasta:
//    "Ambiente e Sustentabilidade", "Poder e Controle"…), o nome do grupo em
//    cima e os cards embaixo;
//  * cada card com a FIGURA contida nele, pequena, à direita: clicar na figura
//    amplia; clicar na esquerda (título e assunto) abre o dossiê ali mesmo —
//    e o corpo aberto vem SEM a figura, que já está no card e só ocuparia
//    espaço;
//  * no alto, um botão que abre a LINHA DO TEMPO do contexto histórico,
//    fechado de início pra não ocupar espaço à toa.
//
// Nada de lista fixa: os grupos são as subpastas de `Contexto Atual` e os
// cards são as notas dentro delas, na ordem do índice da vault.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { reskinName } from '../../data/reskin'
import { useDocs } from '../../data/useDoc'
import { docPath } from '../../paths'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { MarkdownBody } from '../../markdown/MarkdownBody'
import { COMPENDIO_KICKER, TITLES } from '../layout/design-nav'
import { CONTEXTO_ATUAL_PATH, CONTEXTO_HISTORICO_PATH } from './compendio-registry'
import { corpoContexto, dataDisplay, fmAssunto, fmData, semFiguras } from './contexto-template'
import { VaultImage } from './VaultImage'

/** Figura da nota: o primeiro embed de imagem do corpo (o template do mundo
 *  põe `![[Nome.png]]` logo abaixo do callout). */
function figuraDe(doc: VaultDoc | undefined): string | null {
  return doc?.images.find((i) => i.from === 'body')?.target ?? doc?.images[0]?.target ?? null
}

/** Um dossiê: à esquerda o que se lê, à direita a figura. Clicar na esquerda
 *  abre o corpo aqui mesmo; clicar na figura amplia. */
function CardContexto({ entry, doc }: { entry: IndexDocEntry; doc: VaultDoc | undefined }) {
  const assunto = fmAssunto(doc)
  const figura = figuraDe(doc)
  const corpo = doc ? semFiguras(corpoContexto(doc)) : ''
  return (
    <details className="ctx-card" data-ctx-card={entry.basename ?? entry.id}>
      <summary className="ctx-card-head">
        <span className="ctx-card-texto">
          <span className="ctx-card-title">{reskinName(entry.basename ?? entry.id)}</span>
          {assunto ? <span className="ctx-card-assunto">{assunto}</span> : null}
        </span>
        {figura ? (
          // o clique na figura é DELA (amplia) e não abre o card: o
          // preventDefault no borbulho cancela o toggle do <summary>.
          <span
            className="ctx-card-fig"
            data-ctx-figura={figura}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <VaultImage target={figura} thumb zoom />
          </span>
        ) : null}
      </summary>
      <div className="ctx-card-body">
        {doc && corpo !== '' ? (
          <MarkdownBody doc={{ ...doc, body: corpo }} hideLeadingTitle />
        ) : (
          <p className="ctx-acc-vazio">Sem conteúdo ainda.</p>
        )}
        <Link className="ctx-acc-abrir" to={docPath(entry.id)}>
          abrir página →
        </Link>
      </div>
    </details>
  )
}

/** A linha do tempo do passado, fechada de início. */
function LinhaDoTempo({ entries }: { entries: IndexDocEntry[] }) {
  const docs = useDocs(entries.map((e) => e.id))
  const ordenadas = useMemo(() => {
    if (!docs) return entries
    return [...entries].sort((a, b) => {
      const da = fmData(docs.get(a.id))
      const db = fmData(docs.get(b.id))
      if (da && db) return da.localeCompare(db)
      return da ? -1 : db ? 1 : 0
    })
  }, [entries, docs])
  if (!entries.length) return null
  return (
    <details className="ctx-tl-box" data-linha-do-tempo="">
      <summary className="ctx-tl-botao">
        {`LINHA DO TEMPO · ${entries.length} marcos`}
      </summary>
      <div className="ctx-timeline">
        {ordenadas.map((e) => {
          const doc = docs?.get(e.id)
          const data = fmData(doc)
          const corpo = doc ? corpoContexto(doc) : ''
          return (
            <article key={e.id} className="ctx-tl-item">
              {data ? <span className="ctx-tl-date">{dataDisplay(data)}</span> : null}
              <h3 className="ctx-tl-title">
                <Link to={docPath(e.id)}>{reskinName(e.basename ?? e.id)}</Link>
              </h3>
              {doc && corpo !== '' ? (
                <div className="ctx-tl-body">
                  <MarkdownBody doc={{ ...doc, body: semFiguras(corpo) }} hideLeadingTitle />
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </details>
  )
}

/** Um grupo de dossiês: o nome do grupo e, abaixo, os cards dele. */
function GrupoContexto({ nome, entries }: { nome: string; entries: IndexDocEntry[] }) {
  const docs = useDocs(entries.map((e) => e.id))
  if (!entries.length) return null
  return (
    <section className="ctx-grupo" data-ctx-grupo={nome}>
      <h2 className="ctx-grupo-titulo">{reskinName(nome)}</h2>
      <div className="ctx-stack">
        {entries.map((e) => (
          <CardContexto key={e.id} entry={e} doc={docs?.get(e.id)} />
        ))}
      </div>
    </section>
  )
}

export function ContextoPage() {
  const catalog = useCatalog()
  const atual = catalog.folderByPath.get(CONTEXTO_ATUAL_PATH)
  const historico = catalog.folderByPath.get(CONTEXTO_HISTORICO_PATH)

  // Grupos = subpastas de Contexto Atual; os cards, as notas de cada uma
  // (menos a nota-da-pasta, que é o índice de transclusões).
  const grupos = useMemo(
    () =>
      (atual?.folders ?? []).map((f) => ({
        nome: f.name,
        entries: f.docs.filter((d) => d.basename !== f.name),
      })),
    [atual],
  )
  // Notas soltas na raiz de Contexto Atual (fora de grupo) entram por último.
  const soltas = useMemo(
    () => (atual?.docs ?? []).filter((d) => d.basename !== atual?.name),
    [atual],
  )
  const marcos = useMemo(
    () => (historico?.docs ?? []).filter((d) => d.basename !== historico?.name),
    [historico],
  )
  if (!atual) {
    return (
      <section className="page">
        <div className="kicker">{COMPENDIO_KICKER}</div>
        <p>Este mundo não tem dossiês de contexto.</p>
      </section>
    )
  }

  const visiveis = grupos.filter((g) => g.entries.length)

  return (
    <section className="page ctx-page">
      <div className="kicker">{`// ${TITLES.contexto} DO MUNDO`}</div>
      <LinhaDoTempo entries={marcos} />
      {visiveis.map((g) => (
        <GrupoContexto key={g.nome} nome={g.nome} entries={g.entries} />
      ))}
      {soltas.length ? <GrupoContexto nome={atual.name} entries={soltas} /> : null}
    </section>
  )
}
