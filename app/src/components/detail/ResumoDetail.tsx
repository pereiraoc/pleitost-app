// Ficha RESUMO na sidebar DETALHES (#180, completada em #199) — visão compacta
// do personagem, espelho do modo Resumo do pleitost-autosheet (render/modes/
// resumo/sections/*): cabeçalho (retrato/nome/classe/nível), vida (vit/moral/
// temp do volátil REAL), chips de defesas/sentidos/movimento (memberStats —
// mesma fonte da tabela do GRUPO; movimento em QUADRADOS "Nq"), perícias
// treinadas por atributo, magias (modificador +N/CD, Potência, EM e listas por
// rank), ataques com armas (modificador/dano/propriedades), ações, técnicas,
// tesouros, habilidades e consumíveis — TUDO com tooltip (breakdowns do
// tooltips.tsx + cartas de regra do item-card). Somente leitura.
//
// APRESENTAÇÃO (#242) — espelho visual do `.as-resumo` do plugin (styles.css
// §MODE Resumo + resumo/internal-helpers.ts) na linguagem do app (clip() +
// vars do theme.css): header-card com accent bar na cor do tier/nível e badge
// NVL/TIER (header.ts §5.1), cada seção é um card com kicker, números
// colorizados como no plugin (.as-resumo-mod-num → var(--red),
// .as-resumo-attr-num → var(--gold), .as-resumo-dmg-num → var(--blue)),
// ataques com "• " + sub-row "↳ " (.as-resumo-attack/-attack-props) e listas
// de itens em chips.
import { Fragment, useMemo, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useDoc } from '../../data/useDoc'
import { synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel, unquote } from '../../markdown/dataview-value'
import { profArmaEfetiva,
  fmPath,
  heroAtributos,
  interativa,
  listaEntries,
  num,
  parseItemAlias,
  profLetter,
  rowMod,
  str,
  tierLetter,
  wikiTarget,
  danoArmaDisplay,
  type ProfRow,
} from '../ficha/hero-model'
import type { Tier } from '../../data/commerce'
import { useVidaLocal } from '../ficha/pop-panels'
import { findNamedRow, fmtPlain, fmtSigned, memberStats, terrestreMoveRow } from '../../grupo/stats'
import { magiaGroups, wikiLabels } from '../ficha/CombateTab'
import { useHeroRefs, type HeroRefs } from '../ficha/useHeroRefs'
import { useNamedDocs } from '../ficha/useNamedDocs'
import {
  TipHover,
  TipProvider,
  ataqueBreakdown,
  danoArmaBreakdown,
  magiaAtaqueBreakdown,
  movimentoBreakdown,
  periciaBreakdown,
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
  type BreakdownResult,
} from '../ficha/tooltips'
import { ItemHover, ITEM_CARD_CSS } from '../item-card'
import { ATTR_EMOJI, classeAventureiro, defesaEmoji, displayName, slugify, tokens } from '../ficha/registry'
import { clip } from '../ficha/bits'
import { computeMagiaAtaque } from '../../interativa/invocacao'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

type Fm = Record<string, unknown>
type Attrs = Record<string, number>

/** Card-base das seções/header — linguagem do app (Panel de ficha/bits):
 *  fundo var(--panel), borda var(--line2), cantos cortados clip(). */
const cardStyle = (clipN: number): CSSProperties => ({
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(clipN),
})

/** Chip de item/valor dentro de um card de seção — mesmo idioma dos stat-cells
 *  do Combate (var(--card) sobre var(--panel)). */
const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  clipPath: clip(6),
  fontSize: 11.5,
  lineHeight: 1.5,
}

/** Cor e rótulo do badge de tier/nível — espelho de tierColorByFamily/
 *  tierLabelByFamily do plugin (resumo/internal-helpers.ts §5.1): herói por
 *  nível (1-3 bronze / 4-6 prata / 7-9 ouro / 10+ platina, via
 *  classeAventureiro do registro) e monstro por Tier (0 preto / 1 bronze /
 *  2 prata / 3+ ouro), cores SEMPRE de tokens.colors.tier. */
function tierBadge(fm: Fm): { n: number; label: 'NVL' | 'TIER'; color: string } | null {
  const nivel = num(fm['Nível'])
  if (nivel) return { n: nivel, label: 'NVL', color: classeAventureiro(nivel).color }
  const tierRaw = fm['Tier']
  if (tierRaw == null || tierRaw === '') return null
  const tier = num(tierRaw)
  const c = tokens.colors.tier
  const color = tier <= 0 ? c.Zero : tier === 1 ? c.Bronze : tier === 2 ? c.Silver : c.Gold
  return { n: tier, label: 'TIER', color }
}

/** Chips de defesas/sentidos/movimento — emojis SEMPRE do registro gerado
 *  (tokens defesa/categoria via defesaEmoji; Movimento do subcategoria), e o
 *  tooltip é o breakdown do plugin (resistencia/sentido/movimentoBreakdown).
 *  Movimento em QUADRADOS ("Nq"), como pede o #199. */
const CHIPS: Array<{
  ic: string
  n: string
  v: (s: ReturnType<typeof memberStats>) => string
  tip: (fm: Fm, attrs: Attrs) => BreakdownResult | null
}> = [
  { ic: defesaEmoji('Defesa'), n: 'DEF', v: (s) => (s.defs['Defesa'] != null ? fmtPlain(s.defs['Defesa']) : '—'), tip: (fm, a) => defesaTip(fm, a, 'Defesa') },
  { ic: defesaEmoji('Ímpeto'), n: 'ÍMP', v: (s) => (s.defs['Ímpeto'] != null ? fmtPlain(s.defs['Ímpeto']) : '—'), tip: (fm, a) => defesaTip(fm, a, 'Ímpeto') },
  { ic: defesaEmoji('Vigor'), n: 'VIG', v: (s) => (s.defs['Vigor'] != null ? fmtPlain(s.defs['Vigor']) : '—'), tip: (fm, a) => defesaTip(fm, a, 'Vigor') },
  { ic: defesaEmoji('Reflexo'), n: 'REF', v: (s) => (s.defs['Reflexo'] != null ? fmtPlain(s.defs['Reflexo']) : '—'), tip: (fm, a) => defesaTip(fm, a, 'Reflexo') },
  { ic: defesaEmoji('Percepção'), n: 'PER', v: (s) => (s.sns['Percepção'] != null ? fmtSigned(s.sns['Percepção']) : '—'), tip: (fm, a) => sentidoTip(fm, a, 'Percepção') },
  { ic: defesaEmoji('Intuição'), n: 'ITU', v: (s) => (s.sns['Intuição'] != null ? fmtSigned(s.sns['Intuição']) : '—'), tip: (fm, a) => sentidoTip(fm, a, 'Intuição') },
  {
    ic: tokens.emojis.subcategoria.Movimento,
    n: 'MOV',
    v: (s) => (s.sp != null ? `${fmtPlain(s.sp)}q` : '—'),
    tip: (fm, a) => {
      const row = terrestreMoveRow(fm)
      return row ? movimentoBreakdown(row as ProfRow, a) : null
    },
  },
]

/** Stat-cell de defesa/sentido/movimento — célula vertical (emoji, rótulo
 *  mono, valor) no idioma dos cards de defesa do Combate; tooltip = mesmo
 *  breakdown dos chips do #199 (TipHover envolve a célula inteira). */
function statCell(
  c: (typeof CHIPS)[number],
  fm: Fm,
  attrs: Attrs,
  stats: ReturnType<typeof memberStats>,
) {
  const tip = c.tip(fm, attrs)
  return (
    <TipHover
      key={c.n}
      html={tip ? renderBreakdownHtml(tip) : null}
      always
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: '6px 2px 7px',
        minWidth: 0,
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: clip(6),
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{c.ic}</span>
      <span style={mono({ fontSize: 8, letterSpacing: '.08em', color: 'var(--muted)', lineHeight: 1 })}>{c.n}</span>
      <span style={mono({ fontSize: 12, fontWeight: 800, lineHeight: 1 })}>{c.v(stats)}</span>
    </TipHover>
  )
}

function defesaTip(fm: Fm, attrs: Attrs, nome: string): BreakdownResult | null {
  const row = findNamedRow(fmPath(fm, 'Defesas_Resistencias', 'Lista'), nome)
  return row ? resistenciaBreakdown(row as ProfRow, attrs) : null
}

function sentidoTip(fm: Fm, attrs: Attrs, nome: string): BreakdownResult | null {
  const row = findNamedRow(fmPath(fm, 'Sentidos', 'Lista'), nome)
  return row ? sentidoBreakdown(row as ProfRow, attrs) : null
}

/** Seção do resumo como CARD com kicker — tradução do `.as-resumo-section` +
 *  `.as-resumo-title` do plugin (título uppercase pequeno) pro idioma de
 *  Panel/PanelTitle do app (ficha/bits). */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      data-resumo-section={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '9px 11px 11px', ...cardStyle(10) }}
    >
      <div data-resumo-kicker="" style={mono({ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--muted)' })}>
        {label}
      </div>
      {children}
    </div>
  )
}

const lineStyle: CSSProperties = { fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }

/** Lista de itens em CHIPS (um por item, com a carta da regra no hover) —
 *  as wrap-rows vírgula-separadas do plugin (tesouros/consumiveis/acoes/
 *  tecnicas/habilidades-block) viram chips no painel estreito. */
function HoverList({
  items,
  refs,
}: {
  items: { key: string; label: string; raw: unknown; tier?: Tier | null; suffix?: string }[]
  refs: HeroRefs
}) {
  return (
    <div data-resumo-chiplist="" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((e, i) => (
        <span key={`${e.key}-${i}`} data-resumo-chip="" style={chipStyle}>
          {/* #257: item COM tier possuído (tesouro/consumível) → card SÓ daquela
              qualidade (como na ficha), não fullBody. Sem tier (ação/técnica/
              habilidade) → prosa completa, como antes. */}
          <ItemHover doc={refs.refDoc(e.raw)} tier={e.tier ?? undefined} fullBody={!e.tier}>
            <span>{e.label}</span>
          </ItemHover>
          {e.suffix ? (
            <span style={mono({ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' })}>{e.suffix}</span>
          ) : null}
        </span>
      ))}
    </div>
  )
}

/** Ordem dos grupos de perícias por atributo — espelho do ATRIB_ORDER do
 *  plugin (resumo/sections/pericias-block.ts). */
const ATRIB_ORDER = ['FOR', 'AGI', 'INT', 'PRE'] as const

function PericiasResumo({ fm, attrs }: { fm: Fm; attrs: Attrs }) {
  const rows = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]
  const grupos = ATRIB_ORDER.map((attr) => ({
    attr,
    list: (Array.isArray(rows) ? rows : []).filter(
      (r) => str(r.Atributo) === attr && profLetter(r) !== 'N',
    ),
  })).filter((g) => g.list.length > 0)
  if (grupos.length === 0) return null
  // Uma linha por atributo (pericias-block do plugin), com o emoji do
  // atributo em coluna própria (hanging indent) e o modificador em
  // var(--red) mono (.as-resumo-mod-num).
  return (
    <Section label="// PERÍCIAS">
      <div
        data-resumo-pericias=""
        style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', columnGap: 5, rowGap: 6, alignItems: 'baseline' }}
      >
        {grupos.map((g) => (
          <Fragment key={g.attr}>
            <span style={{ fontSize: 11 }}>{ATTR_EMOJI[g.attr] ?? ''}</span>
            <div style={lineStyle}>
              {g.list.map((row, i) => (
                <span key={str(row.Nome)}>
                  {i > 0 ? ' · ' : ''}
                  <TipHover html={renderBreakdownHtml(periciaBreakdown(row, attrs))}>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {displayName(slugify(str(row.Nome)))}{' '}
                      <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--red)' })}>
                        {fmtSigned(rowMod(row, attrs))}
                      </span>
                    </span>
                  </TipHover>
                </span>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </Section>
  )
}

function MagiasResumo({
  fm,
  refs,
  namedDoc,
}: {
  fm: Fm
  refs: HeroRefs
  namedDoc: (nome: string) => VaultDoc | undefined
}) {
  // Escolas PROFICIENTES com o modificador de ataque mágico — mesmo filtro
  // implícito da MagiaInfoBar do Combate (computeMagiaAtaque → null pra N).
  const escolas = (fmPath(fm, 'Magias', 'Lista') ?? []) as Fm[]
  const tipos = (Array.isArray(escolas) ? escolas : [])
    .filter((e) => str(e['Nome']) && str(e['Nome']) !== 'Tesouros')
    .map((e) => {
      const rota = `Magia ${str(e['Nome'])}`
      const info = computeMagiaAtaque(fm, rota)
      return info ? { rota, info } : null
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
  const grupos = magiaGroups(fm, refs.refDoc)
  if (tipos.length === 0 && grupos.length === 0) return null

  const potencia = num(fmPath(fm, 'Magias', 'Potencia'))
  const emMax = num(fmPath(fm, 'Magias', 'EM'))
  const rest = interativa(fm).restantes
  const em = rest['EM'] !== undefined ? num(rest['EM']) : emMax

  return (
    <Section label="// MAGIAS">
      {tipos.length ? (
        <>
          {/* Uma linha por escola proficiente (magias-block.ts headerRow):
              nome + modificador em var(--red) mono (.as-resumo-mod-num). */}
          {tipos.map((t) => (
            <div key={t.rota} style={lineStyle}>
              {/* Tipo → nota do compêndio (Magia Arcana/Magia Anima) no hover,
                  como a MagiaInfoBar do Combate. */}
              <ItemHover doc={namedDoc(`Magia ${t.rota.replace(/^Magia\s+/, '').split(' ')[0]}`)} fullBody>
                <span style={{ fontWeight: 600 }}>{t.rota}</span>
              </ItemHover>{' '}
              {/* Modificador +N/CD — formato do resumo do plugin
                  (magias-block.ts: total assinado + CD = total+10). #65: tooltip
                  no MESMO breakdown das perícias (atr/prof/item/esp com emojis). */}
              <TipHover html={renderBreakdownHtml(magiaAtaqueBreakdown(t.info))}>
                <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--red)' })}>
                  {`${fmtSigned(t.info.total)}/CD${t.info.total + 10}`}
                </span>
              </TipHover>
            </div>
          ))}
          {/* Potência/EM em chips; valor em var(--gold) (.as-resumo-attr-num
              do EM no plugin). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <span data-resumo-chip="" style={chipStyle}>
              <ItemHover doc={namedDoc('Potência Mágica')} fullBody>
                <span>
                  <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.PotenciaMagica}</span>{' '}
                  <span style={mono({ fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' })}>
                    POTÊNCIA MÁGICA
                  </span>{' '}
                  <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--gold)' })}>{potencia}</span>
                </span>
              </ItemHover>
            </span>
            <span data-resumo-chip="" style={chipStyle}>
              <ItemHover doc={namedDoc('Energia Mágica')} fullBody>
                <span>
                  <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.EnergiaMagica}</span>{' '}
                  <span style={mono({ fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' })}>
                    ENERGIA MÁGICA
                  </span>{' '}
                  <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--gold)' })}>{`${em}/${emMax}`}</span>
                </span>
              </ItemHover>
            </span>
          </div>
        </>
      ) : null}
      {/* Grupos por rank (magias-block.ts RANK_BUCKETS): rótulo colorido em
          linha própria + itens embaixo — hierarquia tipográfica do plugin. */}
      {grupos.map((g) => (
        <div key={g.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={mono({ fontSize: 9, letterSpacing: '.12em', color: g.cor })}>{g.titulo}</div>
          <div style={lineStyle}>
            {g.magias.map((m, i) => (
              <span key={`${m.n}-${i}`}>
                {i > 0 ? ' · ' : ''}
                <ItemHover doc={m.doc} fullBody>
                  <span style={{ whiteSpace: 'nowrap' }}>{m.n}</span>
                </ItemHover>
              </span>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

function AtaquesResumo({
  fm,
  attrs,
  refs,
  propRuleDoc,
}: {
  fm: Fm
  attrs: Attrs
  refs: HeroRefs
  propRuleDoc: (nome: string) => VaultDoc | undefined
}) {
  const armas = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Fm[]
  const lista = Array.isArray(armas) ? armas : []
  if (lista.length === 0) return null
  const profAtaque = profLetter({ Proficiencia: str(fmPath(fm, 'Ataques', 'Proficiencia')) })
  return (
    <Section label="// ATAQUES">
      {lista.map((arma, i) => {
        const nome = linkLabel(str(arma['Nome']))
        const prop = linkLabel(str(arma['Propriedade']))
        const tier = tierLetter(arma['Categoria'])
        const armaDoc = refs.refDoc(arma['Nome'])
        const propDoc = refs.refDoc(arma['Propriedade'])
        // Base v2: stats da arma no FRONTMATTER; merge com inline (v1).
        const inline = {
          ...((armaDoc?.frontmatter ?? {}) as Fm),
          ...((armaDoc?.inlineFields ?? {}) as Fm),
        }
        const danoRaw = unquote(str(inline['dano']))
        // #374: sem proficiência na categoria da arma (nem nas Específicas),
        // o rank cai pra N — mesmo gate do CombateTab.
        const basenameArma = wikiTarget(str(arma['Nome'])).split('/').pop() ?? nome
        const profArma = profArmaEfetiva(profAtaque, str(inline['grupo']), basenameArma, fm)
        const dano = danoArmaDisplay(danoRaw, profArma)
        const props = wikiLabels(inline['propriedades'])
        const mod = rowMod(
          {
            Atributo: str(arma['Atributo']),
            Proficiencia: profArma,
            Bonus_Item: num(arma['Bonus_Item']),
            Bonus_Especial: num(arma['Bonus_Especial']),
          },
          attrs,
        )
        // Linha da arma no formato do ataques-block do plugin: "• Arma +N,
        // NdM+X" (mod em var(--red) = .as-resumo-mod-num, dano em var(--blue)
        // = .as-resumo-dmg-num) + sub-row "↳ propriedades" indentada
        // (.as-resumo-attack-props).
        return (
          <div key={`${nome}-${i}`} data-resumo-ataque="" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={lineStyle}>
              <span style={{ color: 'var(--muted)' }}>{'• '}</span>
              <ItemHover doc={armaDoc} propDoc={propDoc} tier={tier ?? undefined}>
                <span style={{ fontWeight: 600 }}>
                  {`${nome}${prop ? ` ${prop}` : ''}${tier ? ` (${tier})` : ''}`}
                </span>
              </ItemHover>{' '}
              <TipHover
                html={renderBreakdownHtml(
                  ataqueBreakdown(
                    nome,
                    str(arma['Atributo']),
                    profArma,
                    num(arma['Bonus_Item']),
                    num(arma['Bonus_Especial']),
                    attrs[str(arma['Atributo'])] ?? 0,
                  ),
                )}
              >
                <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--red)' })}>{fmtSigned(mod)}</span>
              </TipHover>
              {dano ? (
                <>
                  {', '}
                  <TipHover html={renderBreakdownHtml(danoArmaBreakdown(nome, danoRaw, profArma))}>
                    <span style={mono({ fontSize: 11, fontWeight: 800, color: 'var(--blue)' })}>{dano}</span>
                  </TipHover>
                </>
              ) : null}
            </div>
            {props.length ? (
              <div style={{ ...lineStyle, color: 'var(--muted)', paddingLeft: 14 }}>
                {'↳ '}
                {props.map((p, j) => (
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
    </Section>
  )
}

/** Propriedade parametrizada ("Arremesso 3") → doc-base ("Arremesso") — mesmo
 *  propBase da aba Combate. */
const propBase = (p: string) => p.replace(/\s+\d+(\/\d+)?\s*$/, '').trim()

/** Itens do inventário (tesouros/consumíveis) a partir dos aliases salvos
 *  ("[[X|X (Adepto) (x2)]]"), com dedup opcional por alvo+tier — espelho de
 *  tesouros-block/consumiveis-block do resumo do plugin. */
function inventarioItens(
  raw: unknown,
  opts: { dedup: boolean; comQtd: boolean },
): { key: string; label: string; raw: unknown; tier: Tier | null; suffix?: string }[] {
  const lista = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: { key: string; label: string; raw: unknown; tier: Tier | null; suffix?: string }[] = []
  for (const item of lista) {
    const { nome, tier, qtd } = parseItemAlias(item)
    if (!nome) continue
    if (opts.comQtd && qtd <= 0) continue
    const key = `${wikiTarget(item)}|${tier ?? ''}`
    if (opts.dedup) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push({
      key,
      label: tier ? `${nome} (${tier})` : nome,
      raw: item,
      // #257: guarda o tier POSSUÍDO (A/E/M) pra o tooltip mostrar só a qualidade
      // relevante (como na ficha), não a prosa inteira de todas as qualidades.
      tier,
      suffix: opts.comQtd ? ` x${qtd}` : undefined,
    })
  }
  return out
}

function ResumoBody({ doc }: { doc: VaultDoc }) {
  const assets = useAssetIndex()
  const vida = useVidaLocal(doc, 'resumo')
  const stats = memberStats(doc.frontmatter)
  const fm = doc.frontmatter as Fm
  const refs = useHeroRefs(doc)
  // Notas do compêndio pros tooltips da linha de magias (mesma lista da aba
  // Combate) + regras das propriedades intrínsecas das armas.
  const namedDoc = useNamedDocs(['Potência Mágica', 'Energia Mágica', 'Magia Arcana', 'Magia Anima'])
  const armasFm = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Fm[]
  const propRuleDoc = useNamedDocs(
    (Array.isArray(armasFm) ? armasFm : []).flatMap((a) => {
      const armaDoc = refs.refDoc(a['Nome'])
      const inline = {
        ...((armaDoc?.frontmatter ?? {}) as Fm),
        ...((armaDoc?.inlineFields ?? {}) as Fm),
      }
      return wikiLabels(inline['propriedades']).map(propBase)
    }),
  )
  const { values: attrs } = useMemo(() => heroAtributos(fm), [fm])
  // #280: mini-retrato do card de resumo (pequeno) → thumb.
  const portrait = creatureImageUrl(doc, assets, true)
  const classe = linkLabel(str(fm['Classe']))
  const nivel = num(fm['Nível'])
  const tier = fm['Tier']

  const habs = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))
  const tecs = listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))
  // Ações de habilidade (Acoes.Lista) — dedup por alvo, como o acoes-block.
  const acoes = useMemo(() => {
    const seen = new Set<string>()
    return listaEntries(fmPath(fm, 'Acoes', 'Lista')).filter((e) => {
      if (!e.target || seen.has(e.target)) return false
      seen.add(e.target)
      return true
    })
  }, [fm])
  const tesouros = useMemo(
    () => inventarioItens(fmPath(fm, 'Inventario', 'Tesouros'), { dedup: true, comQtd: false }),
    [fm],
  )
  const consumiveis = useMemo(
    () => inventarioItens(fmPath(fm, 'Inventario', 'Consumiveis'), { dedup: false, comQtd: true }),
    [fm],
  )

  const badge = tierBadge(fm)
  const accentColor = badge?.color ?? 'var(--muted)'

  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 8px' }}>
        {/* Header-card — espelho do `.as-resumo` + header.ts do plugin:
            accent bar lateral na cor do tier/nível (gradient do
            .as-resumo-accent) e badge NVL/TIER (.as-resumo-badge). */}
        <div
          data-resumo-card=""
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '11px 11px 11px 16px',
            ...cardStyle(12),
          }}
        >
          <div
            data-resumo-accent=""
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: `linear-gradient(180deg, ${accentColor}, color-mix(in srgb, ${accentColor} 60%, black))`,
            }}
          />
          {portrait ? (
            <div
              style={{
                width: 52,
                height: 52,
                flex: 'none',
                backgroundImage: `url("${portrait}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1px solid var(--line2)',
                clipPath: clip(10),
              }}
            />
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.2px' }}>
              {doc.basename}
            </div>
            <div style={mono({ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 })}>
              {[classe, nivel ? `Nível ${nivel}` : tier != null && tier !== '' ? `Tier ${tier}` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {badge ? (
            <div
              data-resumo-badge=""
              style={{
                flex: 'none',
                width: 42,
                height: 42,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${badge.color} 18%, var(--card))`,
                border: `2px solid ${badge.color}`,
                clipPath: clip(8),
              }}
            >
              <div style={mono({ fontSize: 15, fontWeight: 800, lineHeight: 1 })}>{badge.n}</div>
              <div style={mono({ fontSize: 7.5, letterSpacing: '1px', color: 'var(--muted)', marginTop: 2 })}>
                {badge.label}
              </div>
            </div>
          ) : null}
        </div>

        <Section label="// VIDA">
          {/* Vit/Moral/Temp em chips — emojis do registro (subcategoria
              Vitalidade/Moral/MoralTemporaria). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <span data-resumo-chip="" style={chipStyle}>
              <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.Vitalidade}</span>
              <span style={mono({ fontSize: 11.5, fontWeight: 700 })}>{`${vida.vit}/${vida.vitMax}`}</span>
            </span>
            <span data-resumo-chip="" style={chipStyle}>
              <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.Moral}</span>
              <span style={mono({ fontSize: 11.5, fontWeight: 700 })}>{`${vida.moral}/${vida.moralMax}`}</span>
            </span>
            {vida.temp > 0 ? (
              <span data-resumo-chip="" style={chipStyle}>
                <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.MoralTemporaria}</span>
                <span style={mono({ fontSize: 11.5, fontWeight: 700 })}>{`+${vida.temp}`}</span>
              </span>
            ) : null}
          </div>
        </Section>

        <Section label="// DEFESAS · SENTIDOS · MOVIMENTO">
          {/* Grids alinhados de stat-cells (4 defesas / 2 sentidos +
              movimento) — idioma dos cards de defesa do Combate, com o
              conteúdo/tooltips dos chips do #199. */}
          <div
            data-resumo-statgrid="defesas"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 5 }}
          >
            {CHIPS.slice(0, 4).map((c) => statCell(c, fm, attrs, stats))}
          </div>
          <div
            data-resumo-statgrid="sentidos"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 5 }}
          >
            {CHIPS.slice(4).map((c) => statCell(c, fm, attrs, stats))}
          </div>
        </Section>

        <PericiasResumo fm={fm} attrs={attrs} />
        <MagiasResumo fm={fm} refs={refs} namedDoc={namedDoc} />
        <AtaquesResumo fm={fm} attrs={attrs} refs={refs} propRuleDoc={propRuleDoc} />

        {acoes.length ? (
          <Section label="// AÇÕES">
            <HoverList items={acoes.map((e) => ({ key: e.target, label: e.label, raw: e.raw }))} refs={refs} />
          </Section>
        ) : null}
        {tecs.length ? (
          <Section label="// TÉCNICAS">
            <HoverList items={tecs.map((e) => ({ key: e.target, label: e.label, raw: e.raw }))} refs={refs} />
          </Section>
        ) : null}
        {tesouros.length ? (
          <Section label="// TESOUROS">
            <HoverList items={tesouros} refs={refs} />
          </Section>
        ) : null}
        {habs.length ? (
          <Section label="// HABILIDADES">
            <HoverList items={habs.map((e) => ({ key: e.target, label: e.label, raw: e.raw }))} refs={refs} />
          </Section>
        ) : null}
        {consumiveis.length ? (
          <Section label="// CONSUMÍVEIS">
            <HoverList items={consumiveis} refs={refs} />
          </Section>
        ) : null}
      </div>
    </TipProvider>
  )
}

export function ResumoDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  if (!doc) return <div className="loading">Carregando resumo…</div>
  return <ResumoBody doc={doc} />
}

/** Resumo de personagem REMOTO da sala (#186): doc sintético do fmBlob +
 *  vida do state (live-session) — mesmo corpo do resumo local. */
export function ResumoSessaoDetail({ charId }: { charId: string }) {
  const live = useLiveSession()
  const c = live?.characters.find((x) => x.id === charId) ?? null
  if (!c) return <div className="detail-empty">Personagem fora da sala.</div>
  return <ResumoBody doc={synthDocFromCharacter(c)} />
}
