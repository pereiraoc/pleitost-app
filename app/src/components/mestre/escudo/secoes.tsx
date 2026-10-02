// ESCUDO DO MESTRE — conteúdo por combatente de cada sub-aba de ficha. Tudo
// reusa as peças do RESUMO (ResumoDetail): mesmos chips, breakdowns e cartas
// no hover; nada de modelo novo. Lê o FM publicado (doc sintético), SEM
// useHeroRules/useInterativaCtx (custo por combatente — perícias/defesas
// sem os deltas de condição, aceito no plano).
import { useMemo, type CSSProperties } from 'react'
import type { CharacterStats } from '../../../data/session-repo/contract'
import { fmPath, heroAtributos, str, wikiTarget } from '../../ficha/hero-model'
import { memberStats } from '../../../grupo/stats'
import { useHeroRefs } from '../../ficha/useHeroRefs'
import { useNamedDocs } from '../../ficha/useNamedDocs'
import { wikiLabels } from '../../ficha/CombateTab'
import { linkLabel } from '../../../markdown/dataview-value'
import { reskinName } from '../../../data/reskin'
import { ItemHover } from '../../item-card'
import {
  AcoesResumo,
  AtaquesResumo,
  CHIPS,
  HabilidadesResumo,
  HoverList,
  MagiasResumo,
  PericiasResumo,
  Section,
  TecnicasResumo,
  chipStyle,
  inventarioItens,
  propBase,
  statCell,
  type Fm,
} from '../../detail/ResumoDetail'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function Vazio({ texto }: { texto: string }) {
  return <div style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>{texto}</div>
}

/* ── DEFESAS ─────────────────────────────────────────────────────────── */

/** Chips do summary publicado (fallback sem ficha): rótulos/emoji dos mesmos
 *  CHIPS do resumo, valores do CharacterStats. */
const SUMMARY_STATS: { n: string; k: keyof CharacterStats }[] = [
  { n: 'DEF', k: 'defesa' },
  { n: 'ÍMP', k: 'impeto' },
  { n: 'VIG', k: 'vigor' },
  { n: 'REF', k: 'evasao' },
  { n: 'PER', k: 'percepcao' },
  { n: 'ITU', k: 'intuicao' },
  { n: 'MOV', k: 'movimento' },
]

export function SubDefesas({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const { values: attrs } = useMemo(() => heroAtributos(fm), [fm])
  if (vm.semFicha) {
    const s = vm.c.summary.stats
    return (
      <div data-escudo-defesas="summary" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {SUMMARY_STATS.map(({ n, k }) => {
          const chip = CHIPS.find((c) => c.n === n)
          return (
            <span key={n} data-resumo-chip="" style={chipStyle}>
              <span style={{ fontSize: 11 }}>{chip?.ic ?? ''}</span>
              <span style={mono({ fontSize: 10, letterSpacing: '.06em', color: 'var(--muted)' })}>{n}</span>
              <span style={mono({ fontSize: 11.5, fontWeight: 700 })}>{k === 'movimento' ? `${s?.[k] ?? 0}q` : s?.[k] ?? 0}</span>
            </span>
          )
        })}
      </div>
    )
  }
  const stats = memberStats(fm)
  return (
    <div data-escudo-defesas="fm" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div data-resumo-statgrid="defesas" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 5 }}>
        {CHIPS.slice(0, 4).map((c) => statCell(c, fm, attrs, stats))}
      </div>
      <div data-resumo-statgrid="sentidos" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 5 }}>
        {CHIPS.slice(4).map((c) => statCell(c, fm, attrs, stats))}
      </div>
    </div>
  )
}

/* ── ATAQUES ─────────────────────────────────────────────────────────── */

export function SubAtaques({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const { values: attrs } = useMemo(() => heroAtributos(fm), [fm])
  const armasFm = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Fm[]
  const naturaisFm = ((fmPath(fm, 'Ataques', 'Lista') ?? []) as Fm[]).filter((r) => str(r['Nome']) !== 'Manobras')
  const propRuleDoc = useNamedDocs(
    [...(Array.isArray(armasFm) ? armasFm : []), ...naturaisFm].flatMap((a) => {
      const armaDoc = refs.refDoc(a['Nome'])
      const inline = { ...((armaDoc?.frontmatter ?? {}) as Fm), ...((armaDoc?.inlineFields ?? {}) as Fm) }
      return wikiLabels(inline['propriedades']).map(propBase)
    }),
  )
  if (vm.semFicha) return <Vazio texto="sem ficha — ataques indisponíveis" />
  const el = <AtaquesResumo fm={fm} attrs={attrs} refs={refs} propRuleDoc={propRuleDoc} todos ordem="desc" />
  return <div data-escudo-ataques="">{el}</div>
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
  if (vm.semFicha) return <Vazio texto="sem ficha — habilidades indisponíveis" />
  return (
    <div data-escudo-habilidades="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <HabilidadesResumo fm={fm} refs={refs} />
      <TecnicasResumo fm={fm} refs={refs} />
      <AcoesResumo fm={fm} refs={refs} />
    </div>
  )
}

/* ── PERTENCES ───────────────────────────────────────────────────────── */

export function SubPertences({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const armas = ((fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Fm[]).filter((a) => str(a['Nome']))
  const armadura = str(fmPath(fm, 'Inventario', 'Armadura', 'Nome'))
  const escudo = str(fmPath(fm, 'Inventario', 'Escudo', 'Nome'))
  const tesouros = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Tesouros'), { dedup: true, comQtd: false }), [fm])
  const consumiveis = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Consumiveis'), { dedup: false, comQtd: true }), [fm])
  if (vm.semFicha) return <Vazio texto="sem ficha — pertences indisponíveis" />
  const equip = [
    ...armas.map((a) => ({ key: `arma:${wikiTarget(a['Nome'])}`, raw: a['Nome'], label: linkLabel(str(a['Nome'])) })),
    ...(armadura ? [{ key: 'armadura', raw: armadura, label: linkLabel(armadura) }] : []),
    ...(escudo ? [{ key: 'escudo', raw: escudo, label: linkLabel(escudo) }] : []),
  ]
  if (!equip.length && !tesouros.length && !consumiveis.length) return <Vazio texto="nada no inventário" />
  return (
    <div data-escudo-pertences="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {equip.length ? (
        <Section label="// EQUIPAMENTO">
          <div data-resumo-chiplist="" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {equip.map((e) => (
              <span key={e.key} data-resumo-chip="" style={chipStyle}>
                <ItemHover doc={refs.refDoc(e.raw)}>
                  <span>{reskinName(e.label)}</span>
                </ItemHover>
              </span>
            ))}
          </div>
        </Section>
      ) : null}
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
