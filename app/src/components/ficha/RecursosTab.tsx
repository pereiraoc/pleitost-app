// Aba RECURSOS da ficha (v3, 2026-09-08) — o CUSTO DE VIDA do herói numa
// tela só: três seções colapsáveis (moradia, transporte, alimentação — a
// ordem vem do contexto) que mostram o total do eixo mesmo fechadas. Dentro
// de cada uma, a lista VERTICAL de planos (uma linha por classe: seletor,
// nome + o que garante, valor alinhado) e a POSSE daquele eixo (carro,
// imóvel) com a manutenção mensal que a nota do item define. No topo, o
// total do mês e o botão de fechar o mês (tudo pago adiantado). Não há
// estoque de comida nem saldo de transporte: o que é avulso se paga na hora
// nos estabelecimentos (aba Serviços dos locais).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { activeContextoDef } from '../../data/reskin'
import { formatValorMoeda, moedaFator } from '../../data/moeda'
import { DetailLink } from '../DetailLink'
import { clip } from './bits'
import { fmPath, num } from './hero-model'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Papel, Recurso, RecursosCfg } from '../../recursos/types'
import {
  OURO_FM,
  RECURSOS_FM,
  custoMensal,
  escolherEstilo,
  fecharMes,
  isEstilo,
  nomeNivel,
  papelDaAba,
  recursosDoFm,
  venderItem,
  type EixoDoMes,
  type RecursosDoHeroi,
  type Resultado,
} from '../../recursos/hero-recursos'

/* ───────────────────────── estilos ───────────────────────── */

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = { padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line2)', clipPath: clip(12) }
/** Linha da tabela de planos: [seletor] [nome + o que garante] [dinheiro]; a
 *  coluna do dinheiro tem largura fixa → valores alinhados em todos os eixos. */
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
const LINHA_MARCADA: CSSProperties = { background: 'color-mix(in srgb,var(--accent) 12%,transparent)', borderLeft: '3px solid var(--accent)' }
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
        background: disabled ? 'transparent' : `color-mix(in srgb,${cor} 10%,transparent)`,
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
function Chip({ children }: { children: ReactNode }) {
  return <span style={{ ...MONO, fontSize: 10, padding: '2px 6px', border: '1px solid var(--line2)', whiteSpace: 'nowrap' }}>{children}</span>
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
  const saldo = num(fmPath(fm, 'Inventario', 'Ouro'))
  const estado = useMemo(() => recursosDoFm(fm), [fm])
  const fator = moedaFator()
  const { carregando, recursos, porNome } = useRecursosDoMundo(cfg)
  const [aviso, setAviso] = useState<string | null>(null)
  const custo = useMemo(() => custoMensal(estado, porNome, fator, cfg), [estado, porNome, fator, cfg])

  const aplicar: Aplicar = (res, msg, falha = 'Saldo insuficiente.') => {
    if (!res) {
      setAviso(falha)
      return
    }
    model.set(RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
    if (res.ouro !== undefined) model.set(OURO_FM, res.ouro)
    setAviso(msg)
  }

  const planosPorPapel = useMemo(() => {
    const m = new Map<Papel, Recurso[]>()
    for (const r of recursos) {
      if (!isEstilo(cfg, r)) continue
      const p = papelDaAba(cfg, r.aba)
      if (!p) continue
      const l = m.get(p) ?? []
      l.push(r)
      m.set(p, l)
    }
    for (const l of m.values()) l.sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0))
    return m
  }, [recursos, cfg])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...BOX, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>{'// CUSTO DE VIDA'}</span>
        <span style={{ ...MONO, fontSize: 10 }}>planos + manutenção da posse, pagos adiantado</span>
        <span style={{ flex: 1 }} />
        <span style={MONO}>TOTAL DO MÊS</span>
        <b style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--accent)' }} data-custo-mes={custo.total}>
          {formatValorMoeda(custo.total)}
        </b>
        <Chip>{nomeNivel(cfg, custo.classe)}</Chip>
        <Botao
          onClick={() => aplicar(fecharMes(estado, porNome, cfg, saldo, fator), `Mês fechado: −${formatValorMoeda(custo.ouro * fator)}.`, 'Saldo insuficiente pra fechar o mês.')}
          disabled={custo.total <= 0}
          title={`Desconta ${formatValorMoeda(custo.ouro * fator)} (arredondado pro milhar)`}
        >
          Fechar o mês −{formatValorMoeda(custo.ouro * fator)}
        </Botao>
        <span style={{ ...MONO, fontSize: 10, flexBasis: '100%' }}>
          NA FICHA <b style={{ color: 'var(--text)' }}>{formatValorMoeda(saldo * fator)}</b>
          {aviso ? (
            <span role="status" style={{ marginLeft: 14, color: 'var(--text)' }}>
              {aviso}
            </span>
          ) : null}
        </span>
      </div>

      {cfg.abas.map((a) => {
        const eixo = custo.eixos.find((e) => e.papel === a.papel)
        if (!eixo) return null
        return (
          <SecaoEixo
            key={a.nome}
            nomeAba={a.nome}
            eixo={eixo}
            planos={planosPorPapel.get(a.papel) ?? []}
            estado={estado}
            cfg={cfg}
            saldo={saldo}
            fator={fator}
            carregando={carregando}
            aplicar={aplicar}
          />
        )
      })}
      <div style={{ ...MONO, fontSize: 10, lineHeight: 1.5 }}>
        O plano garante o mínimo daquele padrão; o que for extra (uma janta melhor, um táxi, uma diária) se paga na hora nos estabelecimentos — aba {cfg.ofertas.aba.toUpperCase()} de cada lugar do Atlas. Posse (carro, imóvel) se compra lá também e entra aqui com a manutenção do mês.
      </div>
    </div>
  )
}

function SecaoEixo({
  nomeAba,
  eixo,
  planos,
  estado,
  cfg,
  saldo,
  fator,
  carregando,
  aplicar,
}: {
  nomeAba: string
  eixo: EixoDoMes
  planos: Recurso[]
  estado: RecursosDoHeroi
  cfg: RecursosCfg
  saldo: number
  fator: number
  carregando: boolean
  aplicar: Aplicar
}) {
  const papel = eixo.papel
  const escolher = (r: Recurso, sel: boolean) => aplicar(escolherEstilo(estado, papel, sel ? null : r), `${nomeAba}: ${sel ? 'sem plano' : nomeNivel(cfg, r.nivel ?? 1)}.`)
  return (
    <details data-eixo={papel} style={{ ...BOX, padding: 0 }}>
      <summary style={{ ...LINHA, borderTop: 'none', cursor: 'pointer', padding: '10px 14px', listStyle: 'none' }}>
        <span style={{ ...MONO, color: 'var(--muted)' }}>▸</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>{nomeAba.toUpperCase()}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {eixo.plano ? `${nomeNivel(cfg, eixo.nivel)} · ${eixo.plano.nome}` : 'sem plano'}
            {eixo.posse.length ? ` · ${eixo.posse.length} de posse` : ''}
          </span>
        </span>
        <span style={{ ...DINHEIRO, color: 'var(--accent)', fontWeight: 700 }} data-eixo-valor={eixo.total}>
          {formatValorMoeda(eixo.total)}
        </span>
      </summary>
      <div style={{ padding: '0 6px 10px' }}>
        <div style={{ ...MONO, padding: '6px 10px 2px' }}>PLANO DO MÊS</div>
        <div role="radiogroup" aria-label={nomeAba}>
          {planos.map((r) => {
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
                onClick={() => escolher(r, sel)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    escolher(r, sel)
                  }
                }}
                style={{ ...LINHA, ...(sel ? LINHA_MARCADA : {}) }}
              >
                <Radio marcado={sel} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: sel ? 700 : 600, fontSize: 13 }}>
                    {nomeNivel(cfg, n)}
                    {papel === 'transporte' ? <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {r.nome}</span> : null}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.resumo.replace(/^[^:]+: /, '')}
                  </span>
                </span>
                <span style={DINHEIRO}>{formatValorMoeda(r.preco)}</span>
              </div>
            )
          })}
          {!planos.length ? <div style={{ ...MONO, padding: '8px 10px' }}>{carregando ? '// CARREGANDO PLANOS…' : '// sem planos deste eixo na vault'}</div> : null}
        </div>
        {papel !== 'alimentacao' ? (
          <>
            <div style={{ ...MONO, padding: '12px 10px 2px' }}>POSSE · manutenção por mês</div>
            {eixo.posse.length ? (
              eixo.posse.map((p) => (
                <div key={`${p.item.nome}:${p.indice}`} data-item={p.item.nome} style={{ ...LINHA, cursor: 'default' }}>
                  <span />
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                    {p.recurso ? <DetailLink id={p.recurso.id}>{p.item.nome}</DetailLink> : <span>{p.item.nome}</span>}
                    {p.item.estado ? <Chip>{p.item.estado}</Chip> : null}
                    {p.item.qtd > 1 ? <Chip>×{p.item.qtd}</Chip> : null}
                    <Chip>pagou {formatValorMoeda(p.item.pago)}</Chip>
                    <Botao tom="muted" onClick={() => aplicar(venderItem(estado, p.indice, saldo, fator), `${p.item.nome} vendido pela metade do que pagou.`)} title={`Devolve ${formatValorMoeda(Math.floor(p.item.pago / 2 / fator) * fator)}`}>
                      Vender +{formatValorMoeda(Math.floor(p.item.pago / 2 / fator) * fator)}
                    </Botao>
                  </span>
                  <span style={DINHEIRO}>{formatValorMoeda(p.valor)}</span>
                </div>
              ))
            ) : (
              <div style={{ ...MONO, padding: '6px 10px' }}>{papel === 'transporte' ? '// nenhum veículo — compra-se numa concessionária ou ferro-velho' : '// nenhum imóvel — compra-se numa imobiliária'}</div>
            )}
          </>
        ) : (
          <div style={{ ...MONO, padding: '12px 10px 2px', fontSize: 10 }}>comida se consome na hora — nada fica guardado aqui</div>
        )}
      </div>
    </details>
  )
}
