// Aba SERVIÇOS de uma Localização (v3, 2026-09-08): a vitrine do que se
// vende ABAIXO deste lugar, colapsável POR LUGAR (como o Comércio da cidade
// empilha as lojas dos bairros) e, dentro de cada lugar, POR ESTABELECIMENTO
// — um Ponto de Interesse com FM `Serviços` ou um tipo genérico do comércio
// de rua do bairro (Boteco de esquina, Banca de jornal…). Cada oferta é rolada
// por semente (estabelecimento + dia) com quantidade e disponibilidade
// conforme a linha da régua (`recursos.disponibilidade`); o preço leva a régua.
// O plano de custo de vida garante o mínimo: tudo aqui pode ser consumido
// como extra. Transporte avulso não se vende (o plano TRI cobre).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { activeContextoDef, reskinName } from '../../data/reskin'
import { formatValorMoeda, moedaFator } from '../../data/moeda'
import { localTypeOfDoc, matrizDoContexto, type LocalType } from '../../data/commerce'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { heroOuro } from '../../data/purchase'
import { DetailLink } from '../DetailLink'
import { clip } from '../ficha/bits'
import { InlineFieldValue } from './InlineFieldValue'
import { useAtlasRelations } from './AtlasNav'
import { useHeroOptions } from './LocationSheet'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Recurso, RecursosCfg } from '../../recursos/types'
import { parseOfertasAgrupadas, rollOfertas, type OfertaRolada } from '../../recursos/ofertas'
import { comprarNoEstabelecimento } from '../../recursos/comprar'
import { diaDeHoje, registrarVenda, useVendidasHoje } from '../../recursos/ofertas-store'
import { custoEmOuro } from '../../recursos/hero-recursos'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '10px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }

function Botao({ children, onClick, disabled, title, tom = 'accent' }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; tom?: 'accent' | 'muted' }) {
  const cor = tom === 'accent' ? 'var(--accent)' : 'var(--muted)'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        padding: '5px 9px',
        whiteSpace: 'nowrap',
        background: disabled ? 'transparent' : `color-mix(in srgb,${cor} 14%,transparent)`,
        border: `1px solid ${disabled ? 'var(--line2)' : `color-mix(in srgb,${cor} 45%,transparent)`}`,
        color: disabled ? 'var(--muted)' : cor,
        clipPath: clip(5),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}
function Chip({ children, tom = 'muted' }: { children: ReactNode; tom?: 'muted' | 'accent' | 'off' }) {
  const cor = tom === 'accent' ? 'var(--accent)' : 'var(--muted)'
  return (
    <span style={{ ...MONO, fontSize: 10, padding: '2px 6px', border: `1px solid ${tom === 'accent' ? cor : 'var(--line2)'}`, color: cor, whiteSpace: 'nowrap', textDecoration: tom === 'off' ? 'line-through' : undefined }}>
      {children}
    </span>
  )
}

export function ServicosTab({ doc }: { doc: VaultDoc }) {
  const cfg = activeContextoDef()?.recursos
  if (!cfg) return null
  return <ServicosCorpo doc={doc} cfg={cfg} />
}

/** Uma vitrine: um PoI com Serviços, ou um tipo genérico do comércio de rua. */
interface Estabelecimento {
  /** Lugar do Atlas que declara a oferta (PoI ou bairro). */
  doc: VaultDoc
  /** Nome exibido: o PoI, ou "Boteco de esquina" (comércio de rua). */
  nome: string
  generico: boolean
  linha: LocalType | null
  ofertas: OfertaRolada[]
}
/** Lugar (bairro/nota-pasta) que agrupa estabelecimentos — colapsável. */
interface Lugar {
  id: string
  nome: string
  estabelecimentos: Estabelecimento[]
}

/** Pasta (dirname) de um id do Atlas. */
const dirDe = (id: string) => id.slice(0, id.lastIndexOf('/'))
/** Nota-pasta: `.../X/X`. */
const ehPasta = (id: string, basename: string) => dirDe(id).split('/').pop() === basename

function ServicosCorpo({ doc, cfg }: { doc: VaultDoc; cfg: RecursosCfg }) {
  const catalog = useCatalog()
  const rel = useAtlasRelations(doc)
  const fator = moedaFator()
  const matriz = useMemo(() => matrizDoContexto(activeContextoDef()), [])
  const recursoIds = useMemo(() => (catalog.docsByType.get('Recurso') ?? []).map((e) => e.id), [catalog])
  // todos os lugares abaixo deste (ids são caminhos — descendentes por prefixo)
  const descendentes = useMemo(() => {
    if (!ehPasta(doc.id, doc.basename)) return []
    const prefixo = dirDe(doc.id) + '/'
    return (catalog.docsByType.get('Localização') ?? [])
      .map((e) => e.id)
      .filter((id) => id !== doc.id && id.startsWith(prefixo))
      .sort((a, b) => a.localeCompare(b, 'pt'))
  }, [catalog, doc.id, doc.basename])
  const ids = useMemo(() => [...new Set([doc.id, ...descendentes, ...rel.crumbs.map((c) => c.id), ...recursoIds])], [doc.id, descendentes, rel, recursoIds])
  const docs = useDocs(ids)
  const porNome = useMemo(() => {
    const m = new Map<string, Recurso>()
    if (!docs) return m
    for (const id of recursoIds) {
      const d = docs.get(id)
      const r = d ? parseRecurso(d) : null
      if (r) m.set(r.nome, r)
    }
    return m
  }, [docs, recursoIds])

  const lugares = useMemo<Lugar[]>(() => {
    if (!docs) return []
    const dia = diaDeHoje()
    // linha da régua: a do lugar, senão a da nota-pasta mais próxima acima, senão a de um ancestral
    const linhaDe = (d: VaultDoc): LocalType | null => {
      const propria = localTypeOfDoc(d)
      if (propria) return propria
      let dir = dirDe(d.id)
      while (dir.includes('/')) {
        const nome = dir.split('/').pop()!
        const anc = docs.get(`${dir}/${nome}`)
        const l = anc ? localTypeOfDoc(anc) : null
        if (l) return l
        dir = dirDe(dir)
      }
      for (let i = rel.crumbs.length - 1; i >= 0; i--) {
        const a = docs.get(rel.crumbs[i]!.id)
        const l = a ? localTypeOfDoc(a) : null
        if (l) return l
      }
      return null
    }
    // lugar que agrupa: a nota-pasta mais próxima acima do doc (ou ele mesmo, se for pasta)
    const lugarDe = (d: VaultDoc): { id: string; nome: string } => {
      if (ehPasta(d.id, d.basename)) return { id: d.id, nome: d.basename }
      const dir = dirDe(d.id)
      const nome = dir.split('/').pop()!
      const anc = docs.get(`${dir}/${nome}`)
      return anc ? { id: anc.id, nome: anc.basename } : { id: doc.id, nome: doc.basename }
    }
    const mapa = new Map<string, Lugar>()
    for (const id of [doc.id, ...descendentes]) {
      const d = id === doc.id ? doc : docs.get(id)
      if (!d) continue
      const grupos = parseOfertasAgrupadas((d.frontmatter ?? {}) as Record<string, unknown>, cfg.ofertas.campo)
      if (!grupos.length) continue
      const linha = linhaDe(d)
      const mult = linha ? (matriz?.precos[linha] ?? 1) : 1
      const lugar = lugarDe(d)
      const l = mapa.get(lugar.id) ?? { id: lugar.id, nome: lugar.nome, estabelecimentos: [] }
      for (const g of grupos) {
        const ofertas = rollOfertas(g.ofertas, porNome, linha, cfg, fator, mult, `${d.id}|${g.estabelecimento ?? ''}|${dia}`)
        if (!ofertas.length) continue
        l.estabelecimentos.push({ doc: d, nome: g.estabelecimento ?? d.basename, generico: g.estabelecimento !== null, linha, ofertas })
      }
      if (l.estabelecimentos.length) mapa.set(lugar.id, l)
    }
    const out = [...mapa.values()]
    for (const l of out) l.estabelecimentos.sort((a, b) => Number(a.generico) - Number(b.generico) || a.nome.localeCompare(b.nome, 'pt'))
    return out.sort((a, b) => (a.id === doc.id ? -1 : b.id === doc.id ? 1 : a.nome.localeCompare(b.nome, 'pt')))
  }, [docs, doc, descendentes, cfg, porNome, matriz, fator, rel])

  // comprador = herói selecionado no topo direito (mesma regra da loja)
  const heroes = useHeroOptions()
  const selectedCreatureId = useSelectedCreature()
  const hero = heroes.find((h) => h.entry.id === selectedCreatureId)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  void tick
  const ouro = hero ? heroOuro(hero.entry.id, hero.doc) : null

  if (!docs) return <div style={{ ...MONO, padding: 12 }}>{'// CARREGANDO SERVIÇOS…'}</div>
  if (!lugares.length) {
    return (
      <div style={{ ...BOX, border: '1px dashed var(--line2)', textAlign: 'center', padding: 36 }}>
        <span style={MONO}>{`// NENHUM LUGAR COM ${cfg.ofertas.campo.toUpperCase()} AQUI`}</span>
      </div>
    )
  }
  const comprador = hero ? { id: hero.entry.id, doc: hero.doc, ouro: ouro ?? 0 } : null
  const onResultado = (msg: string) => {
    setAviso(msg)
    setTick((t) => t + 1)
  }
  const totalEst = lugares.reduce((a, l) => a + l.estabelecimentos.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={MONO}>COMPRADOR</span>
        {hero ? (
          <>
            <b style={{ fontSize: 13 }}>{reskinName(hero.entry.basename ?? hero.entry.id)}</b>
            <Chip>{formatValorMoeda((ouro ?? 0) * fator)} na ficha</Chip>
          </>
        ) : (
          <span style={{ ...MONO, color: 'var(--text)' }}>escolha um herói no topo direito pra comprar</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 10 }}>
          {lugares.length} {lugares.length === 1 ? 'lugar' : 'lugares'} · {totalEst} estabelecimentos
        </span>
        {aviso ? (
          <span role="status" style={{ ...MONO, color: 'var(--text)', flexBasis: '100%' }}>
            {aviso}
          </span>
        ) : null}
      </div>
      {lugares.map((l) => (
        <details key={l.id} open={lugares.length === 1} data-lugar={l.nome} style={{ border: '1px solid var(--line2)', padding: '6px 12px' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>{reskinName(l.nome)}</b>
            <span style={{ ...MONO, fontSize: 10 }}>
              {l.estabelecimentos.length} {l.estabelecimentos.length === 1 ? 'estabelecimento' : 'estabelecimentos'}
            </span>
            {l.id !== doc.id ? (
              <span style={{ fontSize: 11 }}>
                <DetailLink id={l.id}>abrir</DetailLink>
              </span>
            ) : null}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {l.estabelecimentos.map((e) => (
              <EstabelecimentoBox
                key={`${e.doc.id}|${e.nome}`}
                e={e}
                cfg={cfg}
                fator={fator}
                rotulo={e.linha ? (matriz?.rotulos[e.linha] ?? e.linha) : null}
                mult={e.linha ? (matriz?.precos[e.linha] ?? 1) : 1}
                comprador={comprador}
                onResultado={onResultado}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function EstabelecimentoBox({
  e,
  cfg,
  fator,
  rotulo,
  mult,
  comprador,
  onResultado,
}: {
  e: Estabelecimento
  cfg: RecursosCfg
  fator: number
  rotulo: string | null
  mult: number
  comprador: { id: string; doc: VaultDoc | undefined; ouro: number } | null
  onResultado: (msg: string) => void
}) {
  const chaveVendas = `${e.doc.id}|${e.generico ? e.nome : ''}`
  const vendidas = useVendidasHoje(chaveVendas)
  const geo = (e.doc.frontmatter?.['Geolocalização'] as string | undefined) ?? ''
  const grupos = useMemo(() => {
    const m = new Map<string, OfertaRolada[]>()
    for (const o of e.ofertas) {
      const g = m.get(o.recurso.tipo) ?? []
      g.push(o)
      m.set(o.recurso.tipo, g)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
  }, [e.ofertas])

  const comprar = (o: OfertaRolada) => {
    if (!comprador) {
      onResultado('Escolha um herói no topo direito pra comprar.')
      return
    }
    const r = comprarNoEstabelecimento(comprador.id, comprador.doc, cfg, fator, o)
    if (r.ok && r.vendidas > 0 && o.qtd !== null) registrarVenda(chaveVendas, o.key, r.vendidas)
    onResultado(r.msg)
  }

  return (
    <section style={BOX} data-estabelecimento={e.nome}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 13.5 }}>{e.generico ? e.nome : <DetailLink id={e.doc.id}>{reskinName(e.doc.basename)}</DetailLink>}</b>
        {e.generico ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>comércio de rua · <DetailLink id={e.doc.id}>{reskinName(e.doc.basename)}</DetailLink></span>
        ) : geo ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <InlineFieldValue value={geo} />
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {rotulo ? <Chip>{rotulo} ×{String(mult).replace('.', ',')}</Chip> : null}
      </div>
      {grupos.map(([tipo, lista]) => (
        <div key={tipo} style={{ marginTop: 4 }}>
          <div style={{ ...MONO, margin: '6px 0 2px' }}>{tipo.toUpperCase()}</div>
          {lista.map((o) => {
            const restante = o.qtd === null ? null : Math.max(0, o.qtd - (vendidas[o.key] ?? 0))
            const esgotado = !o.disponivel || restante === 0
            const r = o.recurso
            const unidade = o.acao === 'comprar' ? '' : r.cobranca && r.cobranca !== 'única' ? ` / ${r.cobranca}` : ''
            const semSaldo = !comprador || comprador.ouro < custoEmOuro(o.preco, fator)
            let botao: ReactNode = null
            if (!esgotado) {
              switch (o.acao) {
                case 'comprar':
                  botao = <Botao onClick={() => comprar(o)} disabled={semSaldo}>Comprar{o.estado ? ` ${o.estado}` : ''} −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'diaria':
                  botao = <Botao onClick={() => comprar(o)} disabled={semSaldo}>{r.cobranca === 'noite' ? '1 noite' : '1 dia'} −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'avista':
                  botao = <Botao onClick={() => comprar(o)} disabled={semSaldo}>Pagar −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'miudeza':
                  botao = <Botao tom="muted" onClick={() => comprar(o)} disabled={!comprador} title="Abaixo de um milhar: sai do bolso, sem registro na ficha">Consumir · do bolso</Botao>
                  break
                default:
                  botao = null
              }
            }
            return (
              <div key={o.key} data-oferta={o.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap', opacity: esgotado ? 0.55 : 1 }}>
                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <DetailLink id={r.id}>{r.nome}</DetailLink>
                    {o.estado ? <Chip>{o.estado}</Chip> : null}
                    {o.acao === 'comprar' && r.manutencao ? <Chip>{formatValorMoeda(r.manutencao)} / mês de manutenção</Chip> : null}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }} title={r.resumo}>
                    {r.marca ? <InlineFieldValue value={r.marca} /> : null}
                    {r.marca && r.resumo ? ' — ' : ''}
                    {r.resumo}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {formatValorMoeda(o.preco)}
                  <span style={{ color: 'var(--muted)' }}>{unidade}</span>
                </span>
                {esgotado ? <Chip tom="off">{o.disponivel ? 'esgotou hoje' : 'não tem hoje'}</Chip> : <Chip tom="accent">{restante === null ? '∞' : `×${restante}`}</Chip>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{botao}</div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
