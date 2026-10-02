// ESCUDO DO MESTRE — conteúdo das vistas por combatente (ATAQUES/MAGIAS/
// PERÍCIAS/HABILIDADES/PERTENCES). Tudo reusa as peças do RESUMO (ResumoDetail): mesmos chips, breakdowns e cartas
// no hover; nada de modelo novo. Lê o FM publicado (doc sintético), SEM
// useHeroRules/useInterativaCtx (custo por combatente — perícias/defesas
// sem os deltas de condição, aceito no plano).
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { habilidadeOcultaNoEscudo } from './disponibilidade'
import {
  atributoDeAtaqueDaArma,
  danoArmaDisplay,
  docField,
  exigenciaIntDaArma,
  fmOf,
  fmPath,
  heroAtributos,
  num,
  parseDanoArma,
  PROF_DICE,
  profArmaEfetiva,
  rowMod,
  str,
  tierLetter,
  wikiTarget,
} from '../../ficha/hero-model'
import { useHeroRefs } from '../../ficha/useHeroRefs'
import { useHeroRules } from '../../../rules/useHeroRules'
import { useNamedDocs } from '../../ficha/useNamedDocs'
import { wikiLabels } from '../../ficha/CombateTab'
import { useInterativaCtx, type InterativaCtxState } from '../../../interativa/useInterativaCtx'
import { applyDanoCtx } from '../../../interativa/dano'
import { applyTarget, entriesTitle, stripSharedFrom, toneColor, valueTone } from '../../../interativa/apply'
import { collectCustomAtaques, type CustomAtaque } from '../../../interativa/arma-custom'
import type { AtributoId } from '../../../interativa/condition-context'
import type { HeroRefs } from '../../ficha/useHeroRefs'
import { linkLabel, unquote } from '../../../markdown/dataview-value'
import { reskinName } from '../../../data/reskin'
import { fmtSigned } from '../../../grupo/stats'
import { ItemHover } from '../../item-card'
import { TipHover, ataqueBreakdown, danoArmaBreakdown, modAppendixHtml, renderBreakdownHtml } from '../../ficha/tooltips'
import {
  AcoesResumo,
  HabilidadesResumo,
  HoverList,
  MagiasResumo,
  PericiasResumo,
  Section,
  TecnicasResumo,
  inventarioItens,
  propBase,
  type Fm,
} from '../../detail/ResumoDetail'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function Vazio({ texto }: { texto: string }) {
  return <div style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>{texto}</div>
}

/* ── ATAQUES ─────────────────────────────────────────────────────────── */

/** ATAQUES compactos (feedback 2026-10-02: o painel inteiro da aba Combate
 *  "ocupa um espaço gigante"): uma linha por arma no formato do resumo
 *  ("• Arma +N, dano" + "↳ propriedades"), mas com acerto e dano calculados
 *  COMO NA TELA DE COMBATE — contexto da Interativa do combatente (Vantagem
 *  de Combate, Acerto Decisivo, Apunhalante, Fatal, encantamentos, condições
 *  do state da sessão), ataques custom (garras) incluídos, do maior pro menor
 *  acerto. Sem figuras, sem fila de chips (as condições se ligam na linha).
 *  Tooltips = os mesmos breakdowns do Combate (base + modificadores aplicados). */
export function SubAtaques({ vm }: { vm: CombatenteVM }) {
  const refs = useHeroRefs(vm.doc)
  const inter = useInterativaCtx(vm.doc, refs)
  // base = FM derivado (atributos/proficiência cascateados), como no painel da ficha
  const rules = useHeroRules(vm.doc.frontmatter as Fm)
  if (vm.semFicha) return <Vazio texto="sem ficha — ataques indisponíveis" />
  if (!inter.loaded) return <div className="loading">Carregando ataques…</div>
  return <AtaquesCompactos fm={(rules?.derivedFm as Fm | undefined) ?? (vm.doc.frontmatter as Fm)} refs={refs} inter={inter} />
}

const lineStyle: CSSProperties = { fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }

function AtaquesCompactos({ fm, refs, inter }: { fm: Fm; refs: HeroRefs; inter: InterativaCtxState }) {
  const { values: attrs } = heroAtributos(fm)
  const profAtaque = str(fmPath(fm, 'Ataques', 'Proficiencia'))
  const armasFm = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Fm[]
  const naturaisFm = ((fmPath(fm, 'Ataques', 'Lista') ?? []) as Fm[]).filter((r) => str(r['Nome']) !== 'Manobras')
  const customAtaques = collectCustomAtaques(inter.descriptors, attrs['FOR'] ?? 0, attrs['AGI'] ?? 0)
  const armas: Fm[] = [
    ...(Array.isArray(armasFm) ? armasFm : []),
    ...naturaisFm,
    ...customAtaques.map((c) => ({ Nome: c.link, Atributo: c.atributo, Bonus_Item: c.bonusItem, Bonus_Especial: 0, Categoria: '', Propriedade: '', __custom: c })),
  ]
  const propRuleDoc = useNamedDocs([
    ...[...(Array.isArray(armasFm) ? armasFm : []), ...naturaisFm].flatMap((a) => wikiLabels(docField(refs.refDoc(a['Nome']), 'propriedades')).map(propBase)),
    ...customAtaques.flatMap((c) => wikiLabels(c.propriedades).map(propBase)),
  ])
  const linhas = armas
    .map((arma) => {
      const cust = arma['__custom'] as CustomAtaque | undefined
      const nome = cust ? cust.label : linkLabel(str(arma['Nome']))
      if (!nome) return null
      const nomeExib = reskinName(nome)
      const prop = cust ? '' : linkLabel(str(arma['Propriedade']))
      const basename = cust ? cust.label : (wikiTarget(str(arma['Nome'])).split('/').pop() ?? nome)
      const armaDoc = refs.refDoc(arma['Nome'])
      const propDoc = refs.refDoc(arma['Propriedade'])
      const inline = cust
        ? { dano: cust.dano, tipo: cust.tipo, propriedades: cust.propriedades }
        : { ...((armaDoc?.frontmatter ?? {}) as Fm), ...((armaDoc?.inlineFields ?? {}) as Fm) }
      const danoRaw = unquote(str(inline['dano']))
      const grupoArma = (cust ? cust.grupo : str(fmOf(armaDoc)['grupo'])).toLowerCase().trim()
      const profArma = profArmaEfetiva(profAtaque, grupoArma, basename, fm)
      const atributoArma = atributoDeAtaqueDaArma(grupoArma, arma['Atributo'])
      const calc = parseDanoArma(danoRaw)
      const danoRes = calc.die
        ? applyDanoCtx({ baseDice: calc.dice, profDice: PROF_DICE[profArma] ?? 0, dieSize: calc.die, offset: calc.offset }, inter.ctx, basename)
        : null
      const dano = danoRes ? danoRes.display : danoArmaDisplay(danoRaw, profArma)
      const modBase = rowMod(
        { Atributo: atributoArma, Proficiencia: profArma, Bonus_Item: num(arma['Bonus_Item']), Bonus_Especial: num(arma['Bonus_Especial']) },
        attrs,
      )
      const modApplied = applyTarget(inter.ctx, { kind: 'attack', attr: atributoArma as AtributoId, sourceId: basename })
      const mod = modBase + modApplied.delta
      const intExigido = exigenciaIntDaArma(inline['propriedades'])
      const travaInt = intExigido !== null && (attrs['INT'] ?? 0) < intExigido ? intExigido : null
      return {
        key: `${nome}|${prop}`,
        nome, nomeExib, prop, tier: tierLetter(arma['Categoria']), armaDoc, propDoc, danoRaw, profArma, atributoArma,
        bonusItem: num(arma['Bonus_Item']), bonusEspecial: num(arma['Bonus_Especial']),
        dano, danoRes, mod, modApplied, travaInt, props: wikiLabels(inline['propriedades']),
      }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => b.mod - a.mod)
  if (linhas.length === 0) return <Vazio texto="sem ataques" />
  return (
    <div data-escudo-ataques="" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {linhas.map((l) => {
        const danoMods =
          l.danoRes && (l.danoRes.entries.length || l.danoRes.finalDieSize !== l.danoRes.baseDieSize)
            ? renderBreakdownHtml({
                headerEmoji: '',
                title: `${l.nomeExib} — Modificadores de dano`,
                total: 0,
                hideTotal: true,
                headerSigned: true,
                parts: [
                  ...l.danoRes.entries.map((e) => {
                    const tone: 'pos' | 'neg' = e.value < 0 ? 'neg' : 'pos'
                    return e.value === 0
                      ? { emoji: '', label: stripSharedFrom(e.label), value: 0, noValue: true, tone }
                      : { emoji: '', label: stripSharedFrom(e.label), value: e.value, tone }
                  }),
                  ...l.danoRes.dieStepSources.map((label) => ({
                    emoji: '',
                    label: `${stripSharedFrom(label)} (d${l.danoRes!.baseDieSize} → d${l.danoRes!.finalDieSize})`,
                    value: 0,
                    noValue: true,
                    tone: 'pos' as const,
                  })),
                ],
              })
            : ''
        return (
          <div key={l.key} data-ataque-linha={l.nomeExib} data-ataque-mod={l.mod} data-ataque-dano={l.dano} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={lineStyle}>
              <span style={{ color: 'var(--muted)' }}>{'• '}</span>
              <ItemHover doc={l.armaDoc} propDoc={l.propDoc} tier={l.tier || undefined}>
                <span style={{ fontWeight: 600 }}>{`${l.nomeExib}${l.prop ? ` ${reskinName(l.prop)}` : ''}${l.tier ? ` (${l.tier})` : ''}`}</span>
              </ItemHover>{' '}
              {l.travaInt !== null ? (
                <span style={mono({ fontSize: 10.5, fontWeight: 700, color: toneColor('penalty') })} title={`Esta arma exige INT ${l.travaInt} para ser usada`}>
                  {`🔒 EXIGE INT ${l.travaInt}`}
                </span>
              ) : (
                <>
                  <TipHover
                    html={
                      renderBreakdownHtml(ataqueBreakdown(l.nome, l.atributoArma, l.profArma, l.bonusItem, l.bonusEspecial, attrs[l.atributoArma] ?? 0)) +
                      modAppendixHtml(`${l.nomeExib} — Modificadores de acerto`, l.modApplied.entries)
                    }
                  >
                    <span title={l.modApplied.entries.length ? entriesTitle(l.modApplied.entries) : undefined} style={mono({ fontSize: 11, fontWeight: 800, color: toneColor(valueTone(l.modApplied.entries)) ?? 'var(--red)' })}>
                      {fmtSigned(l.mod)}
                    </span>
                  </TipHover>
                  {l.dano ? (
                    <>
                      {', '}
                      <TipHover html={renderBreakdownHtml(danoArmaBreakdown(l.nomeExib, l.danoRaw, l.profArma)) + danoMods}>
                        <span style={mono({ fontSize: 11, fontWeight: 800, color: l.danoRes?.hasPenalty ? toneColor('penalty') : l.danoRes?.hasDelta ? toneColor('bonus') : 'var(--blue)' })}>
                          {l.dano}
                        </span>
                      </TipHover>
                    </>
                  ) : null}
                </>
              )}
            </div>
            {l.props.length ? (
              <div style={{ ...lineStyle, color: 'var(--muted)', paddingLeft: 14 }}>
                {'↳ '}
                {l.props.map((p, j) => (
                  <span key={p}>
                    {j > 0 ? ', ' : ''}
                    <ItemHover doc={propRuleDoc(propBase(p))} fullBody>
                      <span>{p}</span>
                    </ItemHover>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ── MAGIAS / TECNOLOGIAS ────────────────────────────────────────────── */

export function SubTecnologias({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const namedDoc = useNamedDocs(['Potência Mágica', 'Energia Mágica', 'Magia Arcana', 'Magia Anima'])
  if (vm.semFicha) return <Vazio texto="sem ficha — magias indisponíveis" />
  return (
    <div data-escudo-magias="">
      <MagiasResumo fm={fm} refs={refs} namedDoc={namedDoc} />
    </div>
  )
}

/* ── PERÍCIAS ────────────────────────────────────────────────────────── */

export function SubPericias({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const { values: attrs } = useMemo(() => heroAtributos(fm), [fm])
  if (vm.semFicha) return <Vazio texto="sem ficha — perícias indisponíveis" />
  return (
    <div data-escudo-pericias="">
      <PericiasResumo fm={fm} attrs={attrs} ordem="desc" />
    </div>
  )
}

/* ── HABILIDADES ─────────────────────────────────────────────────────── */

export function SubHabilidades({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const catalog = useCatalog()
  // Pedido 2026-10-02: modificadores de bestiário (Competente/Solo/Elite/
  // Evolução Básica de Monstro) e ESSÊNCIAS ficam fora — os primeiros são a
  // estrutura do monstro, as segundas aparecem em MAGIAS. Corte pela PASTA.
  const ocultar = (target: string) => habilidadeOcultaNoEscudo(catalog, target)
  if (vm.semFicha) return <Vazio texto="sem ficha — habilidades indisponíveis" />
  return (
    <div data-escudo-habilidades="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <HabilidadesResumo fm={fm} refs={refs} ocultar={ocultar} />
      <TecnicasResumo fm={fm} refs={refs} />
      <AcoesResumo fm={fm} refs={refs} />
    </div>
  )
}

/* ── PERTENCES ───────────────────────────────────────────────────────── */

export function SubPertences({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  // armas, escudo e armadura NÃO entram (pedido 2026-10-02): armas estão em
  // ATAQUES, o escudo no bloco da linha, a armadura já conta nas defesas —
  // aqui só tesouros e consumíveis
  const tesouros = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Tesouros'), { dedup: true, comQtd: false }), [fm])
  const consumiveis = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Consumiveis'), { dedup: false, comQtd: true }), [fm])
  if (vm.semFicha) return <Vazio texto="sem ficha — pertences indisponíveis" />
  if (!tesouros.length && !consumiveis.length) return <Vazio texto="nada no inventário" />
  return (
    <div data-escudo-pertences="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tesouros.length ? (
        <Section label="// TESOUROS">
          <HoverList items={tesouros} refs={refs} />
        </Section>
      ) : null}
      {consumiveis.length ? (
        <Section label="// CONSUMÍVEIS">
          <HoverList items={consumiveis} refs={refs} />
        </Section>
      ) : null}
    </div>
  )
}
