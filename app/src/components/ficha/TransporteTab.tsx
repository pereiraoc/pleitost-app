// Aba TRANSPORTE (2026-09-08, POA 1987) — a malha de transportes como mapa de
// metrô: uma VISTA por cartão TRI (as linhas que aquele cartão abre, mais as
// que se pagam na mão), o cartão do herói, a legenda das linhas e a lista
// parada a parada da linha escolhida, com as baldeações. É transporte
// COLETIVO: carro, táxi, barqueiro e "a pé" não entram (report 2026-09-08).
// Tudo vem da vault: notas de Linha, bloco ```malha``` da nota do mapa,
// planos (Estilo de Vida do eixo transporte) e o `Recursos_do_Mundo` do herói.
import { useMemo, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { activeContextoDef } from '../../data/reskin'
import { useDetail } from '../../data/detail-context'
import { DetailLink } from '../DetailLink'
import { clip } from './bits'
import { parseRecurso } from '../../recursos/parse-recurso'
import { abaDoPapel, recursosDoFm } from '../../recursos/hero-recursos'
import { desenharMalha, linhasDoNivel, montarMalha, paradasComBaldeacao, type LinhaMalha, type Malha } from '../../transporte/malha'
import { MalhaMap } from './MalhaMap'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }
const CHIP: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', padding: '2px 7px', border: '1px solid var(--line2)', borderRadius: 3, whiteSpace: 'nowrap' }

function Swatch({ l }: { l: LinhaMalha }) {
  const dash = l.traco === 'tracejado' ? 'dashed' : l.traco === 'pontilhado' ? 'dotted' : 'solid'
  return (
    <span aria-hidden style={{ display: 'inline-block', width: 30, padding: '3px 2px', background: '#f4f0e6', borderRadius: 3, verticalAlign: 'middle', lineHeight: 0 }}>
      <span style={{ display: 'block', borderTop: `${Math.max(3, l.largura)}px ${dash} ${l.cor}` }} />
    </span>
  )
}

export function TransporteTab({ doc }: { doc: VaultDoc }) {
  const def = activeContextoDef()
  const cfg = def?.transporte
  const rcfg = def?.recursos
  const catalog = useCatalog()
  const detail = useDetail()
  const model = useHeroModel(doc, 'transporte')
  const estado = useMemo(() => recursosDoFm(model.fm), [model.fm])

  // docs: linhas + recursos (planos e veículos) + a nota do mapa
  const ids = useMemo(() => {
    if (!cfg) return []
    const out = [...(catalog.docsByType.get(cfg.categoria) ?? []), ...(catalog.docsByType.get('Recurso') ?? [])].map((e) => e.id)
    const mapa = catalog.resolve(cfg.mapa)
    if (mapa.kind === 'doc') out.push(mapa.id)
    return out
  }, [catalog, cfg])
  const docs = useDocs(ids)

  const dados = useMemo(() => {
    if (!cfg || !rcfg || !docs) return null
    const abaTransporte = abaDoPapel(rcfg, 'transporte')
    const planos = new Map<string, number>()
    const planosLista: { nome: string; nivel: number; id: string }[] = []
    for (const d of docs.values()) {
      if (d.type !== 'Recurso') continue
      const r = parseRecurso(d)
      if (!r || r.aba !== abaTransporte || r.tipo !== rcfg.tipos.estilo || !r.nivel) continue
      planos.set(r.nome, r.nivel)
      planosLista.push({ nome: r.nome, nivel: r.nivel, id: d.id })
    }
    planosLista.sort((a, b) => a.nivel - b.nivel)
    const malha = montarMalha(docs.values(), cfg, (nome) => planos.get(nome) ?? null)
    return { malha, planos, planosLista }
  }, [cfg, rcfg, docs])

  const planoAtual = estado.estilos.transporte
  const nivelAtual = (planoAtual && dados?.planos.get(planoAtual)) || 1
  // VISTAS = só os planos que alguma linha pede no `Acesso` (o TRI de verdade;
  // "A Pé" e o carro com motorista não são vistas de transporte público).
  const vistas = useMemo(() => {
    if (!dados) return []
    const pedidos = new Set(dados.malha.linhas.map((l) => l.nivel).filter((n): n is number => n !== null))
    return dados.planosLista.filter((p) => pedidos.has(p.nivel))
  }, [dados])
  const [vista, setVista] = useState<number | null>(null)
  // padrão: a maior vista que o plano do herói alcança; sem plano, a menor
  const vistaPadrao = [...vistas].reverse().find((v) => v.nivel <= nivelAtual)?.nivel ?? vistas[0]?.nivel ?? 1
  const nivelVista = vista ?? vistaPadrao
  const [selecionada, setSelecionada] = useState<string | null>(null)

  const visiveis = useMemo(() => (dados ? linhasDoNivel(dados.malha, nivelVista) : []), [dados, nivelVista])
  const desenho = useMemo(() => (dados ? desenharMalha(dados.malha, visiveis) : null), [dados, visiveis])

  if (!cfg || !rcfg) return null
  if (!dados || !desenho) {
    return <p style={MONO}>carregando a malha…</p>
  }
  const malha: Malha = dados.malha
  const idDe = (nome: string): string | null => {
    const r = catalog.resolve(nome)
    return r.kind === 'doc' ? r.id : null
  }
  const abrirParada = (nome: string) => {
    const id = idDe(nome)
    if (id && detail) detail.open({ kind: 'doc', id })
  }
  const linhaSel = selecionada ? malha.linhas.find((l) => l.id === selecionada) ?? null : null
  const fechadas = malha.linhas.filter((l) => l.fechada)
  // legenda AGRUPADA por modo, na ordem dos modos do contexto
  const ordemModo = new Map(cfg.modos.map((m, i) => [m.nome, i]))
  const grupos = [...visiveis.reduce((acc, l) => acc.set(l.modo, [...(acc.get(l.modo) ?? []), l]), new Map<string, LinhaMalha[]>())]
    .sort((a, b) => (ordemModo.get(a[0]) ?? 99) - (ordemModo.get(b[0]) ?? 99))
  // o cartão TRI do herói = a maior vista que o plano dele alcança (o plano
  // pode ser "a pé" ou "carro com motorista" — isso não é cartão)
  const cartao = [...vistas].reverse().find((v) => v.nivel <= nivelAtual) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* NA FICHA: o cartão TRI (transporte coletivo — carro e táxi ficam na aba Recursos) */}
      <section style={BOX} data-transporte-ficha="">
        <div style={MONO}>{'// NA FICHA'}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ ...MONO, minWidth: 90 }}>CARTÃO TRI</span>
          {cartao ? (
            <span data-cartao={cartao.nome}>
              <DetailLink id={cartao.id}>{cartao.nome}</DetailLink>
              {planoAtual && planoAtual !== cartao.nome && dados.planos.has(planoAtual) ? <span style={{ ...CHIP, marginLeft: 8 }}>{planoAtual}</span> : null}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }} data-cartao="">
              sem cartão{planoAtual && dados.planos.has(planoAtual) ? ` · ${planoAtual}` : ''}
            </span>
          )}
        </div>
      </section>

      {/* VISTA por plano */}
      <section style={BOX}>
        <div style={MONO}>{'// VISTA'}</div>
        <div role="radiogroup" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {vistas.map((p) => {
            const ativa = p.nivel === nivelVista
            return (
              <button
                key={p.nome}
                type="button"
                role="radio"
                aria-checked={ativa}
                data-vista={p.nivel}
                onClick={() => {
                  setVista(p.nivel)
                  setSelecionada(null)
                }}
                style={{
                  ...CHIP,
                  cursor: 'pointer',
                  background: ativa ? 'color-mix(in srgb,var(--accent) 18%,transparent)' : 'transparent',
                  borderColor: ativa ? 'var(--accent)' : 'var(--line2)',
                  color: 'inherit',
                }}
              >
                {p.nome}
              </button>
            )
          })}
        </div>
      </section>

      <MalhaMap desenho={desenho} selecionada={selecionada} onSelecionar={setSelecionada} onParada={abrirParada} />

      {/* LEGENDA */}
      <section style={BOX}>
        <div style={MONO}>{'// LINHAS NA VISTA'}</div>
        <div data-legenda="" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {grupos.map(([modo, ls]) => (
            <div key={modo} data-modo={modo}>
              <div style={{ ...MONO, fontSize: 10, margin: '0 0 3px 8px' }}>{`${modo.toUpperCase()} · ${ls.length}`}</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {ls.map((l) => {
                  const ativa = selecionada === l.id
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        data-linha={l.id}
                        aria-pressed={ativa}
                        onClick={() => setSelecionada(ativa ? null : l.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          textAlign: 'left',
                          background: ativa ? 'color-mix(in srgb,var(--accent) 12%,transparent)' : 'transparent',
                          border: 'none',
                          borderLeft: `3px solid ${ativa ? 'var(--accent)' : 'transparent'}`,
                          padding: '5px 8px',
                          color: 'inherit',
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                      >
                        <Swatch l={l} />
                        <b style={{ fontSize: 13 }}>{l.nome}</b>
                        <span style={{ ...CHIP, marginLeft: 'auto' }}>{l.acessoPlano ?? l.acesso}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
          {fechadas.map((l) => (
            <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', color: 'var(--muted)' }} data-linha-fechada={l.id}>
              <Swatch l={l} />
              <span style={{ fontSize: 13 }}>{l.nome}</span>
              <span style={{ ...CHIP, marginLeft: 'auto' }}>{l.acesso}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* PARADA A PARADA */}
      {linhaSel ? (
        <section style={BOX} data-parada-a-parada={linhaSel.id}>
          <div style={MONO}>{`// PARADA A PARADA · ${linhaSel.nome}`}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0 4px', flexWrap: 'wrap' }}>
            <DetailLink id={linhaSel.id}>{linhaSel.letreiro}</DetailLink>
            <span style={CHIP}>{linhaSel.modo}</span>
            <span style={CHIP}>{linhaSel.acessoPlano ?? linhaSel.acesso}</span>
            {linhaSel.horario ? <span style={MONO}>{linhaSel.horario}</span> : null}
          </div>
          <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 5 }} data-paradas="">
            {paradasComBaldeacao(malha, linhaSel, visiveis).map((p, i) => (
              <li key={`${i}:${p.nome}`}>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {idDe(p.nome) ? <DetailLink id={idDe(p.nome)!}>{p.nome}</DetailLink> : p.nome}
                  {p.baldeacoes.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      data-baldeacao={b.id}
                      onClick={() => setSelecionada(b.id)}
                      title={b.nome}
                      style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: 'transparent', borderColor: b.cor, borderLeftWidth: 6 }}
                    >
                      {b.nome}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
