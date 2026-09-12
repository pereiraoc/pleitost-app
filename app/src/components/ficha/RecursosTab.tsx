// Aba RECURSOS da ficha (v3, 2026-09-08) — o CUSTO DE VIDA do herói numa
// tela só: três seções colapsáveis (moradia, transporte, alimentação — a
// ordem vem do contexto) que mostram o total do eixo mesmo fechadas. Dentro
// de cada uma, a lista VERTICAL de planos (uma linha por classe: seletor,
// nome + o que garante, valor alinhado) e a POSSE daquele eixo (carro,
// imóvel) com a manutenção mensal que a nota do item define. No topo, o
// total do mês e o botão de ABRIR O MÊS: o mês se paga na entrada (planos,
// manutenção da posse e parcela das dívidas), e é aí que os veículos rolam o
// d6 de pane. Não há estoque de comida nem saldo de transporte: o que é
// avulso se paga na hora nos estabelecimentos (aba Serviços dos locais).
// v4 (2026-09-08): um eixo pode ser PAGO POR TERCEIRO (regalia de classe —
// aparece e não sai do saldo) e há DÍVIDAS: pegar numa fonte de crédito da
// vault, pagar a parcela ao abrir o mês, amortizar livremente.
import { useMemo, useState, type CSSProperties, type ReactNode, Fragment } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { activeContextoDef } from '../../data/reskin'
import { formatValorMoeda, moedaFator } from '../../data/moeda'
import { DetailLink } from '../DetailLink'
import { RecursoCardStyle, RecursoFaixa, RecursoThumb } from './RecursoThumb'
import { RegaliaBloco, useRegaliaDaClasse } from './RegaliaDeClasse'
import { ClasseSocialBanner, useRetratoSocial } from './ClasseSocial'
import { TipProvider } from './tooltips'
import { linkIconForEntry } from '../../markdown/link-icon'

/** Emoji do recurso pela MESMA cascata dos links (seletores do Obsidian). */
function iconeDe(r: Recurso): string {
  return linkIconForEntry({ type: 'Recurso', subtype: r.aba, grupo: null, path: `${r.id}.md`, tipo: r.tipo })
}
import { clip } from './bits'
import { fmPath, num, str } from './hero-model'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Papel, Recurso, RecursosCfg } from '../../recursos/types'
import {
  OURO_FM,
  RECURSOS_FM,
  abrirMes,
  amortizar,
  consertar,
  custoMensal,
  escolherEstilo,
  isEmprestimo,
  marcarPagoPor,
  isEstilo,
  melhorDoEixo,
  nomeDegrauGeral,
  nomeNivel,
  papelDaAba,
  pegarEmprestimo,
  recursosDoFm,
  tetoDoEmprestimo,
  venderItem,
  type CustoMensal,
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
/** Linha com FIGURA do recurso (planos, posse, catálogo): coluna a mais pra miniatura. */
const LINHA_FIG: CSSProperties = { ...LINHA, gridTemplateColumns: '22px 40px minmax(0,1fr) 120px' }
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
      // as fontes de crédito não vivem numa aba de eixo (não são um eixo do
      // mês), mas a ficha precisa delas pra dívida.
      if (r && (cfg.abas.some((a) => a.nome === r.aba) || isEmprestimo(cfg, r))) recursos.push(r)
    }
    // A ficha guarda o NOME do plano escolhido: os `aliases` (nomes antigos da
    // nota) entram no índice pra que um rename não apague a escolha salva —
    // nunca por cima de um nome real.
    const porNome = new Map(recursos.map((r) => [r.nome, r]))
    for (const r of recursos) for (const a of r.aliases) if (!porNome.has(a)) porNome.set(a, r)
    return { carregando: false, recursos, porNome }
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
  // O que a CLASSE do herói ganha de terceiro (nota `recursos.regalias`): fica
  // no topo do custo de vida porque é o que explica um eixo pago por outro.
  const regalia = useRegaliaDaClasse(str(fm['Classe']))
  // O RETRATO do mês (classe social A–E): padrão de vida + posse + equipamento
  // + dinheiro, com o piso/teto da profissão (pedido 2026-09-12).
  const retrato = useRetratoSocial(fm, cfg, custo, estado)

  const aplicar: Aplicar = (res, msg, falha = 'Saldo insuficiente.') => {
    if (!res) {
      setAviso(falha)
      return
    }
    model.set(RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
    if (res.ouro !== undefined) model.set(OURO_FM, res.ouro)
    setAviso(msg)
  }

  // CATÁLOGO (2026-09-08b): o que dá pra ter de posse em cada eixo e onde
  // comprar — veículos (preço de novo) e imóveis (compra e/ou aluguel de
  // referência); as notas de Recurso são a fonte, `Onde` diz o lugar.
  // Ordem = classe social de baixo pra cima (FM `Nível`, rótulos de
  // `recursos.niveis`), preço crescente dentro da classe; o render agrupa.
  const catalogoPorPapel = useMemo(() => {
    const m = new Map<Papel, Recurso[]>()
    for (const r of recursos) {
      if (isEstilo(cfg, r) || isEmprestimo(cfg, r)) continue
      const p = papelDaAba(cfg, r.aba)
      if (!p) continue
      const entra = p === 'transporte' ? r.cobranca === 'única' : p === 'moradia' ? r.cobranca === 'mês' : false
      if (!entra) continue
      m.set(p, [...(m.get(p) ?? []), r])
    }
    for (const l of m.values()) l.sort((a, b) => (a.nivel ?? 99) - (b.nivel ?? 99) || (a.compra ?? a.preco) - (b.compra ?? b.preco) || a.nome.localeCompare(b.nome, 'pt-BR'))
    return m
  }, [recursos, cfg])

  /** Fontes de crédito da vault, do juro mais barato ao mais caro. */
  const fontesDeCredito = useMemo(
    () => recursos.filter((r) => isEmprestimo(cfg, r)).sort((a, b) => (a.juros ?? 0) - (b.juros ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [recursos, cfg],
  )

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
    <TipProvider>
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <RecursoCardStyle />
      {retrato ? <ClasseSocialBanner retrato={retrato} /> : null}
      <div style={{ ...BOX, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>{'// CUSTO DE VIDA'}</span>
        <span style={{ flex: 1 }} />
        <span style={MONO}>TOTAL DO MÊS</span>
        <b style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--accent)' }} data-custo-mes={custo.total}>
          {formatValorMoeda(custo.total)}
        </b>
        <Botao
          onClick={() =>
            aplicar(
              abrirMes(estado, porNome, cfg, saldo, fator, doc.basename),
              `Mês ${estado.mes + 1} aberto: −${formatValorMoeda(custo.ouro * fator)}.`,
              'Saldo insuficiente pra abrir o mês — cai de classe no eixo que não fecha.',
            )
          }
          disabled={custo.total <= 0}
          title={`Paga adiantado ${formatValorMoeda(custo.ouro * fator)}: planos, manutenção da posse e parcela das dívidas`}
        >
          Abrir o mês −{formatValorMoeda(custo.ouro * fator)}
        </Botao>
        <span style={{ ...MONO, fontSize: 10, flexBasis: '100%' }}>
          NA FICHA <b style={{ color: 'var(--text)' }}>{formatValorMoeda(saldo * fator)}</b>
          {estado.mes > 0 ? <span style={{ marginLeft: 14 }}>MÊS <b style={{ color: 'var(--text)' }}>{estado.mes}</b></span> : null}
          {custo.parcelasTotal > 0 ? (
            <span style={{ marginLeft: 14 }}>
              DÍVIDA <b style={{ color: 'var(--text)' }}>{formatValorMoeda(estado.dividas.reduce((a, d) => a + d.saldo, 0))}</b>
            </span>
          ) : null}
          {aviso ? (
            <span role="status" style={{ marginLeft: 14, color: 'var(--text)' }}>
              {aviso}
            </span>
          ) : null}
        </span>
      </div>

      {regalia ? (
        <details data-secao="regalia" style={{ ...BOX, padding: 0 }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
            <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>O QUE A TUA CLASSE GANHA</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {regalia.regalia.nome}
              {regalia.regalia.subtitulo ? ` · ${regalia.regalia.subtitulo}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <Chip>marque o eixo como pago por terceiro</Chip>
          </summary>
          <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--line)' }}>
            <RegaliaBloco regalia={regalia.regalia} doc={regalia.doc} nivel={num(fm['Nível'])} completo />
          </div>
        </details>
      ) : null}

      {cfg.abas.map((a) => {
        const eixo = custo.eixos.find((e) => e.papel === a.papel)
        if (!eixo) return null
        return (
          <SecaoEixo
            key={a.nome}
            nomeAba={a.nome}
            eixo={eixo}
            planos={planosPorPapel.get(a.papel) ?? []}
            catalogo={catalogoPorPapel.get(a.papel) ?? []}
            estado={estado}
            porNome={porNome}
            cfg={cfg}
            saldo={saldo}
            fator={fator}
            carregando={carregando}
            aplicar={aplicar}
          />
        )
      })}

      <SecaoDividas estado={estado} custo={custo} fontes={fontesDeCredito} cfg={cfg} saldo={saldo} fator={fator} aplicar={aplicar} />
    </div>
    </TipProvider>
  )
}

/** DÍVIDAS: o que se deve, a parcela do mês e onde pegar mais. As fontes são
 *  notas da vault (`Tipo` de empréstimo) — nada de taxa hardcoded aqui. */
function SecaoDividas({
  estado,
  custo,
  fontes,
  cfg,
  saldo,
  fator,
  aplicar,
}: {
  estado: RecursosDoHeroi
  custo: CustoMensal
  fontes: Recurso[]
  cfg: RecursosCfg
  saldo: number
  fator: number
  aplicar: Aplicar
}) {
  const [pegarDe, setPegarDe] = useState('')
  const [valor, setValor] = useState('')
  if (!fontes.length && !estado.dividas.length) return null
  const mes = custo.eixos.reduce((a, e) => a + e.total, 0)
  const fonte = fontes.find((f) => f.nome === pegarDe)
  const teto = fonte ? tetoDoEmprestimo(fonte, mes) : null
  const pedido = Number(valor.replace(/\D/g, '')) || 0
  return (
    <details data-secao="dividas" style={{ ...BOX, padding: 0 }} open={estado.dividas.length > 0}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>DÍVIDAS</span>
        <span style={{ flex: 1 }} />
        {custo.parcelasTotal > 0 ? <span style={MONO}>PARCELA DO MÊS</span> : null}
        <b style={DINHEIRO}>{formatValorMoeda(custo.parcelasTotal)}</b>
      </summary>
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {custo.parcelas.map((p) => (
          <div key={p.indice} data-divida={p.divida.fonte} style={{ ...LINHA, cursor: 'default' }}>
            <span />
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
              {p.fonte ? <DetailLink id={p.fonte.id} dataLinkIcon={iconeDe(p.fonte)}>{p.divida.fonte}</DetailLink> : <span>{p.divida.fonte}</span>}
              <Chip>deve {formatValorMoeda(p.divida.saldo)}</Chip>
              <Chip>{p.fonte?.juros ?? 0}% ao mês</Chip>
              <Chip>juros {formatValorMoeda(p.juros)}</Chip>
              <Chip>amortiza {formatValorMoeda(p.amortizacao)}</Chip>
              <Botao
                tom="muted"
                onClick={() => aplicar(amortizar(estado, p.indice, p.divida.saldo, saldo, fator), `${p.divida.fonte} quitada.`)}
                title={`Quita tudo: ${formatValorMoeda(p.divida.saldo)}`}
              >
                Quitar
              </Botao>
              <Botao
                tom="muted"
                onClick={() => aplicar(amortizar(estado, p.indice, Math.min(p.divida.saldo, fator * 10), saldo, fator), `Amortizado em ${formatValorMoeda(Math.min(p.divida.saldo, fator * 10))}.`)}
              >
                Amortizar {formatValorMoeda(Math.min(p.divida.saldo, fator * 10))}
              </Botao>
            </span>
            <span style={DINHEIRO}>{formatValorMoeda(p.total)}</span>
          </div>
        ))}
        {!estado.dividas.length ? <div style={{ ...MONO, padding: '8px 16px' }}>—</div> : null}
        {fontes.length ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
            <span style={MONO}>PEGAR</span>
            <select aria-label="Fonte de crédito" value={pegarDe} onChange={(e) => setPegarDe(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              <option value="">escolha a fonte…</option>
              {fontes.map((f) => (
                <option key={f.id} value={f.nome}>
                  {f.nome} · {f.juros ?? 0}%/mês · {nomeDegrauGeral(cfg, f.nivel ?? 1)}
                </option>
              ))}
            </select>
            {fonte ? (
              <>
                <input
                  aria-label="Quanto pegar"
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={teto !== null ? String(teto) : 'quanto'}
                  style={{ width: 110, fontFamily: 'var(--mono)', fontSize: 12 }}
                />
                <Chip>{teto !== null ? `teto ${formatValorMoeda(teto)}` : 'teto na mesa'}</Chip>
                {(fonte.nivel ?? 1) > custo.classe ? <Chip>exige {nomeDegrauGeral(cfg, fonte.nivel ?? 1)}</Chip> : null}
                <Botao
                  onClick={() => {
                    aplicar(pegarEmprestimo(estado, fonte, pedido, saldo, fator, mes), `Pegou ${formatValorMoeda(pedido)} — ${fonte.nome}.`, 'Acima do teto da fonte.')
                    setValor('')
                  }}
                  disabled={pedido <= 0}
                >
                  Pegar {formatValorMoeda(pedido)}
                </Botao>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  )
}

function SecaoEixo({
  nomeAba,
  eixo,
  planos,
  catalogo,
  estado,
  porNome,
  cfg,
  saldo,
  fator,
  carregando,
  aplicar,
}: {
  nomeAba: string
  eixo: EixoDoMes
  planos: Recurso[]
  /** o que dá pra ter de posse neste eixo (veículos novos / imóveis) — vazio = eixo sem posse. */
  catalogo: Recurso[]
  estado: RecursosDoHeroi
  porNome: Map<string, Recurso>
  cfg: RecursosCfg
  saldo: number
  fator: number
  carregando: boolean
  aplicar: Aplicar
}) {
  const papel = eixo.papel
  const escolher = (r: Recurso, sel: boolean) => aplicar(escolherEstilo(estado, papel, sel ? null : r), `${nomeAba}: ${sel ? 'sem plano' : nomeNivel(cfg, r.nivel ?? 1, papel)}.`)
  const [verCatalogo, setVerCatalogo] = useState(false)
  const catalog = useCatalog()
  const idDe = (nome: string): string | null => {
    const res = catalog.resolve(nome)
    return res.kind === 'doc' ? res.id : null
  }
  const rotuloPosse = papel === 'transporte' ? 'VEÍCULOS PRÓPRIOS' : papel === 'moradia' ? 'IMÓVEIS PRÓPRIOS' : 'POSSE'
  const melhor = melhorDoEixo(eixo)
  // ONDE COMPRAR = os estabelecimentos que listam o recurso em `Serviços`
  // (faceta `vende` do índice); sem vendedor, o `Onde` da própria nota.
  const vendedores = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }[]>()
    for (const e of catalog.docsByType.get('Localização') ?? []) for (const n of e.vende ?? []) m.set(n, [...(m.get(n) ?? []), { id: e.id, nome: e.basename ?? e.id.split('/').pop() ?? e.id }])
    return m
  }, [catalog])
  return (
    <details data-eixo={papel} style={{ ...BOX, padding: 0, overflow: 'hidden' }}>
      {/* o sumário é uma FILA (não o grid das linhas de plano): a figura do
          maior do eixo é uma faixa colada na borda direita, da altura toda —
          o mesmo desenho do card de Contexto (report 2026-09-12). */}
      <summary style={{ display: 'flex', alignItems: 'stretch', gap: 12, cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ ...MONO, color: 'var(--muted)', flex: 'none', alignSelf: 'center', paddingLeft: 14 }}>▸</span>
        <span style={{ flex: 1, minWidth: 0, padding: '11px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...MONO, color: 'var(--text)', letterSpacing: '.16em' }}>{nomeAba.toUpperCase()}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {eixo.plano ? `${nomeNivel(cfg, eixo.nivel, eixo.papel)} · ${eixo.plano.nome}` : 'sem plano'}
            {eixo.posse.length ? ` · ${eixo.posse.length} de posse` : ''}
          </span>
          {eixo.pagoPor ? <Chip>plano pago por {eixo.pagoPor}</Chip> : null}
        </span>
        <span
          style={{ ...DINHEIRO, alignSelf: 'center', color: 'var(--accent)', fontWeight: 700, paddingRight: melhor ? 10 : 14 }}
          data-eixo-valor={eixo.total}
          data-eixo-bolso={eixo.doBolso}
        >
          {formatValorMoeda(eixo.doBolso)}
        </span>
        {melhor ? <RecursoFaixa r={melhor} icone={iconeDe(melhor)} /> : null}
      </summary>
      <div style={{ padding: '0 6px 10px' }}>
        <div style={{ ...MONO, padding: '6px 10px 2px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>PLANO DO MÊS</span>
          <span style={{ flex: 1 }} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>PAGO POR</span>
            <input
              aria-label={`Quem paga o plano de ${nomeAba}`}
              defaultValue={eixo.pagoPor ?? ''}
              placeholder="eu mesmo"
              onBlur={(e) => {
                const quem = e.target.value
                if (quem.trim() !== (eixo.pagoPor ?? '')) aplicar(marcarPagoPor(estado, papel, quem), quem.trim() ? `${nomeAba}: plano pago por ${quem.trim()}.` : `${nomeAba}: plano volta a sair do teu bolso.`)
              }}
              style={{ width: 120, fontFamily: 'var(--mono)', fontSize: 11 }}
            />
          </label>
        </div>
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
                style={{ ...LINHA_FIG, ...(sel ? LINHA_MARCADA : {}) }}
              >
                <Radio marcado={sel} />
                <RecursoThumb r={r} icone={iconeDe(r)} size={36} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: sel ? 700 : 600, fontSize: 13 }}>
                    {nomeNivel(cfg, n, papel)}
                    {papel === 'transporte' && !r.nome.startsWith(nomeNivel(cfg, n, papel)) ? <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {r.nome}</span> : null}
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
        {eixo.posse.length || catalogo.length ? (
          <>
            <div style={{ ...MONO, padding: '12px 10px 2px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-posse={papel}>
              <span>{rotuloPosse} · manutenção por mês</span>
              {catalogo.length ? (
                <Botao tom="muted" onClick={() => setVerCatalogo((v) => !v)} title="Tudo que dá pra ter de posse neste eixo e onde comprar">
                  {verCatalogo ? 'fechar catálogo' : 'ver catálogo'}
                </Botao>
              ) : null}
            </div>
            {eixo.posse.map((p) => (
              <div key={`${p.item.nome}:${p.indice}`} data-item={p.item.nome} style={{ ...LINHA_FIG, cursor: 'default' }}>
                <span />
                {p.recurso ? <RecursoThumb r={p.recurso} icone={iconeDe(p.recurso)} size={36} /> : <span />}
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                  {p.recurso ? <DetailLink id={p.recurso.id} dataLinkIcon={iconeDe(p.recurso)}>{p.item.nome}</DetailLink> : <span>{p.item.nome}</span>}
                  {p.item.estado ? <Chip>{p.item.estado}</Chip> : null}
                  {p.item.qtd > 1 ? <Chip>×{p.item.qtd}</Chip> : null}
                  {p.item.pagoPor ? <Chip>cedido por {p.item.pagoPor}</Chip> : <Chip>pagou {formatValorMoeda(p.item.pago)}</Chip>}
                  {p.naRua ? <Chip>na rua: sem vaga</Chip> : null}
                  {p.item.pane ? <Chip>em pane</Chip> : null}
                  {p.item.pane ? (
                    <Botao
                      tom="muted"
                      onClick={() => aplicar(consertar(estado, p.indice, porNome, saldo, fator), `${p.item.nome} consertado.`)}
                      title="A oficina de sucata cobra a manutenção em dobro; vale por este mês"
                    >
                      Consertar −{formatValorMoeda(p.valor * 2)}
                    </Botao>
                  ) : null}
                  {p.item.pagoPor ? null : (
                    <Botao tom="muted" onClick={() => aplicar(venderItem(estado, p.indice, saldo, fator), `${p.item.nome} vendido pela metade do que pagou.`)} title={`Devolve ${formatValorMoeda(Math.floor(p.item.pago / 2 / fator) * fator)}`}>
                      Vender +{formatValorMoeda(Math.floor(p.item.pago / 2 / fator) * fator)}
                    </Botao>
                  )}
                </span>
                <span style={DINHEIRO}>{formatValorMoeda(p.valor)}</span>
              </div>
            ))}
            {!eixo.posse.length ? <div style={{ ...MONO, padding: '4px 10px' }}>—</div> : null}
            {verCatalogo ? (
              <div data-catalogo={papel} style={{ margin: '8px 6px 0', border: '1px dashed var(--line2)', padding: '4px 0' }}>
                <div style={{ ...MONO, padding: '6px 10px 2px' }}>{papel === 'transporte' ? 'CATÁLOGO · veículos novos e onde comprar' : 'CATÁLOGO · imóveis e onde alugar ou comprar'}</div>
                {catalogo.map((r, i) => {
                  // cabeçalho de classe quando a classe muda (a lista já vem ordenada por Nível)
                  const classe = r.nivel ? nomeNivel(cfg, r.nivel, papel) : 'sem classe'
                  const cabecalho = i === 0 || (catalogo[i - 1]!.nivel ?? 0) !== (r.nivel ?? 0)
                  const vend = vendedores.get(r.nome) ?? []
                  const onde = vend.length
                    ? vend.map((v) => <DetailLink key={v.id} id={v.id}>{v.nome}</DetailLink>)
                    : r.onde.map((n) => {
                        const id = idDe(n)
                        return id ? <DetailLink key={n} id={id}>{n}</DetailLink> : <span key={n}>{n}</span>
                      })
                  return (
                    <Fragment key={r.id}>
                    {cabecalho ? (
                      <div data-catalogo-grupo={classe} style={{ ...MONO, padding: '10px 10px 2px', color: 'var(--text)', borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
                        {classe.toUpperCase()}
                      </div>
                    ) : null}
                    <div data-catalogo-item={r.nome} style={{ ...LINHA_FIG, cursor: 'default' }}>
                      <span />
                      <RecursoThumb r={r} icone={iconeDe(r)} size={36} />
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <DetailLink id={r.id} dataLinkIcon={iconeDe(r)}>{r.nome}</DetailLink>
                          <Chip>{r.tipo}</Chip>
                          {r.manutencao ? <Chip>{formatValorMoeda(r.manutencao)} / mês</Chip> : null}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={MONO}>ONDE</span>
                          {onde.length ? onde.map((el, i) => <span key={i}>{el}{i < onde.length - 1 ? ' · ' : ''}</span>) : <span>—</span>}
                        </span>
                      </span>
                      <span style={{ ...DINHEIRO, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        {papel === 'moradia' && r.compra !== undefined ? <span>compra {formatValorMoeda(r.compra)}</span> : null}
                        <span>{papel === 'moradia' ? `${formatValorMoeda(r.preco)} / mês` : formatValorMoeda(r.preco)}</span>
                      </span>
                    </div>
                    </Fragment>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  )
}
