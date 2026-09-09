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
import { DetailLink } from '../DetailLink'
import { clip } from './bits'
import { parseRecurso } from '../../recursos/parse-recurso'
import { abaDoPapel, recursosDoFm } from '../../recursos/hero-recursos'
import { desenharMalha, linhasDoFiltro, montarMalha, paradasComBaldeacao, zonasDeBairro, type LinhaMalha, type Malha } from '../../transporte/malha'
import { MalhaMap, TracoAmostra, type Destaque } from './MalhaMap'
import { formatValorMoeda } from '../../data/moeda'
import { calcularRotas, formatarMinutos, rotaAPe, type PosicaoReal, type Rota } from '../../transporte/rotas'
import { paradasSelectLines } from '../../transporte/paradas-select'
import { BoxSelect } from './PerfilTab'

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }
const CHIP: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', padding: '2px 7px', border: '1px solid var(--line2)', borderRadius: 3, whiteSpace: 'nowrap' }

/** Chip do que abre a linha: o cartão TRI, ou o VALOR da tarifa avulsa quando
 *  se paga na mão (a observação de pagamento vai como nota embaixo). */
function AcessoChip({ l, tarifas }: { l: LinhaMalha; tarifas: Map<string, { preco: number; cobranca: string }> }) {
  if (l.acessoPlano) return <span style={CHIP}>{l.acessoPlano}</span>
  const t = l.tarifa ? tarifas.get(l.tarifa) : undefined
  return <span style={CHIP} data-valor={t ? t.preco : ''}>{t ? `${formatValorMoeda(t.preco)} · ${t.cobranca}` : 'na mão'}</span>
}
/** Nota de pagamento (texto livre do `Acesso`) — só quando não é cartão. */
function AcessoNota({ l }: { l: LinhaMalha }) {
  if (l.acessoPlano || !l.acesso) return null
  return (
    <div data-nota-acesso="" style={{ ...MONO, fontSize: 10, letterSpacing: '.06em', textTransform: 'none', marginTop: 2 }}>
      {l.acesso}
    </div>
  )
}

/** Itinerário passo a passo de uma rota (estilo Google Maps): embarque e
 *  espera, a linha com os trechos e o tempo, onde descer, baldeação. Cada
 *  perna tem a barra na cor da linha; as paradas intermediárias vão em nota. */
function Itinerario({ rota, origem, destino }: { rota: Rota; origem: string | null; destino: string | null }) {
  const passo: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start' }
  const ponta = (letra: string) => (
    <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--text)', color: 'var(--panel)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 1 }}>
      {letra}
    </span>
  )
  return (
    <ol data-itinerario="" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <li style={passo} data-passo="embarque">
        {ponta('A')}
        <span>
          <b style={{ fontSize: 12.5 }}>{origem}</b>
          <span style={{ ...MONO, marginLeft: 8 }}>{`espera ${formatarMinutos(rota.pernas[0]?.espera ?? 0)}`}</span>
        </span>
      </li>
      {rota.pernas.map((pe, k) => {
        const meio = pe.paradas.slice(1, -1)
        const desce = pe.paradas[pe.paradas.length - 1]
        return (
          <li key={`${k}:${pe.linha.id}`} data-perna={pe.linha.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ ...passo, borderLeft: `5px solid ${pe.linha.cor}`, paddingLeft: 10, marginLeft: 6 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TracoAmostra cor={pe.linha.cor} traco={pe.linha.traco} largura={pe.linha.largura} />
                  <b style={{ fontSize: 12.5 }}>{pe.linha.nome}</b>
                  <span style={MONO}>{pe.linha.modo}</span>
                </span>
                <span style={{ fontSize: 12.5 }}>
                  {`${pe.paradas.length - 1} ${pe.paradas.length - 1 === 1 ? 'trecho' : 'trechos'} · ${formatarMinutos(pe.viagem)}`}
                  {meio.length ? <span style={{ color: 'var(--muted)' }}>{` · via ${meio.join(', ')}`}</span> : null}
                </span>
                <span style={{ fontSize: 12.5 }}>
                  {'desce em '}
                  <b>{desce}</b>
                </span>
              </span>
            </div>
            {k < rota.pernas.length - 1 ? (
              <div style={{ ...passo, marginLeft: 6, paddingLeft: 10, borderLeft: '5px dotted var(--line2)' }} data-passo="baldeacao">
                <span style={{ ...MONO, textTransform: 'none' }}>{`baldeação ${formatarMinutos(rota.pernas[k + 1]!.baldeacao)} · espera ${formatarMinutos(rota.pernas[k + 1]!.espera)} pela ${rota.pernas[k + 1]!.linha.nome}`}</span>
              </div>
            ) : null}
          </li>
        )
      })}
      <li style={passo} data-passo="chegada">
        {ponta('B')}
        <b style={{ fontSize: 12.5 }}>{destino}</b>
      </li>
    </ol>
  )
}

export function TransporteTab({ doc }: { doc: VaultDoc }) {
  const def = activeContextoDef()
  const cfg = def?.transporte
  const rcfg = def?.recursos
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'transporte')
  const estado = useMemo(() => recursosDoFm(model.fm), [model.fm])

  // docs: linhas + recursos (planos e veículos) + a nota do mapa
  const ids = useMemo(() => {
    if (!cfg) return []
    const out = [...(catalog.docsByType.get(cfg.categoria) ?? []), ...(catalog.docsByType.get('Recurso') ?? [])].map((e) => e.id)
    const mapa = catalog.resolve(cfg.mapa)
    if (mapa.kind === 'doc') out.push(mapa.id)
    if (cfg.cidade) {
      const cidade = catalog.resolve(cfg.cidade)
      if (cidade.kind === 'doc') out.push(cidade.id)
    }
    return out
  }, [catalog, cfg])
  const docs = useDocs(ids)

  const dados = useMemo(() => {
    if (!cfg || !rcfg || !docs) return null
    const abaTransporte = abaDoPapel(rcfg, 'transporte')
    const planos = new Map<string, number>()
    const planosLista: { nome: string; nivel: number; id: string }[] = []
    const tarifas = new Map<string, { preco: number; cobranca: string }>()
    for (const d of docs.values()) {
      if (d.type !== 'Recurso') continue
      const r = parseRecurso(d)
      if (!r || r.aba !== abaTransporte) continue
      if (r.tipo === rcfg.tipos.estilo && r.nivel) {
        planos.set(r.nome, r.nivel)
        planosLista.push({ nome: r.nome, nivel: r.nivel, id: d.id })
      } else tarifas.set(r.nome, { preco: r.preco, cobranca: r.cobranca })
    }
    planosLista.sort((a, b) => a.nivel - b.nivel)
    const malha = montarMalha(docs.values(), cfg, (nome) => planos.get(nome) ?? null)
    // planejador: posição real das paradas = marcadores do mapa da cidade
    const posicoes = new Map<string, PosicaoReal>()
    let metrosPorUnidade = 0
    if (cfg.cidade) {
      const cidade = [...docs.values()].find((d) => d.basename === cfg.cidade)
      const leaflet = cidade?.locationBody?.leaflet
      if (leaflet?.scale) metrosPorUnidade = leaflet.scale
      for (const m of leaflet?.markers ?? []) if (!posicoes.has(m.nome)) posicoes.set(m.nome, { lat: m.lat, long: m.long })
    }
    return { malha, planos, planosLista, tarifas, posicoes, metrosPorUnidade }
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
  // FILTRO (2026-09-09): além do cartão, o jogador liga/desliga MODOS e troca
  // "o que este cartão abre" (cumulativo) por "só as linhas deste cartão".
  // O mapa e o TRAJETO leem o mesmo filtro — é o ponto do pedido.
  const [modos, setModos] = useState<string[]>([])
  const [exato, setExato] = useState(false)
  // padrão: a maior vista que o plano do herói alcança; sem plano, a menor
  const vistaPadrao = [...vistas].reverse().find((v) => v.nivel <= nivelAtual)?.nivel ?? vistas[0]?.nivel ?? 1
  const nivelVista = vista ?? vistaPadrao
  const [selecionada, setSelecionada] = useState<string | null>(null)
  // planejador: de onde, pra onde, período do dia, rota escolhida
  const [origem, setOrigem] = useState<string | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<number | null>(null)
  const [rotaSel, setRotaSel] = useState(0)

  const visiveis = useMemo(
    () => (dados ? linhasDoFiltro(dados.malha, { modos, nivel: nivelVista, exato }) : []),
    [dados, nivelVista, modos, exato],
  )
  /** Modos que a malha tem, na ordem que o contexto declara. */
  const modosDaMalha = useMemo(() => {
    if (!dados) return []
    const tem = new Set(dados.malha.linhas.filter((l) => !l.fechada).map((l) => l.modo))
    return (cfg?.modos ?? []).map((m) => m.nome).filter((n) => tem.has(n))
  }, [dados, cfg])
  const desenho = useMemo(() => (dados ? desenharMalha(dados.malha, visiveis) : null), [dados, visiveis])
  const periodos = cfg?.periodos ?? []
  const periodoIdx = periodo ?? Math.max(0, periodos.findIndex((p) => p.transito === 1))
  const podePlanejar = !!dados && dados.metrosPorUnidade > 0 && dados.posicoes.size > 0
  const rotas = useMemo<Rota[]>(() => {
    if (!dados || !cfg || !podePlanejar || !origem || !destino) return []
    return calcularRotas(dados.malha, visiveis, origem, destino, { cfg, metrosPorUnidade: dados.metrosPorUnidade, posicoes: dados.posicoes, transito: periodos[periodoIdx]?.transito ?? 1 })
  }, [dados, cfg, podePlanejar, origem, destino, visiveis, periodos, periodoIdx])
  // Sem caminho NO FILTRO, o trecho se faz a pé — estimado pelo que a malha
  // inteira levaria (ver rotaAPe). Só entra quando não há rota nenhuma.
  const aPe = useMemo(() => {
    if (!dados || !cfg || !podePlanejar || !origem || !destino || rotas.length) return null
    const todas = dados.malha.linhas.filter((l) => !l.fechada)
    return rotaAPe(todas, origem, destino, { cfg, metrosPorUnidade: dados.metrosPorUnidade, posicoes: dados.posicoes, transito: periodos[periodoIdx]?.transito ?? 1 })
  }, [dados, cfg, podePlanejar, origem, destino, rotas, periodos, periodoIdx])
  const rota = rotas[Math.min(rotaSel, Math.max(0, rotas.length - 1))] ?? aPe
  const destaque: Destaque | null = origem || destino ? { linhas: rota?.linhas ?? [], paradas: rota?.paradas ?? [origem, destino].filter((x): x is string => !!x), origem, destino } : null

  if (!cfg || !rcfg) return null
  if (!dados || !desenho) {
    return <p style={MONO}>carregando a malha…</p>
  }
  const malha: Malha = dados.malha
  const idDe = (nome: string): string | null => {
    const r = catalog.resolve(nome)
    return r.kind === 'doc' ? r.id : null
  }
  // bairro da parada = a pasta dela no Atlas (a nota de bairro é a pasta dela mesma)
  const bairroDe = (nome: string): string | null => {
    const id = idDe(nome)
    const partes = id?.split('/') ?? []
    return partes.length >= 2 ? partes[partes.length - 2]! : null
  }
  const bairros = zonasDeBairro(desenho, bairroDe)
  /** Clique numa parada do mapa: primeiro marca DE, depois PARA; o terceiro recomeça. */
  const marcarParada = (nome: string) => {
    setRotaSel(0)
    if (!origem || (origem && destino)) {
      setOrigem(nome)
      setDestino(null)
    } else if (nome !== origem) setDestino(nome)
  }
  // DE/PARA: seletor hierárquico do Atlas (como a naturalidade), só com as paradas da vista
  const opcoesSelect = paradasSelectLines(desenho.paradas.map((p) => ({ nome: p.nome, id: idDe(p.nome) ?? p.nome }))).map((l, i) => ({ value: l.value === null ? `__h${i}` : l.value, label: l.label, disabled: l.disabled }))
  const caixa = (icone: string, valor: string | null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(8) }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${icone} ${valor || '—'}`}</span>
      <span style={{ color: 'var(--muted)' }}>▾</span>
    </div>
  )
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

      {/* FILTRO: cartão (por plano ou exato) + modos. O mapa e o trajeto usam. */}
      <section style={BOX} data-filtro="">
        <div style={{ ...MONO, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{'// FILTRO'}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-exato={exato ? 'sim' : 'nao'}
            aria-pressed={exato}
            onClick={() => { setExato((v) => !v); setSelecionada(null) }}
            title={exato ? 'Mostrando só as linhas deste cartão' : 'Mostrando tudo que este cartão abre (o Ouro abre o do Prata e o do Bronze)'}
            style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: exato ? 'color-mix(in srgb,var(--accent) 18%,transparent)' : 'transparent', borderColor: exato ? 'var(--accent)' : 'var(--line2)' }}
          >
            {exato ? 'só este cartão' : 'o que o cartão abre'}
          </button>
        </div>
        <div role="radiogroup" aria-label="Cartão" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
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
        {modosDaMalha.length > 1 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }} data-modos="">
            <span style={{ ...MONO, marginRight: 4 }}>MODO</span>
            {modosDaMalha.map((m) => {
              const ligado = modos.length === 0 || modos.includes(m)
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={ligado}
                  data-modo-filtro={m}
                  onClick={() => {
                    setModos((atual) => {
                      const base = atual.length ? atual : modosDaMalha
                      const novo = base.includes(m) ? base.filter((x) => x !== m) : [...base, m]
                      return novo.length === modosDaMalha.length ? [] : novo
                    })
                    setSelecionada(null)
                  }}
                  style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: ligado ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent', borderColor: ligado ? 'var(--accent)' : 'var(--line2)', opacity: ligado ? 1 : 0.55 }}
                >
                  {m}
                </button>
              )
            })}
            {modos.length ? (
              <button type="button" data-modos-todos="" onClick={() => { setModos([]); setSelecionada(null) }} style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: 'transparent' }}>
                todos
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* PLANEJADOR: de onde pra onde, no cartão da vista, no período escolhido */}
      {podePlanejar ? (
        <section style={BOX} data-planejador="">
          <div style={MONO}>{'// TRAJETO'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 220px', minWidth: 0 }} data-origem="">
              <span style={{ ...MONO, minWidth: 36 }}>DE</span>
              <BoxSelect ariaLabel="De onde" display={caixa('🚏', origem)} options={opcoesSelect} value={origem ?? ''} onChange={(v) => { setOrigem(v || null); setRotaSel(0) }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 220px', minWidth: 0 }} data-destino="">
              <span style={{ ...MONO, minWidth: 36 }}>PARA</span>
              <BoxSelect ariaLabel="Pra onde" display={caixa('🏁', destino)} options={opcoesSelect} value={destino ?? ''} onChange={(v) => { setDestino(v || null); setRotaSel(0) }} />
            </div>
            <button type="button" data-inverter="" aria-label="Inverter origem e destino" onClick={() => { setOrigem(destino); setDestino(origem); setRotaSel(0) }} style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: 'transparent' }}>
              ⇄
            </button>
            <button type="button" data-limpar="" onClick={() => { setOrigem(null); setDestino(null); setRotaSel(0) }} style={{ ...CHIP, cursor: 'pointer', color: 'inherit', background: 'transparent' }}>
              limpar
            </button>
            {periodos.length ? (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={MONO}>HORA</span>
                <select data-periodo="" value={periodoIdx} onChange={(e) => setPeriodo(Number(e.target.value))} style={{ font: 'inherit', padding: '4px 6px', background: 'var(--panel)', border: '1px solid var(--line2)', color: 'inherit' }}>
                  {periodos.map((p, i) => (
                    <option key={p.nome} value={i}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div style={{ ...MONO, fontSize: 10, marginTop: 6, textTransform: 'none', letterSpacing: '.06em' }}>
            clique numa parada do mapa pra marcar de onde (A) e pra onde (B) · com o cartão {vistas.find((v) => v.nivel === nivelVista)?.nome ?? ''}
            {exato ? ' (só as linhas dele)' : ''}
            {modos.length ? ` · só ${modos.join(', ')}` : ''}
          </div>
          {origem && destino ? (
            rotas.length ? (
              <ol data-rotas="" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rotas.map((r, i) => {
                  const ativa = i === rotaSel
                  const baldeacoes = r.pernas.length - 1
                  return (
                    <li key={r.linhas.join('>')}>
                      <button
                        type="button"
                        data-rota={i}
                        aria-pressed={ativa}
                        onClick={() => setRotaSel(i)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: '8px 10px', background: ativa ? 'color-mix(in srgb,var(--accent) 12%,transparent)' : 'transparent', border: '1px solid var(--line2)', borderLeft: `3px solid ${ativa ? 'var(--accent)' : 'var(--line2)'}` }}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <b style={{ fontSize: 15 }} data-minutos={r.minutos}>{formatarMinutos(r.minutos)}</b>
                          <span style={MONO}>{baldeacoes === 0 ? 'direto' : baldeacoes === 1 ? '1 baldeação' : `${baldeacoes} baldeações`}</span>
                          <span style={MONO}>{`${r.km.toLocaleString('pt-BR')} km`}</span>
                        </div>
                        <Itinerario rota={r} origem={origem} destino={destino} />
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : aPe ? (
              // Sem caminho no filtro, sobra o pé. O tempo é estimado pelo que
              // a malha inteira levaria × o fator do contexto — não é um
              // traçado de pedestre, e o texto diz isso.
              <div data-a-pe="" style={{ marginTop: 10, padding: '8px 10px', border: '1px dashed var(--line2)', borderLeft: '3px solid var(--muted)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 15 }} data-minutos={aPe.minutos}>{formatarMinutos(aPe.minutos)}</b>
                  <span style={MONO}>a pé</span>
                  <span style={MONO}>{`${aPe.km.toLocaleString('pt-BR')} km`}</span>
                </div>
                <div style={{ ...MONO, fontSize: 10, marginTop: 4, textTransform: 'none', letterSpacing: '.06em' }}>
                  nenhuma linha do filtro liga estes dois pontos — estimativa de caminhada, não trajeto de rua
                </div>
              </div>
            ) : (
              <p data-sem-rota="" style={{ ...MONO, marginTop: 10, textTransform: 'none' }}>
                sem trajeto com este filtro — troque o cartão, os modos ou os pontos
              </p>
            )
          ) : null}
        </section>
      ) : null}

      <MalhaMap desenho={desenho} bairros={bairros} selecionada={selecionada} destaque={destaque} onSelecionar={setSelecionada} onParada={marcarParada} />

      {/* LEGENDA */}
      <section style={BOX}>
        <div style={MONO}>{'// LINHAS NO FILTRO'}</div>
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
                        <TracoAmostra cor={l.cor} traco={l.traco} largura={l.largura} />
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <b style={{ fontSize: 13 }}>{l.nome}</b>
                          <AcessoNota l={l} />
                        </span>
                        <span style={{ marginLeft: 'auto' }}>
                          <AcessoChip l={l} tarifas={dados.tarifas} />
                        </span>
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
              <TracoAmostra cor={l.cor} traco={l.traco} largura={l.largura} />
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
            <AcessoChip l={linhaSel} tarifas={dados.tarifas} />
            {linhaSel.horario ? <span style={MONO}>{linhaSel.horario}</span> : null}
          </div>
          <AcessoNota l={linhaSel} />
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
