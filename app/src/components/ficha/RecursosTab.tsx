// Aba RECURSOS da ficha (2026-09-07b) — em cima o CUSTO DE VIDA: três eixos
// (transporte, moradia, alimentação) escolhidos entre os estilos do mundo
// (notas `Tipo = cfg.tipos.estilo`, uma por classe), com o total do mês bem
// claro; embaixo, por aba, SÓ o que o herói tem (TRI, veículos, moradia,
// estoque). Comprar é nos estabelecimentos (aba Serviços dos locais).
// Linguagem visual das outras abas (TabStrip, painéis cortados, rótulos
// mono); dados inteiros da vault; regra de dinheiro em src/recursos.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { activeContextoDef } from '../../data/reskin'
import { formatValorMoeda, moedaFator, moedaNumero } from '../../data/moeda'
import { DetailLink } from '../DetailLink'
import { clip, TabStrip } from './bits'
import { fmPath, num } from './hero-model'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Papel, Recurso, RecursosCfg } from '../../recursos/types'
import {
  OURO_FM,
  PAPEIS,
  RECURSOS_FM,
  abaDoPapel,
  acaoDe,
  consumirItem,
  custoMensal,
  escolherEstilo,
  fecharMes,
  isEstilo,
  morarNoProprio,
  nomeNivel,
  papelDaAba,
  recursosDoFm,
  sairDaMoradia,
  usarPassagem,
  venderItem,
  type RecursosDoHeroi,
  type Resultado,
} from '../../recursos/hero-recursos'

/* ───────────────────────── estilos ───────────────────────── */

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }

/** Linha da tabela de estilos: [seletor] [nome + descrição] [dinheiro]. A
 *  coluna do dinheiro tem largura fixa → valores alinhados em todos os
 *  eixos; a linha inteira é clicável e a marcada ganha fundo e borda. */
const LINHA: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '22px minmax(0,1fr) 120px',
  alignItems: 'center',
  gap: 10,
  padding: '7px 10px',
  borderTop: '1px solid var(--line)',
  borderLeft: '3px solid transparent',
  cursor: 'pointer',
}
const LINHA_MARCADA: CSSProperties = {
  background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
  borderLeft: '3px solid var(--accent)',
}
const DINHEIRO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }

function Radio({ marcado }: { marcado: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: `2px solid ${marcado ? 'var(--accent)' : 'var(--line2)'}`,
        background: marcado ? 'radial-gradient(circle, var(--accent) 45%, transparent 50%)' : 'transparent',
        display: 'inline-block',
      }}
    />
  )
}

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 9px' }}>
      <span style={{ ...MONO, letterSpacing: '.16em' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

function Botao({ children, onClick, disabled, title, tom = 'accent', ativo }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; tom?: 'accent' | 'muted'; ativo?: boolean }) {
  const cor = tom === 'accent' ? 'var(--accent)' : 'var(--muted)'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ativo}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        padding: '5px 9px',
        whiteSpace: 'nowrap',
        background: ativo ? `color-mix(in srgb,${cor} 28%,transparent)` : disabled ? 'transparent' : `color-mix(in srgb,${cor} 10%,transparent)`,
        border: `1px solid ${ativo ? cor : disabled ? 'var(--line2)' : `color-mix(in srgb,${cor} 45%,transparent)`}`,
        color: disabled ? 'var(--muted)' : ativo ? 'var(--text)' : cor,
        clipPath: clip(5),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}
function Chip({ children }: { children: ReactNode }) {
  return <span style={{ ...MONO, fontSize: 10, padding: '2px 6px', border: '1px solid var(--line2)', whiteSpace: 'nowrap' }}>{children}</span>
}
function Vazio({ children }: { children: ReactNode }) {
  return <div style={{ ...MONO, padding: '10px 0' }}>{children}</div>
}

/* ───────────────────────── dados ───────────────────────── */

function useRecursosDoMundo(cfg: RecursosCfg) {
  const catalog = useCatalog()
  const entradas = catalog.docsByType.get('Recurso') ?? []
  const ids = useMemo(() => entradas.map((e) => e.id), [entradas])
  const docs = useDocs(ids)
  return useMemo(() => {
    const recursos: Recurso[] = []
    if (!docs) return { carregando: true, recursos, porNome: new Map<string, Recurso>() }
    for (const e of entradas) {
      const d = docs.get(e.id)
      const r = d ? parseRecurso(d) : null
      if (r && cfg.abas.some((a) => a.nome === r.aba)) recursos.push(r)
    }
    return { carregando: false, recursos, porNome: new Map(recursos.map((r) => [r.nome, r])) }
  }, [docs, entradas, cfg])
}

/* ───────────────────────── aba ───────────────────────── */

export function RecursosTab({ doc }: { doc: VaultDoc }) {
  const cfg = activeContextoDef()?.recursos
  if (!cfg) {
    return (
      <div style={{ ...BOX, textAlign: 'center', padding: 44, border: '1px dashed var(--line2)' }}>
        <span style={MONO}>{'// ESTE MUNDO NÃO DECLARA RECURSOS'}</span>
      </div>
    )
  }
  return <RecursosCorpo doc={doc} cfg={cfg} />
}

type Aplicar = (res: Resultado | null, msg: string, falha?: string) => void

function RecursosCorpo({ doc, cfg }: { doc: VaultDoc; cfg: RecursosCfg }) {
  const model = useHeroModel(doc, 'recursos')
  const fm = model.fm
  const ouro = num(fmPath(fm, 'Inventario', 'Ouro'))
  const estado = useMemo(() => recursosDoFm(fm), [fm])
  const fator = moedaFator()
  const { carregando, recursos, porNome } = useRecursosDoMundo(cfg)
  const [aba, setAba] = useState(cfg.abas[0]?.nome ?? '')
  const [aviso, setAviso] = useState<string | null>(null)
  const custo = useMemo(() => custoMensal(estado, porNome, fator, cfg), [estado, porNome, fator, cfg])

  const aplicar: Aplicar = (res, msg, falha = 'Ouro insuficiente.') => {
    if (!res) {
      setAviso(falha)
      return
    }
    model.set(RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
    if (res.ouro !== undefined) model.set(OURO_FM, res.ouro)
    setAviso(msg)
  }

  const estilosPorPapel = useMemo(() => {
    const m = new Map<Papel, Recurso[]>()
    for (const p of PAPEIS) m.set(p, [])
    for (const r of recursos) {
      if (!isEstilo(cfg, r)) continue
      const p = papelDaAba(cfg, r.aba)
      if (p) m.get(p)!.push(r)
    }
    for (const l of m.values()) l.sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0))
    return m
  }, [recursos, cfg])

  const papelDaAbaAtual = papelDaAba(cfg, aba)

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section>
        <SectionHead label="// CUSTO DE VIDA" />
        <div style={{ ...BOX, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {carregando ? <Vazio>{'// CARREGANDO ESTILOS…'}</Vazio> : null}
          {PAPEIS.map((papel) => {
            const eixo = custo.eixos.find((e) => e.papel === papel)!
            const lista = estilosPorPapel.get(papel) ?? []
            const nomeAba = abaDoPapel(cfg, papel) ?? papel
            const especifica = papel === 'moradia' && estado.moradia
            const escolhido = eixo.nome ? porNome.get(eixo.nome) : undefined
            return (
              <div key={papel} data-eixo={papel} style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingBottom: 6 }}>
                {/* cabeçalho do eixo: nome à esquerda, valor do mês na coluna do dinheiro */}
                <div style={{ ...LINHA, borderTop: 'none', background: 'transparent', cursor: 'default' }}>
                  <span />
                  <span style={{ ...MONO, color: 'var(--text)' }}>
                    {nomeAba.toUpperCase()} <span style={{ color: 'var(--muted)' }}>· classe {eixo.nivel} · {nomeNivel(cfg, eixo.nivel)}</span>
                  </span>
                  <span style={{ ...DINHEIRO, color: 'var(--accent)', fontWeight: 700 }} data-eixo-valor={eixo.valor}>
                    {formatValorMoeda(eixo.valor)}
                  </span>
                </div>
                {especifica ? (
                  <div style={{ ...LINHA, ...LINHA_MARCADA }} aria-checked="true" role="radio">
                    <Radio marcado />
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                      {escolhido ? <DetailLink id={escolhido.id}>{escolhido.nome}</DetailLink> : <span>{estado.moradia!.nome}</span>}
                      <Chip>{estado.moradia!.modo === 'propria' ? 'imóvel próprio' : estado.moradia!.modo === 'hotel' ? 'hotel · 30 noites' : 'aluguel'}</Chip>
                      <Botao tom="muted" onClick={() => aplicar(sairDaMoradia(estado), 'Saiu da moradia — volta ao estilo escolhido.')}>
                        Sair
                      </Botao>
                    </span>
                    <span style={DINHEIRO}>{formatValorMoeda(eixo.valor)}</span>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label={nomeAba}>
                    {lista.map((r) => {
                      const sel = estado.estilos[papel] === r.nome
                      const n = r.nivel ?? 1
                      return (
                        <div
                          key={r.id}
                          role="radio"
                          aria-checked={sel}
                          tabIndex={0}
                          data-classe={n}
                          title={r.resumo}
                          onClick={() => aplicar(escolherEstilo(estado, papel, sel ? null : r), `${nomeAba}: ${nomeNivel(cfg, n)}.`)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              aplicar(escolherEstilo(estado, papel, sel ? null : r), `${nomeAba}: ${nomeNivel(cfg, n)}.`)
                            }
                          }}
                          style={{ ...LINHA, ...(sel ? LINHA_MARCADA : {}) }}
                        >
                          <Radio marcado={sel} />
                          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: sel ? 700 : 600, fontSize: 13 }}>{nomeNivel(cfg, n)}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.resumo.replace(/^Nível \d · [^:]+: /, '')}
                            </span>
                          </span>
                          <span style={DINHEIRO}>{formatValorMoeda(r.preco)}</span>
                        </div>
                      )
                    })}
                    {!lista.length && !carregando ? <Vazio>{'// sem estilos deste eixo na vault'}</Vazio> : null}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...MONO, color: 'var(--text)' }}>TOTAL DO MÊS</span>
            <b style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--accent)' }} data-custo-mes={custo.total}>
              {formatValorMoeda(custo.total)}
            </b>
            <Chip>
              classe {custo.classe} · {nomeNivel(cfg, custo.classe)}
            </Chip>
            <span style={{ flex: 1 }} />
            <span style={{ ...MONO, fontSize: 10 }}>
              OURO NA FICHA <b style={{ color: 'var(--text)' }}>{formatValorMoeda(ouro * fator)}</b>
            </span>
            <Botao
              onClick={() => aplicar(fecharMes(estado, porNome, cfg, ouro, fator), `Mês fechado: −${formatValorMoeda(custo.ouro * fator)}.`, 'Ouro insuficiente pra fechar o mês.')}
              disabled={custo.total <= 0}
              title={`Desconta ${custo.ouro} de ouro (arredondado pro milhar)`}
            >
              Fechar o mês −{moedaNumero(custo.ouro)}
            </Botao>
          </div>
          {aviso ? (
            <div role="status" style={{ ...MONO, color: 'var(--text)', fontSize: 11.5 }}>
              {aviso}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHead label="// O QUE VOCÊ TEM" />
        <TabStrip tabs={cfg.abas.map((a) => ({ id: a.nome, label: a.nome.toUpperCase() }))} active={aba} onSelect={setAba} pad="10px 16px" />
        <div style={{ ...BOX, marginTop: 12 }}>
          {papelDaAbaAtual === 'transporte' ? (
            <TemTransporte estado={estado} recursos={recursos} porNome={porNome} cfg={cfg} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} />
          ) : papelDaAbaAtual === 'moradia' ? (
            <TemMoradia estado={estado} porNome={porNome} cfg={cfg} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} />
          ) : (
            <TemItens estado={estado} porNome={porNome} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} vazio="// nada comprado — o que se come no mês está no estilo de vida" />
          )}
        </div>
        <div style={{ ...MONO, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
          Compra-se nos estabelecimentos: aba {cfg.ofertas.aba.toUpperCase()} de cada lugar do Atlas.
        </div>
      </section>
    </div>
  )
}

/* ───────────────────────── "o que você tem" ───────────────────────── */

function ListaItens({ estado, porNome, aba, ouro, fator, aplicar, acao }: { estado: RecursosDoHeroi; porNome: Map<string, Recurso>; aba: string; ouro: number; fator: number; aplicar: Aplicar; acao: 'vender' | 'consumir' }) {
  const itens = estado.itens.map((it, i) => ({ it, i })).filter(({ it }) => it.aba === aba)
  if (!itens.length) return null
  return (
    <div>
      {itens.map(({ it, i }, k) => {
        const r = porNome.get(it.nome)
        return (
          <div key={`${it.nome}:${i}`} data-item={it.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: k ? '1px solid var(--line)' : undefined, flexWrap: 'wrap' }}>
            {r ? <DetailLink id={r.id}>{it.nome}</DetailLink> : <span>{it.nome}</span>}
            {it.estado ? <Chip>{it.estado}</Chip> : null}
            <Chip>×{it.qtd}</Chip>
            {r?.cobranca === 'única' ? <Chip>pagou {formatValorMoeda(it.pago)}</Chip> : null}
            <span style={{ flex: 1 }} />
            {acao === 'vender' ? (
              <Botao tom="muted" onClick={() => aplicar(venderItem(estado, i, ouro, fator), `${it.nome} vendido pela metade do que pagou.`)} title={`Devolve ${Math.floor(it.pago / 2 / fator)} de ouro`}>
                Vender +{moedaNumero(Math.floor(it.pago / 2 / fator))}
              </Botao>
            ) : (
              <Botao tom="muted" onClick={() => aplicar(consumirItem(estado, i), `${it.nome}: −1.`)}>
                Consumir
              </Botao>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TemItens({ estado, porNome, aba, ouro, fator, aplicar, vazio }: { estado: RecursosDoHeroi; porNome: Map<string, Recurso>; aba: string; ouro: number; fator: number; aplicar: Aplicar; vazio: string }) {
  const tem = estado.itens.some((it) => it.aba === aba)
  return tem ? <ListaItens estado={estado} porNome={porNome} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} acao="consumir" /> : <Vazio>{vazio}</Vazio>
}

function TemTransporte({ estado, recursos, porNome, cfg, aba, ouro, fator, aplicar }: { estado: RecursosDoHeroi; recursos: Recurso[]; porNome: Map<string, Recurso>; cfg: RecursosCfg; aba: string; ouro: number; fator: number; aplicar: Aplicar }) {
  // o cartão TRI é do herói: as passagens do mundo se USAM daqui (o saldo se recarrega no guichê)
  const passagens = recursos.filter((r) => r.aba === aba && acaoDe(cfg, r, fator) === 'tri').sort((a, b) => a.preco - b.preco)
  const temItens = estado.itens.some((it) => it.aba === aba)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={MONO}>CARTÃO TRI</span>
        <b style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--accent)' }} data-tri={estado.tri}>
          {formatValorMoeda(estado.tri)}
        </b>
        <span style={{ ...MONO, fontSize: 10 }}>recarrega no guichê</span>
      </div>
      {passagens.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={MONO}>USAR</span>
          {passagens.map((r) => (
            <Botao key={r.id} onClick={() => aplicar(usarPassagem(estado, r.preco), `${r.nome}: −${formatValorMoeda(r.preco)} do TRI.`, 'TRI insuficiente — recarregue no guichê.')} disabled={estado.tri < r.preco} title={r.resumo}>
              {r.nome} −{formatValorMoeda(r.preco)}
            </Botao>
          ))}
        </div>
      ) : null}
      <div>
        <div style={{ ...MONO, marginBottom: 4 }}>VEÍCULOS E AFINS</div>
        {temItens ? <ListaItens estado={estado} porNome={porNome} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} acao="vender" /> : <Vazio>{'// a pé, de ônibus ou de carona — compre numa concessionária ou ferro-velho'}</Vazio>}
      </div>
    </div>
  )
}

function TemMoradia({ estado, porNome, cfg, aba, ouro, fator, aplicar }: { estado: RecursosDoHeroi; porNome: Map<string, Recurso>; cfg: RecursosCfg; aba: string; ouro: number; fator: number; aplicar: Aplicar }) {
  const m = estado.moradia
  const r = m ? porNome.get(m.nome) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={MONO}>MORADIA</span>
        {m ? (
          <>
            {r ? <DetailLink id={r.id}>{m.nome}</DetailLink> : <span>{m.nome}</span>}
            <Chip>{m.modo === 'propria' ? 'própria' : m.modo}</Chip>
            {r ? <Chip>{m.modo === 'propria' ? 'sem aluguel' : m.modo === 'hotel' ? `${formatValorMoeda(r.preco)} / noite` : `${formatValorMoeda(r.preco)} / mês`}</Chip> : null}
            {r?.nivel ? <Chip>classe {r.nivel} · {nomeNivel(cfg, r.nivel)}</Chip> : null}
            <span style={{ flex: 1 }} />
            <Botao tom="muted" onClick={() => aplicar(sairDaMoradia(estado), 'Saiu da moradia — volta ao estilo escolhido.')}>
              Sair
            </Botao>
          </>
        ) : (
          <span style={{ ...MONO, color: 'var(--text)' }}>nenhuma específica — vale o estilo escolhido no custo de vida</span>
        )}
      </div>
      <div>
        <div style={{ ...MONO, marginBottom: 4 }}>IMÓVEIS</div>
        {estado.imoveis.length === 0 ? (
          <Vazio>{'// nenhum — compra-se numa imobiliária'}</Vazio>
        ) : (
          estado.imoveis.map((nome, i) => {
            const im = porNome.get(nome)
            const morando = m?.modo === 'propria' && m.nome === nome
            return (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                {im ? <DetailLink id={im.id}>{nome}</DetailLink> : <span>{nome}</span>}
                {morando ? <Chip>morando</Chip> : null}
                <span style={{ flex: 1 }} />
                {!morando ? <Botao onClick={() => aplicar(morarNoProprio(estado, nome), `Morando em ${nome}.`)}>Morar aqui</Botao> : null}
              </div>
            )
          })
        )}
      </div>
      <ListaItens estado={estado} porNome={porNome} aba={aba} ouro={ouro} fator={fator} aplicar={aplicar} acao="consumir" />
    </div>
  )
}
