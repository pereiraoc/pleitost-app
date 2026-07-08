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
import { applyPericiaRankEdit } from '../../rules/apply-pericia-rank-edit'
import { addMagiaToEscola, removeMagiaFromEscola } from '../../rules/apply-magia-edit'
import type { AtributoId } from '../../rules/rules-model'
import {
  TipHover,
  TipProvider,
  enrichRuleTooltips,
  movimentoBreakdown,
  oficioBreakdown,
  periciaBreakdown,
  rankSourceTips,
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
  sourceTipHtml,
  type BreakdownResult,
} from './tooltips'
import {
  ATTR_DOT_COLORS,
  ATTR_EMOJI,
  EQUIP_ARMA_ESPECIFICA_SRC_PATH,
  EQUIP_TYPES,
  PF_TIER_COLORS,
  RANK_GROUP_ORDER,
  RANK_ORDER,
  SLOT_GROUP,
  type RankLetter,
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
      ic: tokens.emojis.categoria.Habilidade,
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
      // #23: diretriz do usuário — o seletor é da classe INICIAL (nível 1);
      // rótulo "Classe Inicial" (o golden editavel__tab-perfil ainda mostra
      // "Classe"; o design será atualizado pelo usuário).
      label: 'CLASSE INICIAL',
      value: classeFmValue,
      options: withCurrent(rules?.classes ?? [], classeFmValue, linkLabel(str(fm['Classe']))),
      onChange: setClasse,
    },
    ...(rules
      ? rules.subclassChoices.map((c) => ({
          // #24: subclasses são docs de categoria Habilidade (golden:
          // data-link-categoria="Habilidade") — o livrinho vermelho vem do
          // registro categoria.Habilidade (📕), não do perfil.Subclasse (📘).
          ic: tokens.emojis.categoria.Habilidade,
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
  const rules = useHeroRules(model.fm)
  // Lê o FM DERIVADO: `Definir/Escolher Atributos.Principal` da classe já
  // rodou o swap (PRE no rank 3, Principal=PRE) AO VIVO — o painel reflete a
  // classe sem esperar um save materializar (#58). O SWAP manual também opera
  // sobre os valores derivados, mantendo display e edição consistentes.
  const fm = rules?.derivedFm ?? model.fm
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

  // Fonte da restrição de Atributo Principal (#22) — espelho VERBATIM do
  // único tooltip do perfil-card do plugin (perfil-card.ts:636,649-651):
  // attachSourceTooltip(cell, principalSources.map((n) => `Regra.${n}`)),
  // com principalSources = ruleSourcesByPath["atributoPrincipal"]. O duplo
  // prefixo ("Regra · Regra.[[Bardo]]") é o formato REAL — confirmado no
  // golden editavel__tab-perfil do Carlos.
  const principalTip = sourceTipHtml(
    (rules?.ruleSourcesByPath['atributoPrincipal'] ?? []).map((n) => `Regra.${n}`),
  )

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
          // Editável só com 2+ opções elegíveis (canChoose do plugin,
          // perfil-card.ts:664) — senão a célula fica fixa (display).
          const editable = a.options.length >= 2
          const box = (
            <div
              style={{
                position: 'relative',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                // padding do select desenhado (dc.html:795: 12px 22px 12px 12px)
                padding: editable ? '12px 22px 12px 12px' : 12,
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
              {editable ? (
                // ▾ do select desenhado (dc.html:795, right:9px)
                <span
                  style={{
                    position: 'absolute',
                    right: 9,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted)',
                    fontSize: 10,
                    pointerEvents: 'none',
                  }}
                >
                  ▾
                </span>
              ) : null}
            </div>
          )
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
              {/* Tooltip só na célula do PRINCIPAL — como o `rank === 3 &&
                  principalSources` do plugin (perfil-card.ts:649). */}
              <TipHover html={a.isPrincipal ? principalTip : null} style={{ width: '100%' }}>
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
              </TipHover>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Chaves do ruleSourcesByPath/sourcesPerRank de uma linha de proficiência
 *  das listas — espelho do `base` de tab-proficiencias do plugin
 *  (tab-proficiencias.ts:226/246: `defesasResistencias.<Nome>` /
 *  `sentidos.<Nome>`; nomes do model são slugs, FM guarda com acento). */
function stackPaths(ns: string, row: ProfRow): { prof: string; item?: string; star?: string } {
  const base = `${ns}.${slugify(str(row.Nome))}`
  return { prof: `${base}.proficiencia`, item: `${base}.bonusItem`, star: `${base}.bonusEspecial` }
}

interface StackSection {
  title: string
  /** modKind do profData recuperado: std10 | move | none. */
  modKind: 'std10' | 'move' | 'none'
  /** Flags por seção do profData (viram opacity dos cabeçalhos). */
  showProf: 0 | 1
  showDots: 0 | 1
  showStar: 0 | 1
  /** Builder do tooltip de breakdown do VALOR (#21) — conteúdo do plugin
   *  (util/modificadores.ts) sobre o modelo salvo; Combate não tem caixa. */
  breakdown?: (row: ProfRow, attrs: Record<string, number>) => BreakdownResult
  rows: {
    lead: string
    row: ProfRow
    /** hasDots/starOp do mk() do design (Ataque: dn=0, star=null). */
    hasDots: boolean
    starOp: 0 | 1
    showMedal: boolean
    /** Chaves de fonte (rank/dots/star) — ausente = sem tooltip, como as
     *  linhas de Movimento do plugin (prof-section.ts:245-270, sem attach). */
    paths?: { prof: string; item?: string; star?: string }
  }[]
}

function StacksPanel({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
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
      breakdown: resistenciaBreakdown,
      rows: defesas.map((row) => ({
        lead: (tokens.emojis.defesa as Record<string, string>)[slugify(str(row.Nome))] ?? '',
        row,
        hasDots: true,
        starOp: 1 as const,
        showMedal: true,
        paths: stackPaths('defesasResistencias', row),
      })),
    },
    {
      title: 'Sentidos',
      modKind: 'std10',
      showProf: 1,
      showDots: 1,
      showStar: 1,
      breakdown: sentidoBreakdown,
      rows: sentidos.map((row) => ({
        lead: (tokens.emojis.categoria as Record<string, string>)[slugify(str(row.Nome))] ?? '',
        row,
        hasDots: true,
        starOp: 1 as const,
        showMedal: true,
        paths: stackPaths('sentidos', row),
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
          // Escalar `ataques.proficiencia` — espelho de tab-proficiencias.ts:
          // 269-276 (Combate/Ataque, sem dots/star).
          paths: { prof: 'ataques.proficiencia' },
        },
      ],
    },
    {
      title: 'Movimentos',
      modKind: 'move',
      showProf: 0,
      showDots: 1,
      showStar: 1,
      breakdown: movimentoBreakdown,
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
          {sec.rows.map(({ lead, row, hasDots, starOp, showMedal, paths }) => {
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
            // Fontes por rank (#21) — mesmo pipeline do renderProfRow do
            // plugin (prof-section.ts:126-135): deriveNaemStates com
            // allRuleDriven (defesas/sentidos/ataque são rule-driven, sem
            // incrementos no FM) + sourcesPerRank granular + enrich.
            const tips = paths
              ? enrichRuleTooltips(
                  rankSourceTips({
                    row,
                    allRuleDriven: true,
                    sourcesPerRank: rules?.sourcesPerRank[paths.prof],
                  }),
                  rules?.ruleSourcesByPath[paths.prof],
                )
              : undefined
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
                      <TipHover
                        html={sec.breakdown ? renderBreakdownHtml(sec.breakdown(row, attrs)) : null}
                      >
                        <ModBox
                          modStr={modStr}
                          rank={profLetter(row)}
                          star={num(row.Bonus_Especial) > 0}
                          dots={num(row.Bonus_Item)}
                        />
                      </TipHover>
                    ) : null}
                  </span>
                ) : null}
                <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  {!edit && showMedal ? (
                    <RankMedal rank={profLetter(row)} tipSources={tips?.[profLetter(row)]} />
                  ) : null}
                  {edit && showMedal ? <RankBtns states={rankStates(row)} tips={tips} /> : null}
                </span>
                {edit ? (
                  <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                    {hasDots ? (
                      <GoldDots
                        on={num(row.Bonus_Item)}
                        tipSources={paths?.item ? rules?.ruleSourcesByPath[paths.item] : undefined}
                      />
                    ) : null}
                  </span>
                ) : null}
                {edit ? (
                  <span style={{ display: 'flex', justifyContent: 'center', opacity: starOp }}>
                    {/* Fonte no valor de Especialização — espelho do attach
                        do star (prof-section.ts:168-170). */}
                    <TipHover
                      html={paths?.star ? sourceTipHtml(rules?.ruleSourcesByPath[paths.star]) : null}
                    >
                      <StarChip n={num(row.Bonus_Especial)} />
                    </TipHover>
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  const inventario = (fm['Inventario'] ?? {}) as Record<string, unknown>
  const especificas = (fmPath(fm, 'Inventario', 'Armas', 'Proficiencia', 'Especificas') ?? []) as unknown[]

  const tipos = EQUIP_TYPES.map((t) => ({
    ic: t.ic,
    nm: t.nm,
    cur: (str(fmPath(inventario, ...t.path)) === 'P' ? 'P' : 'N') as 'P' | 'N',
    // Fonte no grid de toggles (#22) — espelho de renderBinariaToggle
    // (prof-equipamentos-card.ts:123-126); chave srcPath do registro.
    tip: sourceTipHtml(rules?.ruleSourcesByPath[t.srcPath]),
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
              {r.t ? (
                <TipHover html={r.t.tip} style={{ gap: 4 }}>
                  <PnBtns cur={r.t.cur} />
                </TipHover>
              ) : null}
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
              {/* Arma específica: sempre P; fonte da chave armasEspecificas —
                  espelho de prof-equipamentos-card.ts:98-102. */}
              {r.w ? (
                <TipHover
                  html={sourceTipHtml(rules?.ruleSourcesByPath[EQUIP_ARMA_ESPECIFICA_SRC_PATH])}
                  style={{ gap: 4 }}
                >
                  <PnBtns cur="P" />
                </TipHover>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===================== sub-aba PERÍCIAS ===================== */

function PericiasProfPanel({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  // FM DERIVADO (FM salvo + cascata de regras) pro render LIVE; fallback no
  // salvo enquanto a projeção resolve — espelho de vm.model do Editável.
  const fm = rules?.derivedFm ?? model.fm
  const { values: attrs } = heroAtributos(fm)
  const [edit, setEdit] = useState(false)
  const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]

  const usedBy = (letter: string) =>
    pericias.filter((p) =>
      (p.Incrementos ?? []).some((inc) => str((inc as Record<string, unknown>)[letter]).startsWith('Slot')),
    ).length
  const slots = slotsInfo(fmPath(fm, 'Pericias', 'Slots'), usedBy, ['A', 'E', 'M'])

  // Clique num rank → gasta/rebaixa Slot.<rank> respeitando o piso de regra
  // (#61). O PISO vem dos incrementos da linha DERIVADA (regra ao vivo); os
  // Slot.<rank> são gravados na lista SALVA (o merge reaplica a regra por cima).
  const savedPericias = (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as Record<string, unknown>[]
  const onRankPick = (row: ProfRow, letter: RankLetter) => {
    model.set(
      'Pericias.Lista',
      applyPericiaRankEdit(savedPericias, (row.Incrementos ?? []) as Record<string, unknown>[], str(row.Nome), letter),
    )
  }

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
      {pericias.map((row) => {
        const slug = slugify(str(row.Nome))
        // Fontes por rank (#25) — pipeline da pericias-card do plugin
        // (pericias-card.ts:103-110): deriveNaemStates SÓ com incrementos
        // (sem allRuleDriven nem sourcesPerRank) + enrich pelo
        // ruleSourcesByPath do path da proficiência.
        const tips = enrichRuleTooltips(
          rankSourceTips({ row, allRuleDriven: false }),
          rules?.ruleSourcesByPath[`pericias.${slug}.proficiencia`],
        )
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
                {/* Breakdown do MODIFICADOR (#21/#25) — buildPericiaBreakdown
                    do plugin (modificadores.ts:309-314) sobre o modelo salvo. */}
                <TipHover html={renderBreakdownHtml(periciaBreakdown(row, attrs))}>
                  <ModBox
                    modStr={signed(rowMod(row, attrs))}
                    rank={profLetter(row)}
                    star={num(row.Bonus_Especial) > 0}
                    dots={num(row.Bonus_Item)}
                  />
                </TipHover>
              </span>
            ) : null}
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {!edit ? (
                <RankMedal rank={profLetter(row)} tipSources={tips[profLetter(row)]} />
              ) : (
                <RankBtns states={rankStates(row)} tips={tips} onPick={(letter) => onRankPick(row, letter)} />
              )}
            </span>
            {edit ? (
              <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                <GoldDots
                  on={num(row.Bonus_Item)}
                  tipSources={rules?.ruleSourcesByPath[`pericias.${slug}.bonusItem`]}
                />
              </span>
            ) : null}
            {edit ? (
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <TipHover html={sourceTipHtml(rules?.ruleSourcesByPath[`pericias.${slug}.bonusEspecial`])}>
                  <StarChip n={num(row.Bonus_Especial)} />
                </TipHover>
              </span>
            ) : null}
          </div>
        )
      })}
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  // Display usa o FM DERIVADO (perícia elevada por regra já vira elegível);
  // a ESCRITA regrava só a lista SALVA (não materializa saídas de regra).
  const fm = rules?.derivedFm ?? model.fm
  const [edit, setEdit] = useState(false)
  const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]

  // Elegibilidade do plugin (especializacoes-card.ts:69-70): rank ≥ E dá
  // direito a 1 Especialização; NENHUMA regra envolvida, só o rank salvo.
  const eligivel = (p: ProfRow) => RANK_ORDER.indexOf(profLetter(p)) >= RANK_ORDER.indexOf('E')

  // Escolha persiste NO MODELO: regrava Especializacao ('' desmarca — o
  // plugin serializa null → "", serialize-to-fm.ts:229-245) na linha da
  // perícia dentro de Pericias.Lista.
  const setEspecializacao = (slug: string, value: string) => {
    const saved = (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as ProfRow[]
    const next = saved.map((r) =>
      slugify(str(r.Nome)) === slug ? { ...r, Especializacao: value } : r,
    )
    model.set('Pericias.Lista', next)
  }

  // Modo edição (#26): grupos "<Perícia> (E)" pra TODAS as elegíveis, com
  // TODAS as opções da vault (projeção especializacaoOptions) — oráculo:
  // golden editavel__tab-habilidades (radios as-ht-especializacao-<pid>).
  // Modo visualização: só os picks salvos (comportamento do design).
  const grupos =
    edit && rules
      ? pericias.filter(eligivel).map((p) => {
          const slug = slugify(str(p.Nome))
          const pick = str(p.Especializacao)
          return {
            skill: `${displayName(slug)} (E)`,
            items: (rules.especializacaoOptions[slug] ?? []).map((opt) => ({
              on: pick === opt,
              txt: linkLabel(opt),
              toggle: () => setEspecializacao(slug, pick === opt ? '' : opt),
            })),
          }
        })
      : pericias
          .filter((p) => str(p.Especializacao))
          .map((p) => ({
            skill: `${displayName(slugify(str(p.Nome)))} (${profLetter(p)})`,
            items: [
              {
                on: true,
                txt: linkLabel(str(p.Especializacao)),
                toggle: undefined as (() => void) | undefined,
              },
            ],
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
              {grp.items.length === 0 ? (
                // String do plugin (especializacoes-card.ts:111-113).
                <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>
                  Nenhuma Especialização cadastrada
                </div>
              ) : null}
              {grp.items.map((sp) => (
                <div
                  key={sp.txt}
                  style={{
                    // --on do design (dc.html:917): radio pinta borda/miolo
                    // via color-mix com a var — 1 marcado, 0 desmarcado.
                    ['--on' as string]: sp.on ? 1 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                  }}
                >
                  <Losango />
                  {edit ? (
                    // Radio-toggle verbatim do design (dc.html:918-920);
                    // clicar no marcado desmarca — contrato do plugin
                    // (especializacoes-card.ts:132-140).
                    <button
                      onClick={sp.toggle}
                      aria-label={`${grp.skill}: ${sp.txt}`}
                      aria-pressed={sp.on}
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: '50%',
                        border: '2px solid color-mix(in srgb,var(--red) calc(40% + var(--on,0)*60%),var(--line2))',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                        cursor: 'pointer',
                        background: 'transparent',
                        padding: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb,var(--red) calc(var(--on,0)*100%),transparent)',
                        }}
                      />
                    </button>
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
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
        const slug = slugify(str(row.Nome))
        // Fontes por rank — espelho do bloco de Ofícios do plugin
        // (tab-proficiencias.ts:181-189): allRuleDriven quando não há
        // incrementos, SEM sourcesPerRank, enrich pelo path do ofício.
        const tips = enrichRuleTooltips(
          rankSourceTips({ row, allRuleDriven: (row.Incrementos?.length ?? 0) === 0 }),
          rules?.ruleSourcesByPath[`oficios.${slug}.proficiencia`],
        )
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
                // Breakdown do MODIFICADOR — buildOficioBreakdown do plugin
                // (modificadores.ts:577-594): atributo só conta com prof ≥ A,
                // linhas zeradas omitidas, total sem sinal no popup.
                <TipHover html={renderBreakdownHtml(oficioBreakdown(row, attrs))}>
                  <ModBox
                    modStr={signed(rowMod(row, attrs))}
                    rank={profLetter(row)}
                    star={num(row.Bonus_Especial) > 0}
                    dots={num(row.Bonus_Item)}
                  />
                </TipHover>
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
              {!edit ? (
                <RankMedal rank={profLetter(row)} tipSources={tips[profLetter(row)]} />
              ) : (
                <RankBtns states={rankStates(row)} tips={tips} />
              )}
            </span>
            {edit ? (
              <span style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                <GoldDots
                  on={num(row.Bonus_Item)}
                  tipSources={rules?.ruleSourcesByPath[`oficios.${slug}.bonusItem`]}
                />
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  const entries = listaEntries(fmPath(fm, 'Acoes', 'Lista'))
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
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
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
  Proficiencia?: string
  Lista?: unknown
}

// Gate per-escola×rank do painel de não-aprendidas — espelho de
// computeMagiasDerived do plugin (view-model.ts:593-626): a proficiência da
// escola precisa cobrir o rank da magia (profNum >= rankIdx). PROF sem A não
// existe (o rank mínimo A já cobre Básica). RANK_GROUP_SLOT = grupo → letra do
// slot (inverso de SLOT_GROUP) pro source `Slot.<letra>` ao aprender.
const MAGIA_PROF_NUM: Record<string, number> = { N: 0, A: 2, E: 3, M: 4 }
const MAGIA_RANK_IDX: Record<string, number> = { Básica: 1, Adepta: 2, Experiente: 3, Mestre: 4 }
const RANK_GROUP_SLOT: Record<string, 'B' | 'A' | 'E' | 'M'> = {
  Básica: 'B',
  Adepta: 'A',
  Experiente: 'E',
  Mestre: 'M',
}
function escolaCobreRank(prof: string, rankGroup: string): boolean {
  return (MAGIA_PROF_NUM[prof] ?? 0) >= (MAGIA_RANK_IDX[rankGroup] ?? 99)
}

function MagiasHabPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  const [edit, setEdit] = useState(false)
  const escolasAll = (fmPath(fm, 'Magias', 'Lista') ?? []) as EscolaFm[]
  // Painel ESQUERDO (Aprendidas): só escolas que já têm magia na lista.
  const escolas = escolasAll.filter((e) => listaEntries(e.Lista).length > 0)
  // Painel DIREITO (Não Aprendidas): escolas em que o herói PODE lançar
  // (proficiência ≠ N), mesmo sem magia aprendida ainda. Sem isto, uma ficha
  // NOVA com slot concedido por regra não oferecia o catálogo — os slots eram
  // computados mas o seletor nunca aparecia (issue #56). Espelha a regra do
  // plugin (magias-card.ts: renderiza a escola quando prof ≠ N). Tesouros é
  // exclusivo (não se aprende por slot), fica de fora.
  const escolasProficiente = escolasAll.filter(
    (e) => str(e.Nome) !== 'Tesouros' && str(e.Proficiencia) !== 'N',
  )
  const slotsFm = fmPath(fm, 'Magias', 'Slots') as Record<string, unknown> | undefined

  const h2Of = (nome: string) => (nome === 'Tesouros' ? 'Magias de Tesouros' : `Magias ${nome}`)

  // Docs de magia da vault por escola (pasta "Magia <Escola>") pro painel edit —
  // pelas escolas PROFICIENTES (fonte das não-aprendidas), não pelas aprendidas.
  const spellIdsByEscola = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const escola of escolasProficiente) {
      const nome = str(escola.Nome)
      map.set(
        nome,
        catalog.content
          .filter((e) => e.type === 'Magia' && e.id.includes(`/Magia ${nome}/`))
          .map((e) => e.id),
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, fm])
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

  // Aprender/remover magia por slot (#62): grava na lista SALVA (o merge
  // reaplica as concessões de regra por cima). Espelho de addMagia/removeMagia
  // do plugin — `Slot.<letra>` ao aprender; − só nas slot-learned.
  const onAddMagia = (escolaNome: string, basename: string, rankGroup: string) => {
    const savedEscolas = (fmPath(model.fm, 'Magias', 'Lista') ?? []) as Record<string, unknown>[]
    const letter = RANK_GROUP_SLOT[rankGroup] ?? 'A'
    model.set('Magias.Lista', addMagiaToEscola(savedEscolas, escolaNome, `[[${basename}]]`, letter))
  }
  const onRemoveMagia = (escolaNome: string, target: string) => {
    const savedEscolas = (fmPath(model.fm, 'Magias', 'Lista') ?? []) as Record<string, unknown>[]
    model.set('Magias.Lista', removeMagiaFromEscola(savedEscolas, escolaNome, target))
  }

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
                              {/* − só nas slot-learned (rule-granted é readonly, plugin). */}
                              {edit && !isTesouro && e.fonte.kind === 'Slot' ? (
                                <button
                                  aria-label={`Remover ${e.label}`}
                                  onClick={() => onRemoveMagia(nome, e.target)}
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
              {escolasProficiente.map((escola) => {
                  const nome = str(escola.Nome)
                  const escolaProf = str(escola.Proficiencia)
                  const learned = new Set(listaEntries(escola.Lista).map((e) => e.target))
                  const byRank = new Map<string, VaultDoc[]>()
                  for (const id of spellIdsByEscola.get(nome) ?? []) {
                    const d = spellDocs?.get(id)
                    if (!d || learned.has(d.basename)) continue
                    const rank = rankGroupLabel(str(d.frontmatter['rank']))
                    // Gate per-escola×rank (#62): a proficiência da escola cobre
                    // o rank da magia E existe slot daquele rank (slot livre).
                    if (!escolaCobreRank(escolaProf, rank)) continue
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
                                  aria-label={`Aprender ${d.basename}`}
                                  onClick={() => onAddMagia(nome, d.basename, g)}
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
  // pad 0: no design os painéis desta tela recebem contentPad (dc.html:748),
  // que aqui já vem do .app-main — padding extra dobraria a margem.
  return (
    <TrackPanel pad="0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {children}
    </TrackPanel>
  )
}

export function HabilidadesTab({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const [tab, setTab] = useState('perfil')
  const index = Math.max(
    0,
    HAB_TABS.findIndex((t) => t.id === tab),
  )

  return (
    // TipProvider: overlay singleton dos tooltips da aba (#21 #22 #25) —
    // espelho do popup único do plugin (breakdown-tooltip.ts:18-39).
    <TipProvider>
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          // strip→painel = contentPad vertical do design (dc.html:748)
          gap: 24,
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
    </TipProvider>
  )
}
