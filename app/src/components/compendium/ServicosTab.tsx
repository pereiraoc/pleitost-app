// Aba SERVIÇOS de uma Localização (2026-09-07b): a vitrine dos
// ESTABELECIMENTOS — este lugar (se lista ofertas no FM `cfg.ofertas.campo`)
// e os lugares-filhos que listam. Cada oferta é rolada por semente
// (estabelecimento + dia) com quantidade e disponibilidade conforme a linha
// da régua do bairro (Contexto `recursos.disponibilidade`), e o preço leva a
// régua (`matriz.preco`). Comprar grava no herói selecionado (topo direito)
// — o que se compra passa a aparecer na aba RECURSOS da ficha.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { activeContextoDef, reskinName } from '../../data/reskin'
import { formatValorMoeda, moedaFator } from '../../data/moeda'
import { localTypeOfDoc, matrizDoContexto, type LocalType } from '../../data/commerce'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { currentFm, heroOuro } from '../../data/purchase'
import { DetailLink } from '../DetailLink'
import { clip } from '../ficha/bits'
import { InlineFieldValue } from './InlineFieldValue'
import { useAtlasRelations } from './AtlasNav'
import { useHeroOptions } from './LocationSheet'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Recurso, RecursosCfg } from '../../recursos/types'
import { parseOfertas, rollOfertas, type OfertaRolada } from '../../recursos/ofertas'
import { comprarNoEstabelecimento, precoCompraImovel } from '../../recursos/comprar'
import { diaDeHoje, registrarVenda, useVendidasHoje } from '../../recursos/ofertas-store'
import { custoEmOuro, custoMensal, loteDeMiudeza, nomeNivel, recursosDoFm } from '../../recursos/hero-recursos'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '10px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }

function Botao({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
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
        background: disabled ? 'transparent' : 'color-mix(in srgb,var(--accent) 14%,transparent)',
        border: `1px solid ${disabled ? 'var(--line2)' : 'color-mix(in srgb,var(--accent) 45%,transparent)'}`,
        color: disabled ? 'var(--muted)' : 'var(--accent)',
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

interface Estabelecimento {
  doc: VaultDoc
  linha: LocalType | null
  ofertas: OfertaRolada[]
}

function ServicosCorpo({ doc, cfg }: { doc: VaultDoc; cfg: RecursosCfg }) {
  const catalog = useCatalog()
  const rel = useAtlasRelations(doc)
  const fator = moedaFator()
  const matriz = useMemo(() => matrizDoContexto(activeContextoDef()), [])
  // docs: este lugar + filhos (estabelecimentos) + ancestrais (linha da régua) + todas as notas de Recurso
  const recursoIds = useMemo(() => (catalog.docsByType.get('Recurso') ?? []).map((e) => e.id), [catalog])
  const ids = useMemo(() => [...new Set([doc.id, ...rel.children, ...rel.crumbs.map((c) => c.id), ...recursoIds])], [doc.id, rel, recursoIds])
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

  const linhaDeFallback = useMemo<LocalType | null>(() => {
    const propria = localTypeOfDoc(doc)
    if (propria) return propria
    if (!docs) return null
    for (let i = rel.crumbs.length - 1; i >= 0; i--) {
      const d = docs.get(rel.crumbs[i]!.id)
      const l = d ? localTypeOfDoc(d) : null
      if (l) return l
    }
    return null
  }, [doc, docs, rel])

  const estabelecimentos = useMemo<Estabelecimento[]>(() => {
    if (!docs) return []
    const dia = diaDeHoje()
    const out: Estabelecimento[] = []
    for (const id of [doc.id, ...rel.children]) {
      const d = id === doc.id ? doc : docs.get(id)
      if (!d) continue
      const ofertas = parseOfertas((d.frontmatter ?? {}) as Record<string, unknown>, cfg.ofertas.campo)
      if (!ofertas.length) continue
      const linha = localTypeOfDoc(d) ?? linhaDeFallback
      const mult = linha ? (matriz?.precos[linha] ?? 1) : 1
      out.push({ doc: d, linha, ofertas: rollOfertas(ofertas, porNome, linha, cfg, fator, mult, `${d.id}|${dia}`) })
    }
    return out
  }, [docs, doc, rel, cfg, porNome, linhaDeFallback, matriz, fator])

  // comprador = herói selecionado no topo direito (mesma regra da loja)
  const heroes = useHeroOptions()
  const selectedCreatureId = useSelectedCreature()
  const hero = heroes.find((h) => h.entry.id === selectedCreatureId)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const ouro = hero ? heroOuro(hero.entry.id, hero.doc) : null
  const classeAlimentacao = useMemo(() => {
    if (!hero) return 1
    void tick
    const r = recursosDoFm(currentFm(hero.entry.id, hero.doc))
    return custoMensal(r, porNome, fator, cfg).eixos.find((e) => e.papel === 'alimentacao')?.nivel ?? 1
  }, [hero, porNome, fator, cfg, tick])

  if (!docs) return <div style={{ ...MONO, padding: 12 }}>{'// CARREGANDO SERVIÇOS…'}</div>
  if (!estabelecimentos.length) {
    return (
      <div style={{ ...BOX, border: '1px dashed var(--line2)', textAlign: 'center', padding: 36 }}>
        <span style={MONO}>{`// NENHUM ESTABELECIMENTO COM ${cfg.ofertas.campo.toUpperCase()} AQUI`}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={MONO}>COMPRADOR</span>
        {hero ? (
          <>
            <b style={{ fontSize: 13 }}>{reskinName(hero.entry.basename ?? hero.entry.id)}</b>
            <Chip>{formatValorMoeda((ouro ?? 0) * fator)}</Chip>
            <Chip>alimentação classe {classeAlimentacao} · {nomeNivel(cfg, classeAlimentacao)}</Chip>
          </>
        ) : (
          <span style={{ ...MONO, color: 'var(--text)' }}>escolha um herói no topo direito pra comprar</span>
        )}
        {aviso ? (
          <span role="status" style={{ ...MONO, color: 'var(--text)', marginLeft: 'auto' }}>
            {aviso}
          </span>
        ) : null}
      </div>
      {estabelecimentos.map((e) => (
        <EstabelecimentoBox
          key={e.doc.id}
          e={e}
          cfg={cfg}
          fator={fator}
          rotulo={e.linha ? (matriz?.rotulos[e.linha] ?? e.linha) : null}
          mult={e.linha ? (matriz?.precos[e.linha] ?? 1) : 1}
          comprador={hero ? { id: hero.entry.id, doc: hero.doc, ouro: ouro ?? 0 } : null}
          classeAlimentacao={classeAlimentacao}
          onResultado={(msg) => {
            setAviso(msg)
            setTick((t) => t + 1)
          }}
        />
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
  classeAlimentacao,
  onResultado,
}: {
  e: Estabelecimento
  cfg: RecursosCfg
  fator: number
  rotulo: string | null
  mult: number
  comprador: { id: string; doc: VaultDoc | undefined; ouro: number } | null
  classeAlimentacao: number
  onResultado: (msg: string) => void
}) {
  const vendidas = useVendidasHoje(e.doc.id)
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

  const comprar = (o: OfertaRolada, opts: { comprarImovel?: boolean } = {}) => {
    if (!comprador) {
      onResultado('Escolha um herói no topo direito pra comprar.')
      return
    }
    const r = comprarNoEstabelecimento(comprador.id, comprador.doc, cfg, fator, o, { mult, classeAlimentacao, ...opts })
    if (r.ok && r.vendidas > 0 && o.qtd !== null) registrarVenda(e.doc.id, o.key, r.vendidas)
    onResultado(r.msg)
  }

  return (
    <section style={BOX} data-estabelecimento={e.doc.basename}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>
          <DetailLink id={e.doc.id}>{reskinName(e.doc.basename)}</DetailLink>
        </b>
        {geo ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <InlineFieldValue value={geo} />
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {rotulo ? <Chip>{rotulo} ×{String(mult).replace('.', ',')}</Chip> : null}
      </div>
      {grupos.map(([tipo, lista]) => (
        <div key={tipo} style={{ marginTop: 6 }}>
          <div style={{ ...MONO, margin: '6px 0 2px' }}>{tipo.toUpperCase()}</div>
          {lista.map((o) => {
            const restante = o.qtd === null ? null : Math.max(0, o.qtd - (vendidas[o.key] ?? 0))
            const esgotado = !o.disponivel || restante === 0
            const r = o.recurso
            const unidade = r.cobranca && r.cobranca !== 'única' ? ` / ${r.cobranca}` : ''
            const pc = o.acao === 'alugar' ? precoCompraImovel(o, mult) : null
            let botoes: ReactNode = null
            if (!esgotado) {
              switch (o.acao) {
                case 'recarga':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador || comprador.ouro < custoEmOuro(o.preco, fator)}>Recarregar TRI +{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'tri':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador} title="Sai do saldo TRI do herói">Usar TRI −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'comprar':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador || comprador.ouro < custoEmOuro(o.preco, fator)}>Comprar{o.estado ? ` ${o.estado}` : ''} −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'diaria':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador || comprador.ouro < custoEmOuro(o.preco, fator)}>1 dia −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'alugar':
                  botoes = (
                    <>
                      <Botao onClick={() => comprar(o)} disabled={!comprador}>Alugar {formatValorMoeda(o.preco)} / mês</Botao>
                      {pc !== null ? (
                        <Botao onClick={() => comprar(o, { comprarImovel: true })} disabled={!comprador || comprador.ouro < custoEmOuro(pc, fator)}>Comprar −{formatValorMoeda(pc)}</Botao>
                      ) : null}
                    </>
                  )
                  break
                case 'hospedar':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador}>Hospedar {formatValorMoeda(o.preco)} / noite</Botao>
                  break
                case 'avista':
                  botoes = <Botao onClick={() => comprar(o)} disabled={!comprador || comprador.ouro < custoEmOuro(o.preco, fator)}>Comprar −{formatValorMoeda(o.preco)}</Botao>
                  break
                case 'miudeza': {
                  const dentro = r.nivel !== undefined && r.nivel <= classeAlimentacao && cfg.abas.find((a) => a.nome === r.aba)?.papel === 'alimentacao'
                  const lote = loteDeMiudeza(o.preco, fator)
                  botoes = dentro ? (
                    <Botao onClick={() => comprar(o)} disabled={!comprador} title="Está no seu estilo de vida">No seu estilo</Botao>
                  ) : (
                    <Botao onClick={() => comprar(o)} disabled={!comprador || comprador.ouro < 1} title={`Lote de ${lote} por ${formatValorMoeda(lote * o.preco)}`}>Lote de {lote} −{formatValorMoeda(lote * o.preco)}</Botao>
                  )
                  break
                }
                default:
                  botoes = null
              }
            }
            return (
              <div key={o.key} data-oferta={o.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap', opacity: esgotado ? 0.55 : 1 }}>
                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <DetailLink id={r.id}>{r.nome}</DetailLink>
                    {o.estado ? <Chip>{o.estado}</Chip> : null}
                    {r.nivel !== undefined ? <Chip>classe {r.nivel}</Chip> : null}
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{botoes}</div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
