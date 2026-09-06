// PÁGINA DA AVENTURA no formato fixo (docs/plano-aventuras-na-sessao.md v2.1):
// sub-nav (Resumo · Contexto · Personagens · Locais · Cenas) + conteúdo
// empilhado em leitura vertical. Bounty/Disponível seguem como hoje; Resumo
// mostra a Estrutura (FM) e as contagens derivadas; Personagens/Locais são
// cards de registro; Locais fecham com o MAPA (viewer da Localização, markers
// = registros) e "Imprimir mapa"; Cenas = Abertura + cenas expansíveis
// (combates dentro) + Desfecho. Controles de sessão (mestre + sala viva):
// iniciar/encerrar a aventura e marcar a cena atual.
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { VaultDoc } from '../../../data/types'
import { reskinName } from '../../../data/reskin'
import { useCatalog } from '../../../data/CatalogContext'
import { useLiveSession } from '../../../data/session-repo/live-session'
import { useSessionRepo, useSessionUser } from '../../../data/session-repo/provider'
import { isUnlocked, lock } from '../../../data/doc-lock'
import { useSettings } from '../../../settings'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import { BountyCard } from '../../../markdown/bounty/BountyCard'
import { bountyMetaFromDoc } from '../../../markdown/bounty/BountyFence'
import { BountyText } from '../../../markdown/bounty/BountyText'
import { fmtAmount } from '../../../markdown/bounty/parse-bounty'
import { COMPENDIO_KICKER } from '../../layout/design-nav'
import { FieldBlock } from '../FieldBlock'
import { InlineFieldValue } from '../InlineFieldValue'
import { MapaLocal } from '../LocationSheet'
import { DocRuleElements } from '../RuleElements'
import { aventuraConfig } from '../../../aventura/config'
import type { AventuraModel } from '../../../aventura/types'
import { ABERTURA_NUCLEO, DESFECHO_NUCLEO, ordenarCampos } from '../../../aventura/registros'
import { aventuraAtual, encerrarAventura, iniciarAventura, irParaCena } from '../../../aventura/session-actions'
import { CenaBlock } from './CenaBlock'
import { LeituraBlock } from './LeituraBlock'
import { RegistroCard } from './RegistroCard'
import { cenaAnchorId } from './RefChip'

const NAV: { id: string; label: string }[] = [
  { id: 'av-resumo', label: 'Resumo' },
  { id: 'av-contexto', label: 'Contexto' },
  { id: 'av-personagens', label: 'Personagens' },
  { id: 'av-locais', label: 'Locais' },
  { id: 'av-cenas', label: 'Cenas' },
]

function irPara(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function fmValor(v: unknown): string | null {
  if (v == null || v === '') return null
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(' · ') || null
  if (typeof v === 'object' && 'min' in (v as object)) return fmtAmount(v)
  return String(v)
}

/** Campos da Estrutura lidos do FM (a fonte) — os rótulos são os do template. */
const ESTRUTURA_FM: { key: string; label: string }[] = [
  { key: 'Duração', label: 'Duração' },
  { key: 'Jogadores', label: 'Jogadores' },
  { key: 'rank', label: 'Rank' },
  { key: 'Formato', label: 'Formato' },
  { key: 'Tom', label: 'Tom' },
]

function Secao({ id, titulo, children, extra }: { id: string; titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="av-sec" id={id} data-av-sec={id}>
      <div className="av-sec-head">
        <div className="kicker">{`// ${titulo.toUpperCase()}`}</div>
        {extra}
      </div>
      {children}
    </section>
  )
}

export function AventuraFormatoSheet({
  doc,
  model,
  bounty,
  disponivel,
}: {
  doc: VaultDoc
  model: AventuraModel
  /** BountyData já resolvido (fence ou FM) — null quando a nota não tem contrato. */
  bounty: ReturnType<typeof import('../../../markdown/bounty/parse-bounty').parseBountyBlock> | null
  disponivel: string[]
}) {
  const catalog = useCatalog()
  const cfg = aventuraConfig(catalog.contextoDef)
  const { mestre } = useSettings()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const live = useLiveSession()
  const emSessao = mestre && !!repo && !!user && !!live
  const atual = aventuraAtual(live)
  const estaRodando = atual?.docId === doc.id
  const cenaAtualSlug = estaRodando ? atual!.cenaAtual : null

  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(cenaAtualSlug ? [cenaAtualSlug] : model.cenas[0] ? [model.cenas[0].slug] : []))
  const [localAberto, setLocalAberto] = useState<string | null>(null)
  const toggleCena = (slug: string) =>
    setAbertas((s) => {
      const n = new Set(s)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })

  const totais = useMemo(
    () => ({
      cenas: model.cenas.length,
      combates: model.cenas.reduce((n, c) => n + c.segmentos.filter((s) => s.kind === 'combate').length, 0),
      personagens: model.personagens.length,
      locais: model.locais.length,
    }),
    [model],
  )
  const nome = reskinName(doc.basename)
  const destravada = isUnlocked(doc.id)

  const marcador = (nomeMarker: string): boolean => {
    const reg = model.locais.find((l) => l.nome === nomeMarker)
    if (!reg) return false
    setLocalAberto(reg.slug)
    document.getElementById(`av-reg-${reg.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }

  return (
    <section className="page aventura-page av-formato" data-av-formato="">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <header className="av-header">
        <h1 className="av-titulo">{nome}</h1>
        <div className="av-header-acoes">
          {destravada ? (
            <button type="button" className="av-btn-mini" onClick={() => lock(doc.id)} title="Trancar de novo neste aparelho">
              🔒 bloquear
            </button>
          ) : null}
          {emSessao ? (
            estaRodando ? (
              <button type="button" className="av-btn-mini is-red" onClick={() => void encerrarAventura(repo!, live!)}>
                ■ encerrar aventura
              </button>
            ) : (
              <button type="button" className="av-btn" data-av-iniciar="" onClick={() => void iniciarAventura(repo!, live!, doc.id, nome)}>
                ▶ Iniciar na sessão
              </button>
            )
          ) : null}
        </div>
      </header>
      <nav className="av-nav" aria-label="Seções da aventura">
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => irPara(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>

      {/* ── 1. Resumo ── */}
      <Secao id="av-resumo" titulo={cfg.secoes.resumo}>
        {bounty ? <BountyCard data={bounty} meta={bountyMetaFromDoc(doc)} /> : null}
        {disponivel.length ? (
          <div className="aventura-disponivel">
            <span className="local-field-label">DISPONÍVEL EM</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {disponivel.map((d, i) => (
                <span key={i} className="av-chip">
                  <BountyText text={d} />
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {model.resumo.texto ? (
          <div className="av-resumo-texto">
            <MarkdownBody doc={{ ...doc, body: model.resumo.texto }} />
          </div>
        ) : null}
        <div className="av-estrutura" data-av-estrutura="">
          <div className="kicker">{'// ESTRUTURA DA SESSÃO'}</div>
          {ESTRUTURA_FM.map(({ key, label }) => {
            const v = fmValor(doc.frontmatter[key])
            return v ? (
              <FieldBlock key={key} label={label}>
                <InlineFieldValue value={v} />
              </FieldBlock>
            ) : null
          })}
          {model.resumo.estruturaExtra.map((c) => (
            <FieldBlock key={c.label} label={c.label}>
              {c.value.includes('\n') ? <MarkdownBody doc={{ ...doc, body: c.value }} /> : <InlineFieldValue value={c.value} />}
            </FieldBlock>
          ))}
          <div className="av-totais" data-av-totais="">
            <span>{totais.cenas} cenas</span>
            <span>{totais.combates} combates</span>
            <span>{totais.personagens} personagens</span>
            <span>{totais.locais} locais</span>
          </div>
        </div>
        {model.resumo.comoLer ? (
          <details className="ctx-acc av-comoler">
            <summary className="ctx-acc-head">
              <span className="ctx-acc-title">Como ler esta nota</span>
            </summary>
            <div className="ctx-acc-body">
              <MarkdownBody doc={{ ...doc, body: model.resumo.comoLer }} />
            </div>
          </details>
        ) : null}
        {model.resumo.roteiro ? (
          <div className="av-roteiro" data-av-roteiro="">
            <div className="kicker">{`// ${cfg.secoes.roteiro.toUpperCase()}`}</div>
            <MarkdownBody doc={{ ...doc, body: model.resumo.roteiro }} />
            {model.cenas.length ? (
              <div className="av-roteiro-links">
                {model.cenas.map((c) => (
                  <button key={c.slug} type="button" className="av-chip is-cena" onClick={() => { setAbertas((s) => new Set(s).add(c.slug)); irPara(cenaAnchorId(c.slug)) }}>
                    {c.n}. {c.titulo}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Secao>

      {/* ── 2. Contexto ── */}
      <Secao id="av-contexto" titulo={cfg.secoes.contexto}>
        {model.contextoAventura ? (
          <div className="av-sub" data-av-sub="contexto-aventura">
            <h2 className="av-sub-titulo">{cfg.secoes.contexto_aventura}</h2>
            <MarkdownBody doc={{ ...doc, body: model.contextoAventura }} />
          </div>
        ) : null}
        {model.notasMestre ? (
          <div className="av-sub" data-av-sub="notas-mestre">
            <h2 className="av-sub-titulo">{cfg.secoes.notas_mestre}</h2>
            <MarkdownBody doc={{ ...doc, body: model.notasMestre }} />
          </div>
        ) : null}
      </Secao>

      {/* ── 2.3 Personagens ── */}
      <Secao id="av-personagens" titulo={cfg.secoes.personagens}>
        {model.personagens.length ? (
          <div className="av-registros">
            {model.personagens.map((p) => (
              <RegistroCard key={p.slug} reg={p} tipo="personagem" model={model} doc={doc} />
            ))}
          </div>
        ) : (
          <p className="ctx-acc-vazio">Sem personagens registrados.</p>
        )}
      </Secao>

      {/* ── 2.4 Locais + Mapa ── */}
      <Secao
        id="av-locais"
        titulo={cfg.secoes.locais}
        extra={
          model.mapa ? (
            <Link className="av-btn-mini" to={`/papel/mapa/${doc.id.split('/').map(encodeURIComponent).join('/')}`} data-av-imprimir-mapa="">
              🖨 imprimir mapa
            </Link>
          ) : null
        }
      >
        {model.locais.length ? (
          <div className="av-registros">
            {model.locais.map((l) => (
              <div key={l.slug} className={localAberto === l.slug ? 'is-destacado' : undefined}>
                <RegistroCard reg={l} tipo="local" model={model} doc={doc} />
              </div>
            ))}
          </div>
        ) : (
          <p className="ctx-acc-vazio">Sem locais registrados.</p>
        )}
        {model.mapa ? (
          <div className="av-mapa" data-av-mapa="">
            <div className="kicker">{`// ${cfg.secoes.mapa.toUpperCase()}`}</div>
            <MapaLocal leaflet={model.mapa} onMarker={marcador} />
          </div>
        ) : null}
      </Secao>

      {/* ── 3. Cenas ── */}
      <Secao id="av-cenas" titulo={cfg.secoes.cenas}>
        {model.abertura ? (
          <div className="av-sub av-abertura" data-av-sub="abertura">
            <h2 className="av-sub-titulo">{cfg.secoes.abertura}</h2>
            {ordenarCampos(model.abertura.campos, ABERTURA_NUCLEO).map((c) => (
              <FieldBlock key={c.label} label={c.label}>
                {c.value.includes('\n') ? <MarkdownBody doc={{ ...doc, body: c.value }} /> : <InlineFieldValue value={c.value} />}
              </FieldBlock>
            ))}
            {model.abertura.corpo ? (
              <details className="ctx-acc av-abertura-corpo">
                <summary className="ctx-acc-head">
                  <span className="ctx-acc-title">Detalhes da abertura</span>
                </summary>
                <div className="ctx-acc-body">
                  <MarkdownBody doc={{ ...doc, body: model.abertura.corpo }} />
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
        <div className="av-cenas" data-av-cenas="">
          {model.cenas.map((c) => (
            <CenaBlock
              key={c.slug}
              cena={c}
              model={model}
              doc={doc}
              aberta={abertas.has(c.slug)}
              onToggle={() => toggleCena(c.slug)}
              atual={cenaAtualSlug === c.slug}
              onMarcarAtual={emSessao && estaRodando ? () => void irParaCena(repo!, live!, c.slug) : undefined}
            />
          ))}
        </div>
        {model.desfecho ? (
          <div className="av-sub av-desfecho" data-av-sub="desfecho">
            <h2 className="av-sub-titulo">{cfg.secoes.desfecho}</h2>
            {ordenarCampos(model.desfecho.campos, DESFECHO_NUCLEO).map((c) => (
              <FieldBlock key={c.label} label={c.label}>
                <InlineFieldValue value={c.value} />
              </FieldBlock>
            ))}
            {model.desfecho.leituras.map((l, i) => (
              <LeituraBlock key={i} leitura={l} doc={doc} />
            ))}
            <MarkdownBody doc={{ ...doc, body: model.desfecho.corpo }} />
          </div>
        ) : null}
      </Secao>
      <DocRuleElements doc={doc} />
    </section>
  )
}
