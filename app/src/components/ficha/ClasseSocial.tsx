// BANNER DE CLASSE SOCIAL (pedido 2026-09-12) — no topo da aba RECURSOS, a
// letra que a cidade lê no herói: A (Alta) a E (Baixa). Não é o nome de um
// plano: é o mês inteiro — como ele vive (os três planos), o que comprou
// (posse), o que carrega (arma, armadura, módulo, válvula — consumível não
// conta) e o que tem em mãos. A profissão entra por cima, com o piso e o teto
// que ela impõe (a firma paga o endereço do Executivo desde o primeiro dia; o
// Nóia segue na palafita mesmo com as doações).
//
// A régua é dado do mundo (`recursos.classe_social` do Contexto-Def) e o valor
// do equipamento vem do MESMO motor da riqueza da mesa (computeMemberWealthParts,
// espelho do plugin) — nada de conta nova aqui.
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { moedaFator, formatValorMoeda } from '../../data/moeda'
import {
  computeMemberWealthParts,
  isArtefatoId,
  precoPO,
  priceTargets,
  type PriceOf,
} from '../../grupo/wealth'
import { tierFromLevel } from '../../grupo/party'
import { classeCanonica } from '../../recursos/regalias'
import { retratoSocial, type RetratoSocial } from '../../recursos/classe-social'
import type { RecursosCfg } from '../../recursos/types'
import type { CustoMensal, RecursosDoHeroi } from '../../recursos/hero-recursos'
import { clip } from './bits'
import { escapeHtml, TipHover } from './tooltips'

/** Retrato social do herói — null quando o mundo não declara a régua. */
export function useRetratoSocial(
  fm: Record<string, unknown>,
  cfg: RecursosCfg,
  custo: CustoMensal,
  estado: RecursosDoHeroi,
): RetratoSocial | null {
  const catalog = useCatalog()
  const cs = cfg.classeSocial ?? null
  const fator = moedaFator()

  // Pré-carrega os docs dos itens precificáveis (mesmos campos do pricing).
  const priceIds = useMemo(() => {
    if (!cs) return []
    const ids = new Set<string>()
    for (const target of priceTargets(fm)) {
      const res = catalog.resolve(target)
      if (res.kind === 'doc') ids.add(res.id)
    }
    return [...ids].sort()
  }, [fm, catalog, cs])
  const priceDocs = useDocs(priceIds)

  return useMemo(() => {
    if (!cs) return null
    const priceOf: PriceOf = (target) => {
      const res = catalog.resolve(target)
      return res.kind === 'doc' ? precoPO(priceDocs?.get(res.id)) : 0
    }
    const isArtefato = (target: string) => {
      const res = catalog.resolve(target)
      return res.kind === 'doc' && isArtefatoId(res.id)
    }
    const partes = computeMemberWealthParts(fm, priceOf, isArtefato)
    // POSSE = o que foi comprado e é do herói; o que terceiro cede (regalia)
    // aparece na ficha mas não é patrimônio dele.
    const patrimonio = estado.itens
      .filter((i) => !i.pagoPor)
      .reduce((a, i) => a + Math.max(0, i.pago) * Math.max(1, i.qtd), 0)
    return retratoSocial(cs, {
      niveis: custo.eixos.map((e) => e.nivel),
      patrimonio,
      equipamento: partes.itensSemConsumiveis * fator,
      dinheiro: partes.ouro * fator,
      classe: classeCanonica(String(fm['Classe'] ?? '')),
      tier: tierFromLevel(fm['Nível']),
    })
  }, [cs, fm, catalog, priceDocs, estado, custo, fator])
}

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }

function Componente({ rotulo, degrau, valor }: { rotulo: string; degrau: number; valor?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 92 }}>
      <span style={{ ...MONO, fontSize: 10 }}>{rotulo.toUpperCase()}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>
        {'●'.repeat(degrau)}
        <span style={{ color: 'var(--line2)' }}>{'○'.repeat(6 - degrau)}</span>
      </span>
      {valor !== undefined ? <span style={{ ...MONO, fontSize: 10 }}>{formatValorMoeda(valor)}</span> : null}
    </div>
  )
}

export function ClasseSocialBanner({ retrato }: { retrato: RetratoSocial }) {
  const { degraus, valores, tendencia } = retrato
  const linhas = [
    `Padrão de vida: degrau ${degraus.padrao} de 6 — a média dos três planos do mês.`,
    `Patrimônio ${formatValorMoeda(valores.patrimonio)} · equipamento ${formatValorMoeda(valores.equipamento)} · em mãos ${formatValorMoeda(valores.dinheiro)}.`,
    retrato.degrau === retrato.bruto
      ? 'O que ele tem não mudou o degrau do padrão de vida.'
      : `O que ele tem levou o retrato de ${retrato.bruto} pra ${retrato.degrau}.`,
    tendencia
      ? `${tendencia.limite === 'piso' ? 'Piso' : 'Teto'} da profissão: ${tendencia.nota ?? tendencia.classe}.`
      : 'Sem piso nem teto de profissão neste tier.',
  ]
  const dica = [
    '<div class="dv-tooltip-head-row">',
    `<span class="dv-tooltip-head-title">Classe ${escapeHtml(retrato.letra)} — ${escapeHtml(retrato.rotulo)}</span>`,
    '</div>',
    '<div class="dv-tooltip-head-rule"></div>',
    ...linhas.map((l) => `<div class="dv-breakdown-line">${escapeHtml(l)}</div>`),
  ].join('')
  return (
    <div
      data-classe-social={retrato.letra}
      data-classe-degrau={retrato.degrau}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        padding: '12px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
      }}
    >
      <TipHover html={dica}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <b style={{ fontFamily: 'var(--mono)', fontSize: 30, lineHeight: 1, color: 'var(--accent)' }}>{retrato.letra}</b>
          <span style={{ ...MONO, fontSize: 12, color: 'var(--text)' }}>CLASSE {retrato.rotulo.toUpperCase()}</span>
        </div>
      </TipHover>
      <span style={{ flex: 1 }} />
      <Componente rotulo="padrão de vida" degrau={degraus.padrao} />
      <Componente rotulo="patrimônio" degrau={degraus.patrimonio} valor={valores.patrimonio} />
      <Componente rotulo="equipamento" degrau={degraus.equipamento} valor={valores.equipamento} />
      <Componente rotulo="em mãos" degrau={degraus.dinheiro} valor={valores.dinheiro} />
      {tendencia ? (
        <span style={{ ...MONO, fontSize: 10, flexBasis: '100%', color: 'var(--muted)' }}>
          {tendencia.limite === 'piso' ? '▲ PISO DA PROFISSÃO' : '▼ TETO DA PROFISSÃO'}
          {tendencia.nota ? ` — ${tendencia.nota}` : ''}
        </span>
      ) : null}
    </div>
  )
}
