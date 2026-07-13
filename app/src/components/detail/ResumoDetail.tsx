// Ficha RESUMO na sidebar DETALHES (#180, completada em #199) — visão compacta
// do personagem, espelho do modo Resumo do pleitost-autosheet (render/modes/
// resumo/sections/*): cabeçalho (retrato/nome/classe/nível), vida (vit/moral/
// temp do volátil REAL), chips de defesas/sentidos/movimento (memberStats —
// mesma fonte da tabela do GRUPO; movimento em QUADRADOS "Nq"), perícias
// treinadas por atributo, magias (modificador +N/CD, Potência, EM e listas por
// rank), ataques com armas (modificador/dano/propriedades), ações, técnicas,
// tesouros, habilidades e consumíveis — TUDO com tooltip (breakdowns do
// tooltips.tsx + cartas de regra do item-card). Somente leitura.
import { useMemo, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useDoc } from '../../data/useDoc'
import { synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel, unquote } from '../../markdown/dataview-value'
import {
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
  entriesBreakdown,
  movimentoBreakdown,
  periciaBreakdown,
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
  type BreakdownResult,
} from '../ficha/tooltips'
import { ItemHover, ITEM_CARD_CSS } from '../item-card'
import { ATTR_EMOJI, defesaEmoji, displayName, slugify, tokens } from '../ficha/registry'
import { computeMagiaAtaque } from '../../interativa/invocacao'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

type Fm = Record<string, unknown>
type Attrs = Record<string, number>

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

function defesaTip(fm: Fm, attrs: Attrs, nome: string): BreakdownResult | null {
  const row = findNamedRow(fmPath(fm, 'Defesas_Resistencias', 'Lista'), nome)
  return row ? resistenciaBreakdown(row as ProfRow, attrs) : null
}

function sentidoTip(fm: Fm, attrs: Attrs, nome: string): BreakdownResult | null {
  const row = findNamedRow(fmPath(fm, 'Sentidos', 'Lista'), nome)
  return row ? sentidoBreakdown(row as ProfRow, attrs) : null
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={mono({ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--muted)' })}>{label}</div>
      {children}
    </div>
  )
}

const lineStyle: CSSProperties = { fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }

/** Lista compacta "A · B · C" com a carta da regra no hover de cada item. */
function HoverList({
  items,
  refs,
}: {
  items: { key: string; label: string; raw: unknown; suffix?: string }[]
  refs: HeroRefs
}) {
  return (
    <div style={lineStyle}>
      {items.map((e, i) => (
        <span key={`${e.key}-${i}`}>
          {i > 0 ? ' · ' : ''}
          <ItemHover doc={refs.refDoc(e.raw)} fullBody>
            <span>{e.label}</span>
          </ItemHover>
          {e.suffix ?? ''}
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
  return (
    <Section label="// PERÍCIAS">
      {grupos.map((g) => (
        <div key={g.attr} style={lineStyle}>
          <span style={{ fontSize: 11 }}>{ATTR_EMOJI[g.attr] ?? ''}</span>{' '}
          {g.list.map((row, i) => (
            <span key={str(row.Nome)}>
              {i > 0 ? ' · ' : ''}
              <TipHover html={renderBreakdownHtml(periciaBreakdown(row, attrs))}>
                <span>
                  {displayName(slugify(str(row.Nome)))}{' '}
                  <span style={mono({ fontSize: 11, fontWeight: 700 })}>{fmtSigned(rowMod(row, attrs))}</span>
                </span>
              </TipHover>
            </span>
          ))}
        </div>
      ))}
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
        <div style={{ ...lineStyle, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 3 }}>
          {tipos.map((t) => (
            <span key={t.rota} style={{ whiteSpace: 'nowrap' }}>
              {/* Tipo → nota do compêndio (Magia Arcana/Magia Anima) no hover,
                  como a MagiaInfoBar do Combate. */}
              <ItemHover doc={namedDoc(`Magia ${t.rota.replace(/^Magia\s+/, '').split(' ')[0]}`)} fullBody>
                <span style={{ fontWeight: 600 }}>{t.rota}</span>
              </ItemHover>{' '}
              {/* Modificador +N/CD — formato do resumo do plugin
                  (magias-block.ts: total assinado + CD = total+10); tooltip =
                  somatório do ataque mágico (entriesBreakdown, como o #143). */}
              <TipHover html={renderBreakdownHtml(entriesBreakdown('Ataque Mágico', t.info.entries ?? []))}>
                <span style={mono({ fontSize: 11, fontWeight: 700 })}>
                  {`${fmtSigned(t.info.total)}/CD${t.info.total + 10}`}
                </span>
              </TipHover>
            </span>
          ))}
          <span style={{ whiteSpace: 'nowrap' }}>
            <ItemHover doc={namedDoc('Potência Mágica')} fullBody>
              <span>
                <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.PotenciaMagica}</span>{' '}
                <span style={mono({ fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' })}>
                  POTÊNCIA MÁGICA
                </span>{' '}
                <span style={mono({ fontSize: 11, fontWeight: 700 })}>{potencia}</span>
              </span>
            </ItemHover>
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>
            <ItemHover doc={namedDoc('Energia Mágica')} fullBody>
              <span>
                <span style={{ fontSize: 11 }}>{tokens.emojis.subcategoria.EnergiaMagica}</span>{' '}
                <span style={mono({ fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' })}>
                  ENERGIA MÁGICA
                </span>{' '}
                <span style={mono({ fontSize: 11, fontWeight: 700 })}>{`${em}/${emMax}`}</span>
              </span>
            </ItemHover>
          </span>
        </div>
      ) : null}
      {grupos.map((g) => (
        <div key={g.titulo} style={{ fontSize: 12, lineHeight: 1.6 }}>
          <span style={mono({ fontSize: 9, letterSpacing: '.1em', color: g.cor })}>{g.titulo}</span>{' '}
          {g.magias.map((m, i) => (
            <span key={`${m.n}-${i}`}>
              {i > 0 ? ' · ' : ''}
              <ItemHover doc={m.doc} fullBody>
                <span>{m.n}</span>
              </ItemHover>
            </span>
          ))}
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
        const dano = danoArmaDisplay(danoRaw, profAtaque)
        const props = wikiLabels(inline['propriedades'])
        const mod = rowMod(
          {
            Atributo: str(arma['Atributo']),
            Proficiencia: profAtaque,
            Bonus_Item: num(arma['Bonus_Item']),
            Bonus_Especial: num(arma['Bonus_Especial']),
          },
          attrs,
        )
        return (
          <div key={`${nome}-${i}`} style={lineStyle}>
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
                  profAtaque,
                  num(arma['Bonus_Item']),
                  num(arma['Bonus_Especial']),
                  attrs[str(arma['Atributo'])] ?? 0,
                ),
              )}
            >
              <span style={mono({ fontSize: 11, fontWeight: 700 })}>{fmtSigned(mod)}</span>
            </TipHover>
            {dano ? (
              <>
                {', '}
                <TipHover html={renderBreakdownHtml(danoArmaBreakdown(nome, danoRaw, profAtaque))}>
                  <span style={mono({ fontSize: 11, fontWeight: 700, color: 'var(--red)' })}>{dano}</span>
                </TipHover>
              </>
            ) : null}
            {props.length ? (
              <div style={{ ...lineStyle, color: 'var(--muted)' }}>
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
): { key: string; label: string; raw: unknown; suffix?: string }[] {
  const lista = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: { key: string; label: string; raw: unknown; suffix?: string }[] = []
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
  const portrait = creatureImageUrl(doc, assets)
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

  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
              }}
            />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{doc.basename}</div>
            <div style={mono({ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 })}>
              {[classe, nivel ? `Nível ${nivel}` : tier != null && tier !== '' ? `Tier ${tier}` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>

        <Section label="// VIDA">
          <div style={mono({ fontSize: 12, color: 'var(--text)' })}>
            {`❤️ ${vida.vit}/${vida.vitMax} · 💙 ${vida.moral}/${vida.moralMax}${vida.temp > 0 ? ` · 💚 +${vida.temp}` : ''}`}
          </div>
        </Section>

        <Section label="// DEFESAS · SENTIDOS · MOVIMENTO">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CHIPS.map((c) => {
              const tip = c.tip(fm, attrs)
              return (
                <TipHover key={c.n} html={tip ? renderBreakdownHtml(tip) : null} always>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 7px',
                      background: 'var(--panel)',
                      border: '1px solid var(--line2)',
                    }}
                  >
                    <span style={{ fontSize: 10 }}>{c.ic}</span>
                    <span style={mono({ fontSize: 8.5, letterSpacing: '.06em', color: 'var(--muted)' })}>{c.n}</span>
                    <span style={mono({ fontSize: 10.5, fontWeight: 700 })}>{c.v(stats)}</span>
                  </span>
                </TipHover>
              )
            })}
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
