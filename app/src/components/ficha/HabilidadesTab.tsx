// Aba COMPETÊNCIAS (habilidades) da ficha — markup/estilos verbatim do design
// puxado (design/pulled/Companion App.dc.html §HABILIDADES, linhas 735-1105).
// Dados do modelo salvo; catálogos de técnicas/magias não aprendidas vêm dos
// docs REAIS da vault (classe/escola do herói). Interações são estado local
// EFÊMERO. Larguras de grid, rótulos ('VALOR') e enriquecimento das linhas
// (enrich/enrichStk) seguem o fim do profData/renderVals recuperado no pull:
//   perCols/ofiCols/stkCols = edit ? '1.25fr 0.75fr 1fr 1fr'
//                                  : '1.25fr 0.6fr 0.7fr'
//   stacks: modKind std10 (Defesas/Sentidos: 10+attr+PB+item+especial),
//   move (4+attr+item+especial, SEM PB), none (Combate); flags showProf/
//   showDots/showStar por seção viram opacity dos cabeçalhos.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import { linkLabel } from '../../markdown/dataview-value'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { clip, AttrBadge, EditToggle, GoldDots, ModBox, PanelTrack, RankBtns, RankMedal, TabStrip, TrackPanel } from './bits'
import type { HeroRefs } from './useHeroRefs'
import { BoxSelect, PassadoBox, withCurrent, type SelectOption } from './PerfilTab'
import { useHeroRules } from '../../rules/useHeroRules'
import { swapAtributo } from '../../rules/projection'
import type { AtributoId } from '../../rules/rules-model'
import {
  ATTR_DOT_COLORS,
  ATTR_EMOJI,
  EQUIP_TYPES,
  PF_TIER_COLORS,
  RANK_GROUP_ORDER,
  SLOT_GROUP,
  classeAventureiro,
  displayName,
  grupoArmaEmoji,
  magiaEmoji,
  rankGroupLabel,
  slugify,
  tecnicaCustoEmoji,
  tokens,
} from './registry'
import {
  fmOf,
  fmPath,
  heroAtributos,
  listaEntries,
  num,
  profLetter,
  rankStates,
  rowMod,
  shortSubclass,
  signed,
  slotsInfo,
  str,
  wikiTarget,
  type ListaEntry,
  type ProfRow,
} from './hero-model'

const HAB_TABS = [
  { id: 'perfil', label: 'PERFIL' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'habilidades', label: 'HABILIDADES' },
  { id: 'magias', label: 'MAGIAS' },
]

const panel: CSSProperties = {
  padding: '16px 18px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  clipPath: clip(14),
}

const monoTitle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

// Cabeçalho de coluna dos stacks/equipamentos (design: 9px, .05em).
const colHead: CSSProperties = {
  textAlign: 'center',
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.05em',
  color: 'var(--muted)',
}

// Cabeçalho de coluna de Perícias/Ofícios (design: 9px, SEM letter-spacing).
const colHeadPlain: CSSProperties = {
  textAlign: 'center',
  fontFamily: 'var(--mono)',
  fontSize: 9,
  color: 'var(--muted)',
}

// Larguras de grid verbatim do renderVals recuperado (perCols/ofiCols/stkCols).
const PROF_COLS_VIEW = '1.25fr 0.6fr 0.7fr'
const PROF_COLS_EDIT = '1.25fr 0.75fr 1fr 1fr'

/** Dígitos iniciais de um custo ("2A" → "2"; "L"/vazio → ""). */
function custoDigits(custo: unknown): string {
  const m = /^(\d+)/.exec(str(custo).trim())
  return m ? m[1] : ''
}

/** Rank (Adepta/Experiente/Mestre) de um doc: inline rank::, senão subcategoria. */
function docRankGroup(doc: VaultDoc | undefined): string {
  if (!doc) return ''
  const inline = linkLabel(str((doc.inlineFields as Record<string, unknown>)['rank']))
  return rankGroupLabel(inline || str(doc.subtype ?? ''))
}

function StarChip({ n }: { n: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 11px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--muted)',
      }}
    >
      <span style={{ color: 'var(--accent)' }}>★</span>
      {n}
    </span>
  )
}

function Lupa() {
  return <span style={{ fontSize: 11, opacity: 0.5, flex: 'none' }}>🔍</span>
}

function Losango() {
  return (
    <span style={{ width: 7, height: 7, background: 'var(--red)', transform: 'rotate(45deg)', flex: 'none' }} />
  )
}

function SelectBox({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: SelectOption[]
  onChange?: (v: string) => void
  ariaLabel?: string
}) {
  const opts = withCurrent(options, value)
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          width: '100%',
          padding: '11px 28px 11px 12px',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          color: 'var(--blue)',
          fontWeight: 600,
          fontSize: 13.5,
          cursor: 'pointer',
          textOverflow: 'ellipsis',
          clipPath: clip(8),
        }}
      >
        {(opts.length ? opts : [{ value: '', label: '—' }]).map((o, i) => (
          <option key={`${o.value}-${i}`} value={o.value}>
            {o.label || '—'}
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--muted)',
          fontSize: 11,
          pointerEvents: 'none',
        }}
      >
        ▾
      </span>
    </div>
  )
}

/* ===================== sub-aba PERFIL ===================== */

function ClasseNivelPanel({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'habilidades')
  const fm = model.fm
  // Projeção de regras (app/src/rules): opções de Classe/Sintonia (vault
  // scans) + escolhas de subclasse (Selecionar avaliado com picks inferidos
  // do FM) — espelho do vm.derived + choices do Editável do plugin
  // (render/view-model.ts + render/groups/perfil-card.ts).
  const rules = useHeroRules(fm)
  // Nível persiste NA HORA no overlay (topbar NVL e PERFIL leem o mergeado).
  const nivel = num(fm['Nível'])
  const setNivel = (fn: (n: number) => number) => model.set('Nível', fn(nivel))
  const ci = classeAventureiro(nivel)
  // pfTierColor do design (renderVals recuperado) — registro PF_TIER_COLORS.
  const tierColor = PF_TIER_COLORS[ci.classe as keyof typeof PF_TIER_COLORS] ?? ci.color

  // CLASSE — valor do FM casado com a opção por target (FM guarda alias
  // composto por regra: "[[Bardo|Trovador ...]]"); troca persiste o wikilink
  // da opção, como o onMetaChange("meta.classe") do plugin (perfil-card.ts:406).
  const classeFmValue =
    rules?.classes.find((o) => wikiTarget(o.value) === wikiTarget(str(fm['Classe'])))?.value ??
    str(fm['Classe'])
  const setClasse = (v: string) => model.set('Classe', v)

  // SUBCLASSES — troca de pick persiste o ESTADO no FM: regrava a linha
  // `Escolha.[[pai]]` de Habilidades.Lista com a nova opção (pick = estado,
  // espelho do resolve-choices/serialize do plugin — o item picado vive na
  // lista com source `Escolha.[[<parent>]]`).
  const habRows = (fmPath(fm, 'Habilidades', 'Lista') ?? []) as Record<string, unknown>[]
  const setSubclassPick = (parent: string, pickValue: string) => {
    if (!pickValue) return
    const esc = parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const tagRx = new RegExp(`^Escolha(\\.\\d+)?\\.\\[\\[${esc}\\]\\]$`)
    const newKey = `[[${wikiTarget(pickValue)}]]`
    let replaced = false
    const next = habRows.map((row) => {
      const entries = Object.entries(row)
      if (entries.length !== 1) return row
      const source = entries[0][1]
      if (typeof source === 'string' && tagRx.test(source)) {
        replaced = true
        return { [newKey]: source }
      }
      return row
    })
    if (!replaced) next.push({ [newKey]: `Escolha.[[${parent}]]` })
    model.set('Habilidades.Lista', next)
  }

  // Fallback enquanto a projeção resolve: escolhas do FM (fonte Escolha.[[X]]),
  // sem opções — slot renderiza o valor salvo.
  const escolhasFallback = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))
    .filter((e) => e.fonte.kind === 'Escolha')
    .map((e) => ({
      ic: tokens.emojis.perfil.Subclasse,
      label: e.fonte.target.toUpperCase(),
      value: e.raw,
      options: [{ value: e.raw, label: shortSubclass(e.raw) || e.label }],
      onChange: undefined as ((v: string) => void) | undefined,
    }))

  const selects: {
    ic: string
    label: string
    value: string
    options: SelectOption[]
    onChange?: (v: string) => void
  }[] = [
    {
      ic: tokens.emojis.perfil.Classe,
      label: 'CLASSE',
      value: classeFmValue,
      options: withCurrent(rules?.classes ?? [], classeFmValue, linkLabel(str(fm['Classe']))),
      onChange: setClasse,
    },
    ...(rules
      ? rules.subclassChoices.map((c) => ({
          ic: tokens.emojis.perfil.Subclasse,
          label: c.parent.toUpperCase(),
          value: c.pick ?? '',
          options: c.options,
          onChange: (v: string) => setSubclassPick(c.parent, v),
        }))
      : escolhasFallback),
  ]

  // SINTONIA — opções reais (Traços Elementais raiz, alias curto) da
  // projeção; persiste o valor da opção (withAlias, perfil-card.ts:520).
  const sintoniaFmValue =
    rules?.sintonias.find((o) => wikiTarget(o.value) === wikiTarget(str(fm['Sintonia'])))?.value ??
    str(fm['Sintonia'])
  const setSintonia = (v: string) => model.set('Sintonia', v)

  return (
    <div style={{ ...panel, display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 11 }}>
          {selects.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span
                style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--muted)' }}
              >
                {s.ic} {s.label}
              </span>
              <SelectBox ariaLabel={s.label} value={s.value} options={s.options} onChange={s.onChange} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--muted)' }}
          >
            🌀 SINTONIA
          </span>
          <SelectBox
            ariaLabel="SINTONIA"
            value={sintoniaFmValue}
            options={withCurrent(
              [{ value: '', label: '—' }, ...(rules?.sintonias ?? [])],
              sintoniaFmValue,
              linkLabel(str(fm['Sintonia'])),
            )}
            onChange={setSintonia}
          />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          alignItems: 'center',
          columnGap: 9,
          rowGap: 6,
          flex: 'none',
          alignSelf: 'center',
        }}
      >
        <span
          style={{
            gridRow: 1,
            gridColumn: 1,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            letterSpacing: '.1em',
            color: 'var(--muted)',
          }}
        >
          NÍVEL
        </span>
        <div
          style={{
            gridRow: 2,
            gridColumn: 1,
            position: 'relative',
            width: 104,
            height: 104,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '70.7%',
              height: '70.7%',
              transform: 'translate(-50%,-50%) rotate(45deg)',
              background: 'var(--card)',
              border: `1.5px solid ${tierColor}`,
              borderRadius: 18,
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              gap: 3,
            }}
          >
            <span style={{ fontSize: 34, fontWeight: 800, color: tierColor, fontFamily: 'var(--mono)' }}>
              {nivel}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1 }}>{ci.emoji}</span>
          </div>
        </div>
        <div style={{ gridRow: 2, gridColumn: 2, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <button
            onClick={() => setNivel((n) => Math.min(10, n + 1))}
            style={{
              width: 28,
              height: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb,var(--accent) 18%,transparent)',
              border: '1px solid color-mix(in srgb,var(--accent) 55%,transparent)',
              color: 'var(--accent)',
              cursor: 'pointer',
              clipPath: clip(5),
            }}
          >
            ▲
          </button>
          <button
            onClick={() => setNivel((n) => Math.max(1, n - 1))}
            style={{
              width: 28,
              height: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb,var(--red) 16%,transparent)',
              border: '1px solid color-mix(in srgb,var(--red) 50%,transparent)',
              color: 'var(--red)',
              cursor: 'pointer',
              clipPath: clip(5),
            }}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  )
}

function AtributosPanel({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'habilidades')
  const fm = model.fm
  const rules = useHeroRules(fm)
  const { values, principal } = heroAtributos(fm)
  // Células por rank (3→0) da projeção de regras: cascata (rank N só
  // escolhe entre atributos não usados em ranks > N) + restrição de
  // principal (`Escolher Atributos.Principal ...`) — espelho de
  // renderAttrBox do plugin (perfil-card.ts:598-700). Fallback enquanto a
  // projeção resolve: leitura fixa ordenada por valor (sem opções).
  const cells = rules
    ? rules.atributos.map((c) => ({
        n: c.current ?? '',
        v: c.rank as number,
        options: c.options as string[],
        isPrincipal: c.isPrincipal,
      }))
    : Object.entries(values)
        .map(([n, v]) => ({ n, v, options: [] as string[], isPrincipal: n === principal }))
        .sort((a, b) => b.v - a.v)
  // Troca com SWAP determinístico — espelho de applyChange do plugin
  // (perfil-card.ts:621-634); persiste os 4 valores + Principal num write.
  const onSwap = (rank: number, attr: string) => {
    if (rank !== 1 && rank !== 2 && rank !== 3) return
    const next = swapAtributo(
      values as Record<AtributoId, number>,
      rank,
      attr as AtributoId,
    )
    model.set('Atributos', {
      Principal: next.principal,
      FOR: next.atributos.FOR,
      AGI: next.atributos.AGI,
      INT: next.atributos.INT,
      PRE: next.atributos.PRE,
    })
  }

  return (
    <div style={panel}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '.14em',
          color: 'var(--muted)',
          textAlign: 'center',
          marginBottom: 13,
        }}
      >
        ⚖️ ATRIBUTOS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        {cells.map((a, i) => {
          const box = (
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: 12,
                background: 'var(--card)',
                border: `1px solid ${a.isPrincipal ? 'color-mix(in srgb,var(--accent) 75%,var(--line2))' : 'var(--line2)'}`,
                clipPath: clip(9),
              }}
            >
              <span style={{ fontSize: 15 }}>{ATTR_EMOJI[a.n] ?? ''}</span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  color: 'var(--text)',
                }}
              >
                {a.n}
              </span>
            </div>
          )
          // Editável só com 2+ opções elegíveis (canChoose do plugin,
          // perfil-card.ts:664) — senão a célula fica fixa (display).
          const editable = a.options.length >= 2
          return (
            <div
              key={`${a.n}-${i}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{ width: 11, height: 11, borderRadius: '50%', background: ATTR_DOT_COLORS[i] }}
                />
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{a.v}</span>
              </div>
              {editable ? (
                <BoxSelect
                  ariaLabel={`Atributo rank ${a.v}`}
                  display={box}
                  options={a.options.map((o) => ({ value: o, label: `${ATTR_EMOJI[o] ?? ''} ${o}` }))}
                  value={a.n}
                  onChange={(v) => onSwap(a.v, v)}
                />
              ) : (
                box
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface StackSection {
  title: string
  /** modKind do profData recuperado: std10 | move | none. */
  modKind: 'std10' | 'move' | 'none'
  /** Flags por seção do profData (viram opacity dos cabeçalhos). */
  showProf: 0 | 1
  showDots: 0 | 1
  showStar: 0 | 1
  rows: {
    lead: string
    row: ProfRow
    /** hasDots/starOp do mk() do design (Ataque: dn=0, star=null). */
    hasDots: boolean
    starOp: 0 | 1
    showMedal: boolean
  }[]
}

function StacksPanel({ doc }: { doc: VaultDoc }) {
  const fm = fmOf(doc)
  const { values: attrs } = heroAtributos(fm)
  const [edit, setEdit] = useState(false)

  const defesas = (fmPath(fm, 'Defesas_Resistencias', 'Lista') ?? []) as ProfRow[]
  const sentidos = (fmPath(fm, 'Sentidos', 'Lista') ?? []) as ProfRow[]
  const movimentos = (fmPath(fm, 'Movimento', 'Lista') ?? []) as ProfRow[]
  const profAtaque = str(fmPath(fm, 'Ataques', 'Proficiencia'))

  // Seções verbatim do profData recuperado (title/modKind/showProf/Dots/Star).
  const sections: StackSection[] = [
    {
      title: 'Defesas',
      modKind: 'std10',
      showProf: 1,
      showDots: 1,
      showStar: 1,
      rows: defesas.map((row) => ({
        lead: (tokens.emojis.defesa as Record<string, string>)[slugify(str(row.Nome))] ?? '',
        row,
        hasDots: true,
        starOp: 1 as const,
        showMedal: true,
      })),
    },
    {
      title: 'Sentidos',
      modKind: 'std10',
      showProf: 1,
      showDots: 1,
      showStar: 1,
      rows: sentidos.map((row) => ({
        lead: (tokens.emojis.categoria as Record<string, string>)[slugify(str(row.Nome))] ?? '',
        row,
        hasDots: true,
        starOp: 1 as const,
        showMedal: true,
      })),
    },
    {
      title: 'Combate',
      modKind: 'none',
      showProf: 1,
      showDots: 0,
      showStar: 0,
      rows: [
        {
          lead: tokens.emojis.combate.Ataque,
          row: { Nome: 'Ataque', Proficiencia: profAtaque } as ProfRow,
          hasDots: false,
          starOp: 0 as const,
          showMedal: true,
        },
      ],
    },
    {
      title: 'Movimentos',
      modKind: 'move',
      showProf: 0,
      showDots: 1,
      showStar: 1,
      rows: movimentos.map((row) => ({
        lead: '',
        row,
        hasDots: true,
        starOp: 1 as const,
        showMedal: false,
      })),
    },
  ]

  const cols = edit ? PROF_COLS_EDIT : PROF_COLS_VIEW

  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: -6 }}>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      {sections.map((sec) => (
        <div key={sec.title}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              alignItems: 'center',
              gap: 8,
              padding: '0 2px 9px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <span style={monoTitle}>{sec.title}</span>
            {!edit ? (
              <span style={{ ...colHead, textAlign: 'left', paddingLeft: 4 }}>
                {sec.modKind !== 'none' ? 'VALOR' : ''}
              </span>
            ) : null}
            <span style={{ ...colHead, opacity: sec.showProf }}>PROFICIÊNCIA</span>
            {edit ? <span style={{ ...colHead, opacity: sec.showDots }}>ITEM BÔNUS</span> : null}
            {edit ? <span style={{ ...colHead, opacity: sec.showStar }}>ESPECIALIZAÇÃO</span> : null}
          </div>
          {sec.rows.map(({ lead, row, hasDots, starOp, showMedal }) => {
            // enrichStk recuperado: std10 = 10+attr+PB+item+especial;
            // move = 4+attr+item+especial (sem PB); none não mostra caixa.
            const modStr =
              sec.modKind === 'std10'
                ? String(10 + rowMod(row, attrs))
                : sec.modKind === 'move'
                  ? String(
                      4 +
                        (attrs[row.Atributo ?? ''] ?? 0) +
                        num(row.Bonus_Item) +
                        num(row.Bonus_Especial),
                    )
                  : ''
            return (
              <div
                key={str(row.Nome)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: cols,
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 2px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  {lead ? <span style={{ fontSize: 14, flex: 'none' }}>{lead}</span> : null}
                  {row.Atributo ? (
                    <AttrBadge ic={ATTR_EMOJI[str(row.Atributo)] ?? ''} at={str(row.Atributo)} />
                  ) : null}
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayName(slugify(str(row.Nome)))}
                  </span>
                </span>
                {!edit ? (
                  <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    {modStr ? (
                      <ModBox
                        modStr={modStr}
                        rank={profLetter(row)}
                        star={num(row.Bonus_Especial) > 0}
                        dots={num(row.Bonus_Item)}
                      />
                    ) : null}
                  </span>
                ) : null}
                <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  {!edit && showMedal ? <RankMedal rank={profLetter(row)} /> : null}
                  {edit && showMedal ? <RankBtns states={rankStates(row)} /> : null}
                </span>
                {edit ? (
                  <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                    {hasDots ? <GoldDots on={num(row.Bonus_Item)} /> : null}
                  </span>
                ) : null}
                {edit ? (
                  <span style={{ display: 'flex', justifyContent: 'center', opacity: starOp }}>
                    <StarChip n={num(row.Bonus_Especial)} />
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Botõezinhos N/P de proficiência de equipamento — pn() do profData. */
function PnBtns({ cur }: { cur: 'P' | 'N' }) {
  return (
    <>
      {(['N', 'P'] as const).map((l) => {
        const on = l === cur
        const cor = l === 'P' ? '#2f8f5b' : '#4a4a4a'
        return (
          <span
            key={l}
            style={{
              background: on ? cor : 'transparent',
              color: on ? (l === 'P' ? '#ffffff' : '#e8e8e8') : '#6a6a6a',
              border: `1px solid ${on ? cor : 'rgba(255,255,255,.12)'}`,
              width: 25,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 5,
            }}
          >
            {l}
          </span>
        )
      })}
    </>
  )
}

function EquipamentosProfPanel({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const fm = fmOf(doc)
  const inventario = (fm['Inventario'] ?? {}) as Record<string, unknown>
  const especificas = (fmPath(fm, 'Inventario', 'Armas', 'Proficiencia', 'Especificas') ?? []) as unknown[]

  const tipos = EQUIP_TYPES.map((t) => ({
    ic: t.ic,
    nm: t.nm,
    cur: (str(fmPath(inventario, ...t.path)) === 'P' ? 'P' : 'N') as 'P' | 'N',
  }))
  const armas = (Array.isArray(especificas) ? especificas : []).map((raw) => {
    const target = wikiTarget(raw)
    const res = catalog.resolve(target)
    const entry = res.kind === 'doc' ? catalog.entryById.get(res.id) : undefined
    return {
      ic: grupoArmaEmoji(typeof entry?.grupo === 'string' ? entry.grupo : ''),
      nm: linkLabel(str(raw)),
    }
  })

  // equipRows do renderVals recuperado: uma linha por TIPO (p.equipTypes),
  // arma específica emparelhada pelo índice (excedentes ficam de fora).
  const rows = tipos.map((t, i) => ({ t, w: armas[i] }))

  return (
    <div style={panel}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.25fr 0.75fr 1fr 1fr',
          alignItems: 'center',
          gap: 8,
          padding: '0 2px 9px',
          marginBottom: 4,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={monoTitle}>Equipamentos</span>
        <span style={colHead}>PROFICIÊNCIA</span>
        <span />
        <span style={colHead}>PROFICIÊNCIA</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr 1fr 1fr', alignItems: 'center', gap: '0 8px' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '6px 2px' }}>
              {r.t ? (
                <>
                  <span style={{ fontSize: 14, flex: 'none' }}>{r.t.ic}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.t.nm}
                  </span>
                </>
              ) : null}
            </span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {r.t ? <PnBtns cur={r.t.cur} /> : null}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '6px 2px' }}>
              {r.w ? (
                <>
                  <span style={{ fontSize: 14, flex: 'none' }}>{r.w.ic}</span>
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--blue)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.w.nm}
                  </span>
                </>
              ) : null}
            </span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {r.w ? <PnBtns cur="P" /> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===================== sub-aba PERÍCIAS ===================== */

function PericiasProfPanel({ doc }: { doc: VaultDoc }) {
  const fm = fmOf(doc)
  const { values: attrs } = heroAtributos(fm)
  const [edit, setEdit] = useState(false)
  const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]

  const usedBy = (letter: string) =>
    pericias.filter((p) =>
      (p.Incrementos ?? []).some((inc) => str((inc as Record<string, unknown>)[letter]).startsWith('Slot')),
    ).length
  const slots = slotsInfo(fmPath(fm, 'Pericias', 'Slots'), usedBy, ['A', 'E', 'M'])

  const cols = edit ? PROF_COLS_EDIT : PROF_COLS_VIEW

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={monoTitle}>Perícias</div>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          gap: 8,
          padding: '0 2px 10px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span />
        {!edit ? (
          <span style={{ ...colHeadPlain, textAlign: 'left', paddingLeft: 4 }}>MODIFICADOR</span>
        ) : null}
        <span style={colHeadPlain}>PROFICIÊNCIA</span>
        {edit ? <span style={colHeadPlain}>ITEM BÔNUS</span> : null}
        {edit ? <span style={colHeadPlain}>ESPECIALIZAÇÃO</span> : null}
      </div>
      {pericias.map((row) => (
        <div
          key={str(row.Nome)}
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            alignItems: 'center',
            gap: 8,
            padding: '6px 2px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <AttrBadge ic={ATTR_EMOJI[str(row.Atributo)] ?? ''} at={str(row.Atributo)} />
            <span
              style={{
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName(slugify(str(row.Nome)))}
            </span>
          </span>
          {!edit ? (
            <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <ModBox
                modStr={signed(rowMod(row, attrs))}
                rank={profLetter(row)}
                star={num(row.Bonus_Especial) > 0}
                dots={num(row.Bonus_Item)}
              />
            </span>
          ) : null}
          <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {!edit ? <RankMedal rank={profLetter(row)} /> : <RankBtns states={rankStates(row)} />}
          </span>
          {edit ? (
            <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
              <GoldDots on={num(row.Bonus_Item)} />
            </span>
          ) : null}
          {edit ? (
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <StarChip n={num(row.Bonus_Especial)} />
            </span>
          ) : null}
        </div>
      ))}
      {edit ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 12,
            padding: '11px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: clip(9),
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Perícias adicionais disponíveis:</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: 'var(--mono)',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {slots.map((s, i) => (
              <span key={s.letter} style={{ display: 'contents' }}>
                {i > 0 ? <span style={{ color: 'var(--line2)' }}>|</span> : null}
                <span>{s.label}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function EspecializacoesPanel({ doc }: { doc: VaultDoc }) {
  const fm = fmOf(doc)
  const [edit, setEdit] = useState(false)
  const grupos = ((fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[])
    .filter((p) => str(p.Especializacao))
    .map((p) => ({
      skill: `${displayName(slugify(str(p.Nome)))} (${profLetter(p)})`,
      items: [{ on: true, txt: linkLabel(str(p.Especializacao)) }],
    }))

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        <div style={{ ...monoTitle, letterSpacing: '.08em' }}>Especializações</div>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grupos.map((grp) => (
          <div key={grp.skill}>
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 7 }}>
              {grp.skill}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {grp.items.map((sp) => (
                <div key={sp.txt} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Losango />
                  {edit ? (
                    <span
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: '50%',
                        border: '2px solid color-mix(in srgb,var(--red) 100%,var(--line2))',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <span
                        style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }}
                      />
                    </span>
                  ) : null}
                  <span style={{ fontSize: 13, flex: 'none' }}>
                    {tokens.emojis.subcategoria.Especializacao}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{sp.txt}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OficiosPanel({ doc }: { doc: VaultDoc }) {
  const fm = fmOf(doc)
  const { values: attrs } = heroAtributos(fm)
  const [edit, setEdit] = useState(false)
  const oficios = (fmPath(fm, 'Oficios', 'Lista') ?? []) as ProfRow[]
  const cols = edit ? PROF_COLS_EDIT : PROF_COLS_VIEW

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={monoTitle}>Ofícios</div>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          gap: 8,
          padding: '0 2px 10px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span />
        {!edit ? (
          <span style={{ ...colHeadPlain, textAlign: 'left', paddingLeft: 4 }}>MODIFICADOR</span>
        ) : (
          <span />
        )}
        <span style={colHeadPlain}>PROFICIÊNCIA</span>
        {edit ? <span style={colHeadPlain}>ITEM BÔNUS</span> : null}
      </div>
      {oficios.map((row) => {
        const nm = displayName(slugify(str(row.Nome)))
        const complemento = str(row.Complemento)
        return (
          <div
            key={str(row.Nome)}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              alignItems: 'center',
              gap: 8,
              padding: '7px 2px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <AttrBadge ic={ATTR_EMOJI[str(row.Atributo)] ?? ''} at={str(row.Atributo)} />
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {edit ? nm : complemento ? `${nm} (${complemento})` : nm}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
              {!edit ? (
                <ModBox
                  modStr={signed(rowMod(row, attrs))}
                  rank={profLetter(row)}
                  star={num(row.Bonus_Especial) > 0}
                  dots={num(row.Bonus_Item)}
                />
              ) : (
                <input
                  defaultValue={complemento}
                  placeholder="—"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    color: 'var(--text)',
                    fontSize: 12.5,
                    fontFamily: 'inherit',
                    clipPath: clip(7),
                  }}
                />
              )}
            </span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {!edit ? <RankMedal rank={profLetter(row)} /> : <RankBtns states={rankStates(row)} />}
            </span>
            {edit ? (
              <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                <GoldDots on={num(row.Bonus_Item)} />
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ===================== sub-aba HABILIDADES ===================== */

interface TreeItem {
  txt: string
  ic: string
  child: boolean
}

/** Árvore por rank: pais na ordem do modelo, filhos (fonte → pai na lista) logo abaixo. */
function habTree(entries: ListaEntry[], refDoc: HeroRefs['refDoc']): Map<string, TreeItem[]> {
  const targets = new Set(entries.map((e) => e.target))
  const byParent = new Map<string, ListaEntry[]>()
  const roots: ListaEntry[] = []
  for (const e of entries) {
    if (e.fonte.target && targets.has(e.fonte.target) && e.fonte.target !== e.target) {
      const list = byParent.get(e.fonte.target) ?? []
      list.push(e)
      byParent.set(e.fonte.target, list)
    } else {
      roots.push(e)
    }
  }
  const groups = new Map<string, TreeItem[]>()
  const push = (group: string, item: TreeItem) => {
    const list = groups.get(group) ?? []
    list.push(item)
    groups.set(group, list)
  }
  const icOf = (target: string) => {
    const d = refDoc(target)
    return (tokens.emojis.categoria as Record<string, string>)[slugify(str(d?.type ?? ''))] ?? ''
  }
  for (const root of roots) {
    const group = docRankGroup(refDoc(root.target)) || RANK_GROUP_ORDER[1]
    push(group, { txt: root.label, ic: icOf(root.target), child: false })
    for (const child of byParent.get(root.target) ?? []) {
      push(group, { txt: child.label, ic: icOf(child.target), child: true })
    }
  }
  return groups
}

function HabilidadesArvorePanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const fm = fmOf(doc)
  const entries = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))
  const groups = habTree(entries, refs.refDoc)
  const ordered = RANK_GROUP_ORDER.filter((g) => groups.has(g))

  return (
    <div style={panel}>
      <div style={{ ...monoTitle, letterSpacing: '.08em', marginBottom: 13 }}>Habilidades</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px 26px' }}>
        {ordered.map((g) => (
          <div key={g}>
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 8 }}>
              {g}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {groups.get(g)!.map((it, i) => (
                <div
                  key={`${it.txt}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    paddingLeft: it.child ? 26 : 0,
                  }}
                >
                  <Losango />
                  {it.ic ? <span style={{ fontSize: 13, flex: 'none' }}>{it.ic}</span> : null}
                  <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{it.txt}</span>
                  <Lupa />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AcoesPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const entries = listaEntries(fmPath(fmOf(doc), 'Acoes', 'Lista'))
  return (
    <div style={panel}>
      <div style={{ ...monoTitle, letterSpacing: '.08em', marginBottom: 13 }}>Ações de Habilidade</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((e) => {
          const d = refs.refDoc(e.target)
          const badge = custoDigits(fmOf(d)['custo'])
          return (
            <div key={e.target} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Losango />
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 19,
                  height: 19,
                  padding: '0 4px',
                  background: 'var(--blue)',
                  color: '#08111f',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  fontWeight: 800,
                  flex: 'none',
                }}
              >
                {badge}
              </span>
              <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{e.label}</span>
              <Lupa />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cardBox: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  clipPath: clip(10),
  padding: 14,
}

function TecnicasPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const fm = fmOf(doc)
  const [edit, setEdit] = useState(false)
  const entries = listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))

  const aprendidas = useMemo(() => {
    const byRank = new Map<string, string[]>()
    for (const e of entries) {
      const rank =
        (e.fonte.kind === 'Slot' && SLOT_GROUP[e.fonte.target]) || docRankGroup(refs.refDoc(e.target))
      const list = byRank.get(rank) ?? []
      list.push(e.label)
      byRank.set(rank, list)
    }
    return RANK_GROUP_ORDER.filter((g) => byRank.has(g)).map((g) => ({ rank: g, rows: byRank.get(g)! }))
  }, [entries, refs])

  // Técnicas da classe do herói (docs reais) pro painel "Não Aprendidas".
  const classeTarget = wikiTarget(fm['Classe'])
  const tecnicaIds = useMemo(
    () =>
      catalog.content
        .filter((e) => e.type === 'Técnica' && e.id.includes(`/Técnicas/${classeTarget}/`))
        .map((e) => e.id),
    [catalog, classeTarget],
  )
  const tecnicaDocs = useDocs(edit ? tecnicaIds : [])
  const naoAprendidas = useMemo(() => {
    if (!edit || !tecnicaDocs) return []
    const learned = new Set(entries.map((e) => e.target))
    const byRank = new Map<string, { custo: string; txt: string }[]>()
    for (const d of tecnicaDocs.values()) {
      if (learned.has(d.basename)) continue
      const rank = docRankGroup(d)
      const list = byRank.get(rank) ?? []
      list.push({
        custo: tecnicaCustoEmoji((d.inlineFields as Record<string, unknown>)['custo']),
        txt: d.basename,
      })
      byRank.set(rank, list)
    }
    return RANK_GROUP_ORDER.filter((g) => byRank.has(g)).map((g) => ({
      rank: g,
      rows: byRank.get(g)!.sort((a, b) => a.txt.localeCompare(b.txt)),
    }))
  }, [edit, tecnicaDocs, entries])

  const usedBy = (letter: string) =>
    entries.filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === letter).length
  const slots = slotsInfo(fmPath(fm, 'Tecnicas', 'Slots'), usedBy, ['A', 'E', 'M'])

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <span style={{ ...monoTitle, letterSpacing: '.08em' }}>Técnicas</span>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: edit ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)',
          gap: 14,
        }}
      >
        <div style={cardBox}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            📖 Técnicas Aprendidas
          </div>
          {aprendidas.map((grp) => (
            <div key={grp.rank} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--muted)',
                  marginBottom: 8,
                }}
              >
                {grp.rank}
                <Lupa />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grp.rows.map((txt) => (
                  <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {edit ? (
                      <button
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: '1px solid color-mix(in srgb,var(--red) 55%,transparent)',
                          background: 'color-mix(in srgb,var(--red) 16%,transparent)',
                          color: '#e06a5c',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                          flex: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        −
                      </button>
                    ) : null}
                    <span style={{ fontSize: 13, flex: 'none' }}>{tokens.emojis.categoria.Tecnica}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--blue)',
                        fontSize: 13.5,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {txt}
                    </span>
                    <Lupa />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {edit ? (
          <div style={cardBox}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              📚 Técnicas Não Aprendidas
            </div>
            {naoAprendidas.map((grp) => (
              <div key={grp.rank} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 8 }}>
                  {grp.rank}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {grp.rows.map((row) => (
                    <div key={row.txt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: '1px solid color-mix(in srgb,#2f8f5b 55%,transparent)',
                          background: 'color-mix(in srgb,#2f8f5b 16%,transparent)',
                          color: '#4cc585',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                          flex: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        +
                      </button>
                      <span style={{ fontSize: 12, flex: 'none', width: 17, textAlign: 'center' }}>
                        {row.custo}
                      </span>
                      <span style={{ fontSize: 13, flex: 'none' }}>{tokens.emojis.categoria.Tecnica}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--blue)',
                          fontSize: 13.5,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.txt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {edit ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 14,
            padding: '11px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: clip(9),
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Técnicas adicionais disponíveis:</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: 'var(--mono)',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {slots.map((s, i) => (
              <span key={s.letter} style={{ display: 'contents' }}>
                {i > 0 ? <span style={{ color: 'var(--line2)' }}>|</span> : null}
                <span>{s.label}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ===================== sub-aba MAGIAS ===================== */

interface EscolaFm {
  Nome?: string
  Lista?: unknown
}

function MagiasHabPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const fm = fmOf(doc)
  const [edit, setEdit] = useState(false)
  const escolas = ((fmPath(fm, 'Magias', 'Lista') ?? []) as EscolaFm[]).filter(
    (e) => listaEntries(e.Lista).length > 0,
  )
  const slotsFm = fmPath(fm, 'Magias', 'Slots') as Record<string, unknown> | undefined

  const h2Of = (nome: string) => (nome === 'Tesouros' ? 'Magias de Tesouros' : `Magias ${nome}`)

  // Docs de magia da vault por escola (pasta "Magia <Escola>") pro painel edit.
  const spellIdsByEscola = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const escola of escolas) {
      const nome = str(escola.Nome)
      if (nome === 'Tesouros') continue
      map.set(
        nome,
        catalog.content
          .filter((e) => e.type === 'Magia' && e.id.includes(`/Magia ${nome}/`))
          .map((e) => e.id),
      )
    }
    return map
  }, [catalog, escolas])
  const allSpellIds = useMemo(() => [...spellIdsByEscola.values()].flat(), [spellIdsByEscola])
  const spellDocs = useDocs(edit ? allSpellIds : [])

  const ranksComSlot = RANK_GROUP_ORDER.filter((g) => {
    const letter = Object.entries(SLOT_GROUP).find(([, v]) => v === g)?.[0]
    return letter ? num(slotsFm?.[letter]) > 0 : false
  })

  const usedBy = (letter: string) =>
    escolas
      .flatMap((e) => listaEntries(e.Lista))
      .filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === letter).length
  const slots = slotsInfo(slotsFm, usedBy, ['B', 'A', 'E', 'M'])

  return (
    <>
      <div style={panel}>
        <div style={{ ...monoTitle, letterSpacing: '.08em', marginBottom: 13 }}>Recursos Mágicos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15 }}>{tokens.emojis.subcategoria.PotenciaMagica}</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap' }}>
              Potência Mágica
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
              {num(fmPath(fm, 'Magias', 'Potencia'))}
            </span>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '0 22px' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span
              style={{
                width: 14,
                height: 14,
                background: 'var(--blue)',
                transform: 'rotate(45deg)',
                borderRadius: 2,
                flex: 'none',
              }}
            />
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap' }}>
              EM Máximo
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
              {num(fmPath(fm, 'Magias', 'EM'))}
            </span>
          </div>
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <span style={{ ...monoTitle, letterSpacing: '.08em' }}>Magias</span>
          <span style={{ flex: 1 }} />
          <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: edit ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)',
            gap: 14,
          }}
        >
          <div style={cardBox}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              📖 Magias Aprendidas
            </div>
            {escolas.map((escola) => {
              const nome = str(escola.Nome)
              const entries = listaEntries(escola.Lista)
              const isTesouro = nome === 'Tesouros'
              const byRank = new Map<string, ListaEntry[]>()
              for (const e of entries) {
                const rank = isTesouro
                  ? ''
                  : (e.fonte.kind === 'Slot' && SLOT_GROUP[e.fonte.target]) ||
                    rankGroupLabel(str(fmOf(refs.refDoc(e.target))['rank']))
                const list = byRank.get(rank) ?? []
                list.push(e)
                byRank.set(rank, list)
              }
              const groupKeys = isTesouro
                ? ['']
                : RANK_GROUP_ORDER.filter((g) => byRank.has(g))
              return (
                <div key={nome} style={{ marginBottom: 13 }}>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      marginBottom: 9,
                    }}
                  >
                    {h2Of(nome)}
                  </div>
                  {groupKeys.map((g) => (
                    <div key={g || 'tesouro'} style={{ marginBottom: 9 }}>
                      {g ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            fontStyle: 'italic',
                            color: 'var(--muted)',
                            marginBottom: 7,
                          }}
                        >
                          {g}
                          <Lupa />
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {(byRank.get(g) ?? []).map((e) => {
                          const spellFm = fmOf(refs.refDoc(e.target))
                          return (
                            <div key={e.target} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {edit && !isTesouro ? (
                                <button
                                  style={{
                                    width: 23,
                                    height: 23,
                                    borderRadius: '50%',
                                    border: '1px solid color-mix(in srgb,var(--red) 55%,transparent)',
                                    background: 'color-mix(in srgb,var(--red) 16%,transparent)',
                                    color: '#e06a5c',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  −
                                </button>
                              ) : null}
                              {isTesouro ? (
                                <span
                                  style={{
                                    width: 23,
                                    height: 23,
                                    borderRadius: '50%',
                                    border: '2px solid #b9962f',
                                    flex: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 9,
                                      height: 9,
                                      borderRadius: '50%',
                                      background: '#d9b441',
                                    }}
                                  />
                                </span>
                              ) : null}
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 21,
                                  height: 21,
                                  padding: '0 4px',
                                  background: '#34425a',
                                  color: '#dbe4f0',
                                  fontFamily: 'var(--mono)',
                                  fontSize: 11.5,
                                  fontWeight: 800,
                                  flex: 'none',
                                }}
                              >
                                {custoDigits(spellFm['custo'])}
                              </span>
                              <span style={{ fontSize: 13, flex: 'none' }}>{magiaEmoji(spellFm)}</span>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: 'var(--blue)',
                                  fontSize: 13.5,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {e.label}
                              </span>
                              {!isTesouro ? <Lupa /> : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {edit ? (
            <div style={cardBox}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                📚 Magias Não Aprendidas
              </div>
              {escolas
                .filter((e) => str(e.Nome) !== 'Tesouros')
                .map((escola) => {
                  const nome = str(escola.Nome)
                  const learned = new Set(listaEntries(escola.Lista).map((e) => e.target))
                  const byRank = new Map<string, VaultDoc[]>()
                  for (const id of spellIdsByEscola.get(nome) ?? []) {
                    const d = spellDocs?.get(id)
                    if (!d || learned.has(d.basename)) continue
                    const rank = rankGroupLabel(str(d.frontmatter['rank']))
                    if (!ranksComSlot.includes(rank)) continue
                    const list = byRank.get(rank) ?? []
                    list.push(d)
                    byRank.set(rank, list)
                  }
                  const groupKeys = RANK_GROUP_ORDER.filter((g) => byRank.has(g))
                  return (
                    <div key={nome} style={{ marginBottom: 13 }}>
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '.05em',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                          marginBottom: 9,
                        }}
                      >
                        {h2Of(nome)}
                      </div>
                      {groupKeys.map((g) => (
                        <div key={g} style={{ marginBottom: 9 }}>
                          <div
                            style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 7 }}
                          >
                            {g}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {byRank.get(g)!.map((d) => (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  style={{
                                    width: 23,
                                    height: 23,
                                    borderRadius: '50%',
                                    border: '1px solid color-mix(in srgb,#2f8f5b 55%,transparent)',
                                    background: 'color-mix(in srgb,#2f8f5b 16%,transparent)',
                                    color: '#4cc585',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  +
                                </button>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 21,
                                    height: 21,
                                    padding: '0 4px',
                                    background: '#34425a',
                                    color: '#dbe4f0',
                                    fontFamily: 'var(--mono)',
                                    fontSize: 11.5,
                                    fontWeight: 800,
                                    flex: 'none',
                                  }}
                                >
                                  {custoDigits(d.frontmatter['custo'])}
                                </span>
                                <span style={{ fontSize: 13, flex: 'none' }}>
                                  {magiaEmoji(d.frontmatter as Record<string, unknown>)}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--blue)',
                                    fontSize: 13.5,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {d.basename}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
            </div>
          ) : null}
        </div>
        {edit ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginTop: 14,
              padding: '11px 12px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              clipPath: clip(9),
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Magias adicionais disponíveis:</span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--mono)',
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              {slots.map((s, i) => (
                <span key={s.letter} style={{ display: 'contents' }}>
                  {i > 0 ? <span style={{ color: 'var(--line2)' }}>|</span> : null}
                  <span>{s.label}</span>
                </span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </>
  )
}

/* ===================== aba ===================== */

function Col({ children }: { children: ReactNode }) {
  return (
    <TrackPanel style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</TrackPanel>
  )
}

export function HabilidadesTab({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const [tab, setTab] = useState('perfil')
  const index = Math.max(
    0,
    HAB_TABS.findIndex((t) => t.id === tab),
  )

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <TabStrip tabs={HAB_TABS} active={tab} onSelect={setTab} pad="12px 18px" />
      <PanelTrack index={index}>
        <Col>
          <ClasseNivelPanel doc={doc} />
          <AtributosPanel doc={doc} />
          <PassadoBox doc={doc} cols="repeat(4,minmax(0,1fr))" origem="habilidades" />
          <StacksPanel doc={doc} />
          <EquipamentosProfPanel doc={doc} />
        </Col>
        <Col>
          <PericiasProfPanel doc={doc} />
          <EspecializacoesPanel doc={doc} />
          <OficiosPanel doc={doc} />
        </Col>
        <Col>
          <HabilidadesArvorePanel doc={doc} refs={refs} />
          <AcoesPanel doc={doc} refs={refs} />
          <TecnicasPanel doc={doc} refs={refs} />
        </Col>
        <Col>
          <MagiasHabPanel doc={doc} refs={refs} />
        </Col>
      </PanelTrack>
    </div>
  )
}
