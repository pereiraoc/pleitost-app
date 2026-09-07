// Aba RECURSOS da ficha (2026-09-07) — transporte, moradia e alimentação do
// mundo, "o que você tem" e "o que tem pra comprar", na linguagem visual das
// outras abas (TabStrip, painéis cortados, rótulos mono). Não há tela no
// design pra isto; a composição é própria e os DADOS vêm inteiros da vault:
// notas `categoria: Recurso` (via catálogo + useDocs) e a config do mundo
// (contexto.json `recursos`: abas/papéis, tipos, nomes dos níveis). O estado
// do herói vive no FM salvo (`Recursos_do_Mundo`) e o ouro em Inventario.Ouro;
// toda regra de dinheiro está em src/recursos/hero-recursos.ts (puro).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { activeContextoDef, reskinName } from '../../data/reskin'
import { formatValorMoeda, moedaFator, moedaNumero } from '../../data/moeda'
import { localTypeOfDoc, matrizDoContexto, type LocalType } from '../../data/commerce'
import { DetailLink } from '../DetailLink'
import { InlineFieldValue } from '../compendium/InlineFieldValue'
import { clip, TabStrip } from './bits'
import { fmPath, num } from './hero-model'
import { parseRecurso } from '../../recursos/parse-recurso'
import type { Recurso, RecursosCfg } from '../../recursos/types'
import {
  OURO_FM,
  RECURSOS_FM,
  acaoDe,
  alugarMoradia,
  assinarPasse,
  comprarImovel,
  comprarVeiculo,
  custoEmOuro,
  custoMensal,
  escolherAlimentacao,
  fecharMes,
  hospedar,
  morarNoProprio,
  nivelDoHeroi,
  nomeNivel,
  pagarAvista,
  papelDaAba,
  precoNaRegua,
  recarregarTri,
  recursosDoFm,
  sairDaMoradia,
  usarPassagem,
  venderVeiculo,
  type RecursosDoHeroi,
  type Resultado,
} from '../../recursos/hero-recursos'

/* ───────────────────────── estilos ───────────────────────── */

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }
const BOX: CSSProperties = {
  padding: '12px 16px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
}

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 9px' }}>
      <span style={{ ...MONO, letterSpacing: '.16em' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

function Botao({
  children,
  onClick,
  disabled,
  title,
  tom = 'accent',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  tom?: 'accent' | 'muted'
}) {
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

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        ...MONO,
        fontSize: 10,
        padding: '2px 6px',
        border: '1px solid var(--line2)',
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...MONO, padding: '10px 0', color: 'var(--muted)' }}>{children}</div>
  )
}

/* ───────────────────────── dados ───────────────────────── */

/** Régua do bairro: opções = bairros do catálogo com FM Comércio. */
interface OpcaoBairro {
  id: string
  nome: string
  linha: LocalType
}

function useRecursosDoMundo(cfg: RecursosCfg) {
  const catalog = useCatalog()
  const entradas = catalog.docsByType.get('Recurso') ?? []
  const bairros = (catalog.docsByType.get('Localização') ?? []).filter((d) => d.subtype === 'Bairro')
  const ids = useMemo(() => [...entradas.map((e) => e.id), ...bairros.map((b) => b.id)], [entradas, bairros])
  const docs = useDocs(ids)
  return useMemo(() => {
    const recursos: Recurso[] = []
    const opcoes: OpcaoBairro[] = []
    if (!docs) return { carregando: true, recursos, opcoes, porNome: new Map<string, Recurso>() }
    for (const e of entradas) {
      const d = docs.get(e.id)
      const r = d ? parseRecurso(d) : null
      if (r && cfg.abas.some((a) => a.nome === r.aba)) recursos.push(r)
    }
    for (const b of bairros) {
      const d = docs.get(b.id)
      const linha = d ? localTypeOfDoc(d) : null
      if (linha) opcoes.push({ id: b.id, nome: d!.basename, linha })
    }
    opcoes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    const porNome = new Map(recursos.map((r) => [r.nome, r]))
    return { carregando: false, recursos, opcoes, porNome }
  }, [docs, entradas, bairros, cfg])
}

/* ───────────────────────── aba ───────────────────────── */

export function RecursosTab({ doc }: { doc: VaultDoc }) {
  const def = activeContextoDef()
  const cfg = def?.recursos
  if (!cfg) {
    return (
      <div style={{ ...BOX, textAlign: 'center', padding: 44, border: '1px dashed var(--line2)' }}>
        <span style={MONO}>{'// ESTE MUNDO NÃO DECLARA RECURSOS'}</span>
      </div>
    )
  }
  return <RecursosCorpo doc={doc} cfg={cfg} />
}

function RecursosCorpo({ doc, cfg }: { doc: VaultDoc; cfg: RecursosCfg }) {
  const model = useHeroModel(doc, 'recursos')
  const fm = model.fm
  const ouro = num(fmPath(fm, 'Inventario', 'Ouro'))
  const estado = useMemo(() => recursosDoFm(fm), [fm])
  const fator = moedaFator()
  const { carregando, recursos, opcoes, porNome } = useRecursosDoMundo(cfg)
  const [aba, setAba] = useState(cfg.abas[0]?.nome ?? '')
  const [bairroId, setBairroId] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const matriz = useMemo(() => matrizDoContexto(activeContextoDef()), [])
  const bairro = opcoes.find((o) => o.id === bairroId) ?? null
  const mult = bairro ? (matriz?.precos[bairro.linha] ?? 1) : 1
  const rotuloLinha = bairro ? (matriz?.rotulos[bairro.linha] ?? bairro.linha) : null

  const custo = useMemo(() => custoMensal(estado, porNome, fator), [estado, porNome, fator])
  const nivel = useMemo(() => nivelDoHeroi(estado, porNome), [estado, porNome])

  const aplicar = (res: Resultado | null, msg: string, falha = 'Ouro insuficiente.') => {
    if (!res) {
      setAviso(falha)
      return
    }
    model.set(RECURSOS_FM, res.recursos as unknown as Record<string, unknown>)
    if (res.ouro !== undefined) model.set(OURO_FM, res.ouro)
    setAviso(msg)
  }

  const daAba = recursos.filter((r) => r.aba === aba)
  const papel = papelDaAba(cfg, aba)
  const grupos = useMemo(() => {
    const m = new Map<string, Recurso[]>()
    for (const r of daAba) {
      const g = m.get(r.tipo) ?? []
      g.push(r)
      m.set(r.tipo, g)
    }
    for (const g of m.values()) g.sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0) || a.preco - b.preco || a.nome.localeCompare(b.nome, 'pt'))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
  }, [daAba])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <TabStrip tabs={cfg.abas.map((a) => ({ id: a.nome, label: a.nome.toUpperCase() }))} active={aba} onSelect={setAba} pad="10px 16px" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <section>
            <SectionHead label="// O QUE VOCÊ TEM" />
            <div style={BOX}>
              {papel === 'transporte' ? (
                <TemTransporte estado={estado} porNome={porNome} ouro={ouro} fator={fator} aplicar={aplicar} />
              ) : papel === 'moradia' ? (
                <TemMoradia estado={estado} porNome={porNome} cfg={cfg} aplicar={aplicar} />
              ) : papel === 'alimentacao' ? (
                <TemAlimentacao estado={estado} porNome={porNome} cfg={cfg} aplicar={aplicar} />
              ) : (
                <Vazio>{'// ABA SEM PAPEL DECLARADO NO CONTEXTO'}</Vazio>
              )}
            </div>
          </section>

          <section>
            <SectionHead label={`// PRA COMPRAR${rotuloLinha ? ` — ${rotuloLinha.toUpperCase()} ×${String(mult).replace('.', ',')}` : ''}`} />
            {carregando ? (
              <Vazio>{'// CARREGANDO RECURSOS…'}</Vazio>
            ) : grupos.length === 0 ? (
              <Vazio>{'// NENHUMA NOTA DE RECURSO NESTA ABA'}</Vazio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {grupos.map(([tipo, lista]) => (
                  <div key={tipo} style={BOX}>
                    <div style={{ ...MONO, marginBottom: 6 }}>{tipo.toUpperCase()}</div>
                    {lista.map((r) => (
                      <LinhaRecurso
                        key={r.id}
                        r={r}
                        cfg={cfg}
                        estado={estado}
                        ouro={ouro}
                        fator={fator}
                        mult={mult}
                        nivelAtual={nivel}
                        aplicar={aplicar}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
          <div style={BOX}>
            <div style={{ ...MONO, marginBottom: 8 }}>{'// CUSTO DO MÊS'}</div>
            <LinhaCusto label={cfg.abas.find((a) => a.papel === 'moradia')?.nome ?? 'Moradia'} valor={custo.moradia} />
            <LinhaCusto label={cfg.abas.find((a) => a.papel === 'alimentacao')?.nome ?? 'Alimentação'} valor={custo.alimentacao} />
            <LinhaCusto label={cfg.abas.find((a) => a.papel === 'transporte')?.nome ?? 'Transporte'} valor={custo.transporte} />
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
              <span style={{ ...MONO, color: 'var(--text)' }}>TOTAL</span>
              <b style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }} data-custo-mes={custo.total}>
                {formatValorMoeda(custo.total)}
              </b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <span style={MONO} title="O menor dos eixos (moradia × alimentação)">
                NÍVEL {nivel.nivel} · {nomeNivel(cfg, nivel.nivel).toUpperCase()}
              </span>
              <Botao
                onClick={() => aplicar(fecharMes(estado, porNome, ouro, fator), `Mês fechado: −${formatValorMoeda(custo.ouro * fator)}.`, 'Ouro insuficiente pra fechar o mês.')}
                disabled={custo.total <= 0}
                title={`Desconta ${custo.ouro} de ouro (arredondado pro milhar)`}
              >
                Fechar o mês −{moedaNumero(custo.ouro)}
              </Botao>
            </div>
            <div style={{ ...MONO, fontSize: 10, marginTop: 8 }}>
              OURO NA FICHA: <b style={{ color: 'var(--text)' }}>{formatValorMoeda(ouro * fator)}</b>
            </div>
          </div>

          <div style={BOX}>
            <div style={{ ...MONO, marginBottom: 8 }}>{'// ONDE VOCÊ ESTÁ'}</div>
            <select
              value={bairroId}
              onChange={(e) => setBairroId(e.target.value)}
              aria-label="Bairro onde está comprando"
              style={{
                width: '100%',
                padding: '7px 8px',
                background: 'var(--bg)',
                border: '1px solid var(--line2)',
                color: 'var(--text)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
              }}
            >
              <option value="">— preço da nota (×1) —</option>
              {opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {reskinName(o.nome)} · {matriz?.rotulos[o.linha] ?? o.linha} ×{String(matriz?.precos[o.linha] ?? 1).replace('.', ',')}
                </option>
              ))}
            </select>
            <div style={{ ...MONO, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
              A régua do bairro vale pro que você compra agora. O mês fechado usa o preço da nota.
            </div>
          </div>

          {aviso ? (
            <div style={{ ...BOX, ...MONO, color: 'var(--text)', fontSize: 11.5, lineHeight: 1.5 }} role="status">
              {aviso}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function LinhaCusto({ label, valor }: { label: string; valor: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={MONO}>{label.toUpperCase()}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatValorMoeda(valor)}</span>
    </div>
  )
}

/* ───────────────────────── "o que você tem" ───────────────────────── */

type Aplicar = (res: Resultado | null, msg: string, falha?: string) => void

function TemTransporte({
  estado,
  porNome,
  ouro,
  fator,
  aplicar,
}: {
  estado: RecursosDoHeroi
  porNome: Map<string, Recurso>
  ouro: number
  fator: number
  aplicar: Aplicar
}) {
  const passe = estado.passe ? porNome.get(estado.passe) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={MONO}>TRI</span>
        <b style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--accent)' }} data-tri={estado.tri}>
          {formatValorMoeda(estado.tri)}
        </b>
        <span style={{ flex: 1 }} />
        {[1, 5].map((k) => (
          <Botao
            key={k}
            onClick={() => aplicar(recarregarTri(estado, k * fator, ouro, fator), `TRI recarregado: +${formatValorMoeda(k * fator)}.`)}
            disabled={ouro < k}
            title={`Sai ${k} de ouro`}
          >
            +{moedaNumero(k)}
          </Botao>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={MONO}>PASSE</span>
        {passe ? (
          <>
            <DetailLink id={passe.id}>{passe.nome}</DetailLink>
            <Chip>{formatValorMoeda(passe.preco)} / {passe.cobranca}</Chip>
            <span style={{ flex: 1 }} />
            <Botao tom="muted" onClick={() => aplicar(assinarPasse(estado, null), 'Passe cancelado.')}>
              Cancelar
            </Botao>
          </>
        ) : (
          <span style={{ ...MONO, color: 'var(--muted)' }}>nenhum — passagens saem do TRI</span>
        )}
      </div>
      <div>
        <div style={{ ...MONO, marginBottom: 4 }}>VEÍCULOS</div>
        {estado.veiculos.length === 0 ? (
          <Vazio>{'// a pé, de ônibus ou de carona'}</Vazio>
        ) : (
          estado.veiculos.map((v, i) => {
            const r = porNome.get(v.nome)
            return (
              <div key={`${v.nome}:${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                {r ? <DetailLink id={r.id}>{v.nome}</DetailLink> : <span>{v.nome}</span>}
                <Chip>{v.estado}</Chip>
                {r?.manutencao ? <Chip>{formatValorMoeda(r.manutencao)} / mês</Chip> : null}
                <span style={{ flex: 1 }} />
                <Botao
                  tom="muted"
                  onClick={() => aplicar(venderVeiculo(estado, i, ouro, fator), `${v.nome} vendido pela metade do que pagou.`)}
                  title={`Devolve ${Math.floor(v.pago / 2 / fator)} de ouro`}
                >
                  Vender +{moedaNumero(Math.floor(v.pago / 2 / fator))}
                </Botao>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TemMoradia({
  estado,
  porNome,
  cfg,
  aplicar,
}: {
  estado: RecursosDoHeroi
  porNome: Map<string, Recurso>
  cfg: RecursosCfg
  aplicar: Aplicar
}) {
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
            {r ? (
              <Chip>
                {m.modo === 'propria' ? 'sem aluguel' : m.modo === 'hotel' ? `${formatValorMoeda(r.preco)} / noite · ${formatValorMoeda(r.preco * 30)} / mês` : `${formatValorMoeda(r.preco)} / mês`}
              </Chip>
            ) : null}
            {r?.nivel ? <Chip>nível {r.nivel} · {nomeNivel(cfg, r.nivel)}</Chip> : null}
            <span style={{ flex: 1 }} />
            <Botao tom="muted" onClick={() => aplicar(sairDaMoradia(estado), 'Saiu da moradia — está na rua.')}>
              Sair
            </Botao>
          </>
        ) : (
          <span style={{ ...MONO, color: 'var(--muted)' }}>na rua — nível 1 · {nomeNivel(cfg, 1)}</span>
        )}
      </div>
      <div>
        <div style={{ ...MONO, marginBottom: 4 }}>IMÓVEIS</div>
        {estado.imoveis.length === 0 ? (
          <Vazio>{'// nenhum — a cidade é de quem aluga'}</Vazio>
        ) : (
          estado.imoveis.map((nome, i) => {
            const im = porNome.get(nome)
            const morando = m?.modo === 'propria' && m.nome === nome
            return (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                {im ? <DetailLink id={im.id}>{nome}</DetailLink> : <span>{nome}</span>}
                {morando ? <Chip>morando</Chip> : null}
                <span style={{ flex: 1 }} />
                {!morando ? (
                  <Botao onClick={() => aplicar(morarNoProprio(estado, nome), `Morando em ${nome}.`)}>Morar aqui</Botao>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TemAlimentacao({
  estado,
  porNome,
  cfg,
  aplicar,
}: {
  estado: RecursosDoHeroi
  porNome: Map<string, Recurso>
  cfg: RecursosCfg
  aplicar: Aplicar
}) {
  const r = estado.alimentacao ? porNome.get(estado.alimentacao) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={MONO}>ESTILO</span>
      {estado.alimentacao ? (
        <>
          {r ? <DetailLink id={r.id}>{estado.alimentacao}</DetailLink> : <span>{estado.alimentacao}</span>}
          {r ? <Chip>{formatValorMoeda(r.preco)} / {r.cobranca}</Chip> : null}
          {r?.nivel ? <Chip>nível {r.nivel} · {nomeNivel(cfg, r.nivel)}</Chip> : null}
          <span style={{ flex: 1 }} />
          <Botao tom="muted" onClick={() => aplicar(escolherAlimentacao(estado, null), 'Sem estilo — come o que sobra.')}>
            Largar
          </Botao>
        </>
      ) : (
        <span style={{ ...MONO, color: 'var(--muted)' }}>come o que sobra — nível 1 · {nomeNivel(cfg, 1)}</span>
      )}
    </div>
  )
}

/* ───────────────────────── "pra comprar" ───────────────────────── */

function LinhaRecurso({
  r,
  cfg,
  estado,
  ouro,
  fator,
  mult,
  nivelAtual,
  aplicar,
}: {
  r: Recurso
  cfg: RecursosCfg
  estado: RecursosDoHeroi
  ouro: number
  fator: number
  mult: number
  nivelAtual: { moradia: number; alimentacao: number; nivel: number }
  aplicar: Aplicar
}) {
  const acao = acaoDe(cfg, r, fator)
  const preco = precoNaRegua(r.preco, mult)
  const papel = papelDaAba(cfg, r.aba)
  const emUso =
    (acao === 'assinar' && estado.passe === r.nome) ||
    ((acao === 'alugar' || acao === 'hospedar') && estado.moradia?.nome === r.nome) ||
    (acao === 'escolher' && estado.alimentacao === r.nome)

  let acoes: ReactNode = null
  switch (acao) {
    case 'tri':
      acoes = (
        <Botao onClick={() => aplicar(usarPassagem(estado, r, mult), `${r.nome}: −${formatValorMoeda(preco)} do TRI.`, 'TRI insuficiente — recarregue.')} disabled={estado.tri < preco} title="Sai do saldo TRI">
          Usar −{moedaNumero(preco / fator * 1) === '0' ? formatValorMoeda(preco) : formatValorMoeda(preco)}
        </Botao>
      )
      break
    case 'assinar':
      acoes = emUso ? (
        <Chip>assinado</Chip>
      ) : (
        <Botao onClick={() => aplicar(assinarPasse(estado, r), `${r.nome} assinado — entra no mês.`)}>Assinar</Botao>
      )
      break
    case 'comprar': {
      const usado = r.usado !== undefined ? precoNaRegua(r.usado, mult) : null
      acoes = (
        <>
          <Botao onClick={() => aplicar(comprarVeiculo(estado, r, 'novo', ouro, fator, mult), `${r.nome} novo comprado.`)} disabled={ouro < custoEmOuro(preco, fator)}>
            Novo −{formatValorMoeda(preco)}
          </Botao>
          {usado !== null ? (
            <Botao onClick={() => aplicar(comprarVeiculo(estado, r, 'usado', ouro, fator, mult), `${r.nome} usado comprado.`)} disabled={ouro < custoEmOuro(usado, fator)}>
              Usado −{formatValorMoeda(usado)}
            </Botao>
          ) : null}
        </>
      )
      break
    }
    case 'diaria':
      acoes = (
        <Botao onClick={() => aplicar(pagarAvista(estado, r.preco, ouro, fator, mult), `${r.nome}: um dia pago.`)} disabled={ouro < custoEmOuro(preco, fator)}>
          1 dia −{formatValorMoeda(preco)}
        </Botao>
      )
      break
    case 'alugar':
      acoes = (
        <>
          {emUso ? (
            <Chip>{estado.moradia?.modo === 'propria' ? 'sua' : 'morando'}</Chip>
          ) : (
            <Botao onClick={() => aplicar(alugarMoradia(estado, r), `Alugou ${r.nome} — entra no mês.`)}>Alugar</Botao>
          )}
          {r.compra !== undefined && !estado.imoveis.includes(r.nome) ? (
            <Botao onClick={() => aplicar(comprarImovel(estado, r, ouro, fator, mult), `${r.nome} comprado — é seu.`)} disabled={ouro < custoEmOuro(precoNaRegua(r.compra, mult), fator)}>
              Comprar −{formatValorMoeda(precoNaRegua(r.compra, mult))}
            </Botao>
          ) : null}
        </>
      )
      break
    case 'hospedar':
      acoes = emUso ? (
        <Chip>hospedado</Chip>
      ) : (
        <Botao onClick={() => aplicar(hospedar(estado, r), `Hospedado em ${r.nome} — ${formatValorMoeda(r.preco * 30)} por mês.`)}>Hospedar</Botao>
      )
      break
    case 'escolher':
      acoes = emUso ? (
        <Chip>seu estilo</Chip>
      ) : (
        <Botao onClick={() => aplicar(escolherAlimentacao(estado, r), `Estilo: ${r.nome}.`)}>Escolher</Botao>
      )
      break
    case 'avista':
      acoes = (
        <Botao onClick={() => aplicar(pagarAvista(estado, r.preco, ouro, fator, mult), `${r.nome}: −${formatValorMoeda(preco)}.`)} disabled={ouro < custoEmOuro(preco, fator)}>
          Pagar −{formatValorMoeda(preco)}
        </Botao>
      )
      break
    case 'miudeza': {
      // abaixo de um milhar: não entra na ficha — está (ou não) no estilo do mês
      const eixo = papel === 'alimentacao' ? nivelAtual.alimentacao : nivelAtual.nivel
      const dentro = r.nivel !== undefined && r.nivel <= eixo
      acoes = <Chip>{dentro ? 'no seu estilo' : 'miudeza · fora do estilo'}</Chip>
      break
    }
  }

  const unidade = r.cobranca && r.cobranca !== 'única' ? ` / ${r.cobranca}` : ''
  const extras: string[] = []
  if (r.porKm) extras.push(`+${formatValorMoeda(precoNaRegua(r.porKm, mult))} por km`)
  if (r.longa) extras.push(`longa ${formatValorMoeda(precoNaRegua(r.longa, mult))}`)
  if (r.volume) extras.push(`volume ${formatValorMoeda(precoNaRegua(r.volume, mult))}`)
  if (r.manutencao) extras.push(`manutenção ${formatValorMoeda(r.manutencao)} / mês`)

  return (
    <div
      data-recurso={r.nome}
      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <DetailLink id={r.id}>{r.nome}</DetailLink>
          {r.nivel !== undefined ? <Chip>nível {r.nivel}</Chip> : null}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.resumo}>
          {r.marca ? <InlineFieldValue value={r.marca} /> : null}
          {r.marca && r.resumo ? ' — ' : ''}
          {r.resumo}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, whiteSpace: 'nowrap' }} title={extras.join(' · ') || undefined}>
        {formatValorMoeda(preco)}
        <span style={{ color: 'var(--muted)' }}>{unidade}</span>
      </span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{acoes}</div>
    </div>
  )
}
