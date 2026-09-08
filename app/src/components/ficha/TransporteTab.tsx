// Aba TRANSPORTE (2026-09-08, POA 1987) — a malha de transportes como mapa de
// metrô: uma VISTA por plano TRI (as linhas que aquele plano abre, mais as
// que se pagam na mão), o plano e os veículos do herói, a legenda das linhas
// e a lista parada a parada da linha escolhida, com as baldeações. Tudo vem da
// vault: notas de Linha, bloco ```malha``` da nota do mapa, planos (Estilo de
// Vida do eixo transporte) e o estado `Recursos_do_Mundo` do herói.
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
import { abaDoPapel, nomeNivel, recursosDoFm } from '../../recursos/hero-recursos'
import { desenharMalha, linhasDoNivel, montarMalha, paradasComBaldeacao, type LinhaMalha, type Malha } from '../../transporte/malha'
import { MalhaMap } from './MalhaMap'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }
const CHIP: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', padding: '2px 7px', border: '1px solid var(--line2)', borderRadius: 3, whiteSpace: 'nowrap' }

function Swatch({ l }: { l: LinhaMalha }) {
  const dash = l.traco === 'tracejado' ? 'dashed' : l.traco === 'pontilhado' ? 'dotted' : 'solid'
  return <span aria-hidden style={{ display: 'inline-block', width: 26, borderTop: `${Math.max(3, l.largura)}px ${dash} ${l.cor}`, verticalAlign: 'middle' }} />
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
    const veiculos = new Map<string, string>() // nome → id
    for (const d of docs.values()) {
      if (d.type !== 'Recurso') continue
      const r = parseRecurso(d)
      if (!r || r.aba !== abaTransporte) continue
      if (r.tipo === rcfg.tipos.estilo && r.nivel) {
        planos.set(r.nome, r.nivel)
        planosLista.push({ nome: r.nome, nivel: r.nivel, id: d.id })
      } else veiculos.set(r.nome, d.id)
    }
    planosLista.sort((a, b) => a.nivel - b.nivel)
    const malha = montarMalha(docs.values(), cfg, (nome) => planos.get(nome) ?? null)
    return { malha, planos, planosLista, veiculos, abaTransporte }
  }, [cfg, rcfg, docs])

  const planoAtual = estado.estilos.transporte
  const nivelAtual = (planoAtual && dados?.planos.get(planoAtual)) || 1
  const [vista, setVista] = useState<number | null>(null)
  const nivelVista = vista ?? nivelAtual
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
  const veiculosDoHeroi = estado.itens.filter((i) => i.aba === dados.abaTransporte)
  const fechadas = malha.linhas.filter((l) => l.fechada)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* NA FICHA: plano + veículos */}
      <section style={BOX} data-transporte-ficha="">
        <div style={MONO}>{'// NA FICHA'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ ...MONO, minWidth: 90 }}>PLANO</span>
            {planoAtual ? (
              <span data-plano={planoAtual}>
                {idDe(planoAtual) ? <DetailLink id={idDe(planoAtual)!}>{planoAtual}</DetailLink> : planoAtual}
                <span style={{ ...CHIP, marginLeft: 8 }}>{nomeNivel(rcfg, nivelAtual)}</span>
              </span>
            ) : (
              <span style={{ color: 'var(--muted)' }} data-plano="">
                {dados.planosLista[0]?.nome ?? nomeNivel(rcfg, 1)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ ...MONO, minWidth: 90 }}>VEÍCULOS</span>
            {veiculosDoHeroi.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }} data-veiculos="">
                {veiculosDoHeroi.map((v, i) => {
                  const id = dados.veiculos.get(v.nome)
                  return (
                    <li key={`${i}:${v.nome}`}>
                      {id ? <DetailLink id={id}>{v.nome}</DetailLink> : v.nome}
                      {v.estado ? <span style={{ ...CHIP, marginLeft: 8 }}>{v.estado}</span> : null}
                      {v.qtd > 1 ? <span style={{ ...MONO, marginLeft: 8 }}>×{v.qtd}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <span style={{ color: 'var(--muted)' }} data-veiculos="">
                —
              </span>
            )}
          </div>
        </div>
      </section>

      {/* VISTA por plano */}
      <section style={BOX}>
        <div style={MONO}>{'// VISTA'}</div>
        <div role="radiogroup" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {dados.planosLista.map((p) => {
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
                  color: 'var(--ink)',
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
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }} data-legenda="">
          {visiveis.map((l) => {
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
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <Swatch l={l} />
                  <b style={{ fontSize: 13 }}>{l.nome}</b>
                  <span style={MONO}>{l.modo}</span>
                  <span style={{ ...CHIP, marginLeft: 'auto' }}>{l.acessoPlano ?? l.acesso}</span>
                </button>
              </li>
            )
          })}
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
                      style={{ ...CHIP, cursor: 'pointer', color: 'var(--ink)', background: 'transparent', borderColor: b.cor, borderLeftWidth: 6 }}
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
