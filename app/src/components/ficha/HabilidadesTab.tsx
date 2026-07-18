// Aba COMPETÊNCIAS (habilidades) da ficha — markup/estilos verbatim do design
// puxado (design/pulled/Companion App.dc.html §HABILIDADES, linhas 735-1105).
// Dados do modelo salvo; catálogos de técnicas/magias não aprendidas vêm dos
// docs REAIS da vault (classe/escola do herói). Interações são estado local
// EFÊMERO. Larguras de grid, rótulos ('VALOR') e enriquecimento das linhas
// (enrich/enrichStk) seguem o fim do profData/renderVals recuperado no pull:
//   perCols/ofiCols/stkCols = edit ? 'minmax(96px,1.25fr) 0.75fr 1fr 1fr'
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
import { familiaOf, familiaTemPericia, fichaFamiliaOf } from '../../data/familia'
import { clip, AttrBadge, EditToggle, GoldDots, ModBox, PanelTrack, RankBtns, RankMedal, TabStrip, TrackPanel } from './bits'
import type { HeroRefs } from './useHeroRefs'
import { BoxSelect, PassadoBox, withCurrent, type SelectOption } from './PerfilTab'
import { useHeroRules } from '../../rules/useHeroRules'
import {
  escolaDestinoDaMagia,
  pickArcanaEspecial,
  placeMagiaChoicePick,
  shouldOfferEssenciais,
  swapAtributo,
} from '../../rules/projection'
import type { Catalog } from '../../data/catalog'
import {
  applyPericiaRankEdit,
  computePericiaMaxReachable,
  pisoLetterFromIncrementos,
  ranksOutsideRange,
} from '../../rules/apply-pericia-rank-edit'
import { addMagiaToEscola, removeMagiaFromEscola } from '../../rules/apply-magia-edit'
import { computeMagiaAtaque, lookupRota } from '../../interativa/invocacao'
import { addTecnicaToLista, removeTecnicaFromLista } from '../../rules/apply-tecnica-edit'
import {
  canAddOne,
  computeMagiaSlotsView,
  computeSlotsView,
  magiaCanAddOne,
  type MagiaRank,
} from '../../rules/slot-accounting'
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
import { ItemHover, ITEM_CARD_CSS, esc } from '../item-card'
import { useNamedDocs } from './useNamedDocs'
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
  ESPECIALIDADE_EMOJI,
  grupoArmaEmoji,
  MAESTRIA_EMOJI,
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
  oficioMod,
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
const PROF_COLS_EDIT = 'minmax(96px,1.25fr) 0.75fr 1fr 1fr'

/** Dígitos iniciais de um custo ("2A" → "2"; "L"/vazio → ""). */
function custoDigits(custo: unknown): string {
  const m = /^(\d+)/.exec(str(custo).trim())
  return m ? m[1]! : ''
}

/** Rank (Adepta/Experiente/Mestre) de um doc: inline rank::, senão subcategoria. */
function docRankGroup(doc: VaultDoc | undefined): string {
  if (!doc) return ''
  const inline = linkLabel(str((doc.inlineFields as Record<string, unknown>)['rank']))
  return rankGroupLabel(inline || str(doc.subtype ?? ''))
}

export function StarChip({ n, compact = false }: { n: number; compact?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 2 : 3,
        padding: compact ? '1px 6px' : '4px 11px',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: compact ? 9 : 11,
        fontWeight: 700,
        color: 'var(--muted)',
      }}
    >
      <span style={{ color: 'var(--accent)' }}>★</span>
      {n}
    </span>
  )
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

/** Escolha de BENEFÍCIO descrita em prosa no corpo da técnica/habilidade
 *  (ex.: Instrumentos de Guerra: "Escolha um dos benefícios: **X:** … **Y:** …").
 *  A vault define isso como texto (fence de regra vazia), então as opções vêm do
 *  próprio corpo (fonte de verdade). Retorna { nome, texto } por bullet, ou []. */
function benefitChoiceOptions(doc: VaultDoc | undefined): { nome: string; texto: string }[] {
  if (!doc) return []
  const body = doc.body ?? ''
  if (!/Escolha\s+um\s+d[oa]s?\s+benef/i.test(body)) return []
  const out: { nome: string; texto: string }[] = []
  const re = /^\s*[-*]\s+\*\*([^:*]+):\*\*\s*(.*)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.push({ nome: m[1]!.trim(), texto: m[2]!.trim() })
  return out
}

export function ClasseNivelPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const model = useHeroModel(doc, 'habilidades')
  const fm = model.fm
  // Projeção de regras (app/src/rules): opções de Classe/Sintonia (vault
  // scans) + escolhas de subclasse (Selecionar avaliado com picks inferidos
  // do FM) — espelho do vm.derived + choices do Editável do plugin
  // (render/view-model.ts + render/groups/perfil-card.ts).
  const rules = useHeroRules(fm)
  // Delta por família (#201): CA mostra "Tipo" estático (perfil-card.ts:
  // 322-331) e o nível satélite do tutor (sync-ca-tutor-nivel.ts) — sem
  // stepper. Flags centrais de FICHA_FAMILIA.
  const caps = fichaFamiliaOf(doc)
  // Nível persiste NA HORA no overlay (topbar NVL e PERFIL leem o mergeado).
  // O EXIBIDO vem do FM DERIVADO: pro CA é o nível do tutor (calculated
  // ["Nível"]); pro herói o merge repassa o salvo — mesmo valor.
  const nivelSalvo = num(fm['Nível'])
  const nivel = num((rules?.derivedFm ?? fm)['Nível'])
  const setNivel = (fn: (n: number) => number) => model.set('Nível', fn(nivelSalvo))
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
      const source = entries[0]![1]
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
      // Card no hover: caixa = subclasse escolhida; label = habilidade-pai.
      boxTarget: e.raw,
      labelTarget: e.fonte.target,
    }))

  const selects: {
    ic: string
    label: string
    value: string
    options: SelectOption[]
    onChange?: (v: string) => void
    boxTarget: string
    labelTarget?: string
  }[] = [
    {
      // Rótulo/emoji do registro central por família (#201): Heroi "Classe"
      // (perfil-card.ts:398+), CA "Tipo" (perfil-card.ts:322-331) — chave de
      // tokens.emojis.perfil.
      ic: tokens.emojis.perfil[caps.classe.rotulo],
      // #23: diretriz do usuário — o seletor é da classe INICIAL (nível 1);
      // rótulo "Classe Inicial" (o golden editavel__tab-perfil ainda mostra
      // "Classe"; o design será atualizado pelo usuário). CA: "Tipo", display
      // estático (as classes do dropdown são de HERÓI; o Tipo do CA não é
      // editável no plugin).
      label: caps.classe.editavel ? 'CLASSE INICIAL' : caps.classe.rotulo.toUpperCase(),
      value: classeFmValue,
      // Opção em branco no topo — herói novo nasce SEM classe (Classe=''); sem
      // isso o <select> mostrava a 1ª opção (Animista) como se estivesse escolhida (#nc).
      options: caps.classe.editavel
        ? [
            { value: '', label: '— Nenhuma —' },
            ...withCurrent(rules?.classes ?? [], classeFmValue, linkLabel(str(fm['Classe']))),
          ]
        : [{ value: classeFmValue, label: linkLabel(str(fm['Classe'])) || '—' }],
      onChange: caps.classe.editavel ? setClasse : undefined,
      boxTarget: classeFmValue,
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
          // Card no hover: caixa = subclasse escolhida; label = habilidade-pai.
          boxTarget: c.pick ?? '',
          labelTarget: c.parent,
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
    <div
      className="classe-nivel-row"
      style={{ ...panel, display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}
    >
      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* Sem subclasse (ex.: Animista) o select de classe ocupa a linha
            INTEIRA (mesma largura da Sintonia abaixo); com subclasses, grade
            de 3 como antes (pedido do usuário). */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: selects.length === 1 ? 'minmax(0,1fr)' : 'repeat(3,minmax(0,1fr))',
            gap: 11,
          }}
        >
          {selects.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {/* Label acima da subclasse = habilidade-pai → card no hover. */}
              <ItemHover doc={refs.refDoc(s.labelTarget)} fullBody>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--muted)' }}
                >
                  {s.ic} {s.label}
                </span>
              </ItemHover>
              {/* Caixa (classe inicial / subclasse) → card do doc selecionado.
                  #311: as células da grade têm altura igual (stretch); empurrar o
                  select pro RODAPÉ (marginTop auto) alinha todos os dropdowns
                  mesmo quando um rótulo (nome de subclasse) ocupa 2 linhas. */}
              <ItemHover
                doc={refs.refDoc(s.boxTarget)}
                fullBody
                style={{ display: 'block', width: '100%', marginTop: 'auto' }}
              >
                <SelectBox ariaLabel={s.label} value={s.value} options={s.options} onChange={s.onChange} />
              </ItemHover>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--muted)' }}
          >
            🌀 SINTONIA
          </span>
          {/* Caixa de sintonia → card do Traço Elemental no hover. */}
          <ItemHover doc={refs.refDoc(sintoniaFmValue)} fullBody style={{ display: 'block', width: '100%' }}>
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
          </ItemHover>
        </div>
      </div>
      <div
        className="classe-nivel-level"
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
        {/* Stepper de nível: nunca pro CA — o nível é satélite do tutor
            (plugin sync-ca-tutor-nivel.ts; o perfil do CA mostra o diamond
            estático, perfil-card.ts:345-357). */}
        {caps.nivelDoTutor ? null : (
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
        )}
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
  // Regra do compêndio de cada defesa/resistência/sentido/movimento (#105).
  const ruleDoc = useNamedDocs(
    [...defesas, ...sentidos, ...movimentos].map((r) => displayName(slugify(str(r.Nome)))),
  )

  // Seções verbatim do profData recuperado (title/modKind/showProf/Dots/Star).
  const sections: StackSection[] = [
    {
      title: 'Defesas e Resistências',
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
                  {/* NOME da defesa/resistência/sentido → a REGRA do compêndio
                      (corpo do doc), não a fonte nem o breakdown (#105). */}
                  <ItemHover doc={ruleDoc(displayName(slugify(str(row.Nome))))} fullBody style={{ minWidth: 0 }}>
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
                  </ItemHover>
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

function EquipamentosProfPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
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
  // Regra do compêndio de cada categoria de equipamento (pelo nome) — #105.
  const ruleDoc = useNamedDocs(EQUIP_TYPES.map((t) => t.nm))
  const armas = (Array.isArray(especificas) ? especificas : []).map((raw) => {
    const target = wikiTarget(raw)
    const res = catalog.resolve(target)
    const entry = res.kind === 'doc' ? catalog.entryById.get(res.id) : undefined
    return {
      ic: grupoArmaEmoji(typeof entry?.grupo === 'string' ? entry.grupo : ''),
      nm: linkLabel(str(raw)),
      doc: refs.refDoc(raw),
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
          gridTemplateColumns: 'minmax(96px,1.25fr) 0.75fr 1fr 1fr',
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,1.25fr) 0.75fr 1fr 1fr', alignItems: 'center', gap: '0 8px' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '6px 2px' }}>
              {r.t ? (
                <>
                  <span style={{ fontSize: 14, flex: 'none' }}>{r.t.ic}</span>
                  {/* NOME da categoria → a REGRA do compêndio (corpo do doc), #105. */}
                  <ItemHover doc={ruleDoc(r.t.nm)} fullBody style={{ minWidth: 0 }}>
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
                  </ItemHover>
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
                  {/* Arma específica: card do doc real no hover. */}
                  <ItemHover doc={r.w.doc}>
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
                  </ItemHover>
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
  // Perícias POR FAMÍLIA (#201): o CA só possui a whitelist de 6 (plugin
  // data/family-pericias.ts; tab-completa do CA passa filter: CA_PERICIAS) —
  // o FM lista as 13, mas as fora da família não renderizam nem contam slot
  // (buildPericiaSlotsText do plugin soma só as CA_PERICIAS).
  const familia = familiaOf(doc)
  const pericias = ((fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]).filter((p) =>
    familiaTemPericia(familia, slugify(str(p.Nome))),
  )
  // Regra do compêndio de cada perícia (pelo nome) pro tooltip (#106).
  const ruleDoc = useNamedDocs(pericias.map((p) => displayName(slugify(str(p.Nome)))))

  const usedBy = (letter: string) =>
    pericias.filter((p) =>
      (p.Incrementos ?? []).some((inc) => str((inc as Record<string, unknown>)[letter]).startsWith('Slot')),
    ).length
  const slots = slotsInfo(fmPath(fm, 'Pericias', 'Slots'), usedBy, ['A', 'E', 'M'])

  // Economia de slot (#73): o rank-up só gasta os slots que existem. `used` =
  // perícias com Slot.X por rank; `total` = Pericias.Slots do derivedFm. O teto
  // alcançável por perícia (com fungibilidade) trava o NAEM acima do orçamento —
  // espelho de computePericasSlots + computePericiaMaxReachable do plugin
  // (view-model.ts:530+; pericias-card.ts:192/204 ranksOutsideRange(piso, teto)).
  const slotsFmPer = fmPath(fm, 'Pericias', 'Slots') as Record<string, unknown> | undefined
  const slotsView = computeSlotsView({
    total: { A: num(slotsFmPer?.['A']), E: num(slotsFmPer?.['E']), M: num(slotsFmPer?.['M']) },
    used: { A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })

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
              {/* NOME da perícia → a REGRA do compêndio (corpo do doc), não a
                  fonte nem o breakdown (#106). O breakdown fica no MODIFICADOR. */}
              <ItemHover doc={ruleDoc(displayName(slugify(str(row.Nome))))} fullBody style={{ minWidth: 0 }}>
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
              </ItemHover>
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
                <RankBtns
                  states={rankStates(row)}
                  tips={tips}
                  onPick={(letter) => onRankPick(row, letter)}
                  disabledRanks={ranksOutsideRange(
                    pisoLetterFromIncrementos((row.Incrementos ?? []) as Record<string, unknown>[]),
                    computePericiaMaxReachable(
                      profLetter(row),
                      (row.Incrementos ?? []) as Record<string, unknown>[],
                      slotsView,
                    ),
                  )}
                />
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
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  // Display usa o FM DERIVADO (perícia elevada por regra já vira elegível);
  // a ESCRITA regrava só a lista SALVA (não materializa saídas de regra).
  const fm = rules?.derivedFm ?? model.fm
  const [edit, setEdit] = useState(false)
  const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]

  // Elegibilidade do plugin (especializacoes-card.ts:69-70): rank ≥ E dá direito
  // a 1 Especialidade; rank ≥ M a 1 Maestria. NENHUMA regra — só o rank salvo.
  const eligivel = (p: ProfRow, minRank: 'E' | 'M') =>
    RANK_ORDER.indexOf(profLetter(p)) >= RANK_ORDER.indexOf(minRank)

  // Escolha persiste NO MODELO: regrava o campo (Especializacao|Maestria; ''
  // desmarca — plugin serializa null → "") na linha da perícia em Pericias.Lista.
  const setPick = (field: 'Especializacao' | 'Maestria', slug: string, value: string) => {
    const saved = (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as ProfRow[]
    const next = saved.map((r) =>
      slugify(str(r.Nome)) === slug ? { ...r, [field]: value } : r,
    )
    model.set('Pericias.Lista', next)
  }

  // Grupos por coluna. Modo edição (#26/#136): "<Perícia> (E|M)" pra TODAS as
  // elegíveis, com TODAS as opções da vault (especializacaoOptions/maestriaOptions);
  // modo visualização: só os picks salvos (comportamento do design).
  const buildGrupos = (
    field: 'Especializacao' | 'Maestria',
    minRank: 'E' | 'M',
    options: Record<string, string[]>,
  ) =>
    edit && rules
      ? pericias.filter((p) => eligivel(p, minRank)).map((p) => {
          const slug = slugify(str(p.Nome))
          const pick = str((p as Record<string, unknown>)[field])
          return {
            skill: `${displayName(slug)} (${minRank})`,
            items: (options[slug] ?? []).map((opt) => ({
              on: pick === opt,
              txt: linkLabel(opt),
              target: opt,
              toggle: () => setPick(field, slug, pick === opt ? '' : opt),
            })),
          }
        })
      : pericias
          .filter((p) => str((p as Record<string, unknown>)[field]))
          .map((p) => {
            const val = str((p as Record<string, unknown>)[field])
            return {
              skill: `${displayName(slugify(str(p.Nome)))} (${profLetter(p)})`,
              items: [{ on: true, txt: linkLabel(val), target: val, toggle: undefined as (() => void) | undefined }],
            }
          })

  const gruposEsp = buildGrupos('Especializacao', 'E', rules?.especializacaoOptions ?? {})
  const gruposMae = buildGrupos('Maestria', 'M', rules?.maestriaOptions ?? {})

  // Docs de TODAS as opções (selecionadas E não) pro card no hover (#107) — as
  // não selecionadas não estão nas refs do herói, então carrega aqui.
  const optIds = useMemo(() => {
    const s = new Set<string>()
    for (const g of [...gruposEsp, ...gruposMae]) for (const it of g.items) {
      const r = catalog.resolve(wikiTarget(it.target))
      if (r.kind === 'doc') s.add(r.id)
    }
    return [...s]
  }, [gruposEsp, gruposMae, catalog])
  const optDocs = useDocs(optIds)
  const optDoc = (t: string): VaultDoc | undefined => {
    const r = catalog.resolve(wikiTarget(t))
    return r.kind === 'doc' ? optDocs?.get(r.id) : undefined
  }

  // Uma coluna (Especialidades | Maestrias) — mesma seleção radial do design.
  const renderColuna = (titulo: string, emoji: string, grupos: typeof gruposEsp, vazio: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...monoTitle, letterSpacing: '.08em', marginBottom: 11 }}>{titulo}</div>
      {grupos.length === 0 ? (
        <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>{vazio}</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grupos.map((grp) => (
          <div key={grp.skill}>
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 7 }}>
              {grp.skill}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {grp.items.map((sp) => (
                <div
                  key={sp.txt}
                  // --on do design (dc.html:917): radio pinta borda/miolo via
                  // color-mix — 1 marcado, 0 desmarcado.
                  style={{ ['--on' as string]: sp.on ? 1 : 0, display: 'flex', alignItems: 'center', gap: 9 }}
                >
                  <Losango />
                  {edit && sp.toggle ? (
                    // Radio-toggle verbatim do design (dc.html:918-920); clicar no
                    // marcado desmarca (especializacoes-card.ts:132-140).
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
                  <span style={{ fontSize: 13, flex: 'none' }}>{emoji}</span>
                  <ItemHover doc={optDoc(sp.target)} fullBody>
                    <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{sp.txt}</span>
                  </ItemHover>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        <div style={{ ...monoTitle, letterSpacing: '.08em' }}>Especialidades e Maestrias</div>
        <span style={{ flex: 1 }} />
        <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {renderColuna('Especialidades', ESPECIALIDADE_EMOJI, gruposEsp, 'Nenhuma Especialidade cadastrada')}
        {renderColuna('Maestrias', MAESTRIA_EMOJI, gruposMae, 'Nenhuma Maestria cadastrada')}
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
  // Regra do compêndio de cada ofício (pelo nome) pro tooltip (#106).
  const ruleDoc = useNamedDocs(oficios.map((o) => displayName(slugify(str(o.Nome)))))
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
              {/* NOME do ofício → a REGRA do compêndio (corpo do doc), #106. */}
              <ItemHover doc={ruleDoc(nm)} fullBody style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {edit ? nm : complemento ? `${nm} (${complemento})` : nm}
                </span>
              </ItemHover>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
              {!edit ? (
                // Breakdown do MODIFICADOR — buildOficioBreakdown do plugin
                // (modificadores.ts:577-594): atributo só conta com prof ≥ A,
                // linhas zeradas omitidas, total sem sinal no popup.
                <TipHover html={renderBreakdownHtml(oficioBreakdown(row, attrs))}>
                  <ModBox
                    modStr={signed(oficioMod(row, attrs))}
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

/** Escolha (`Escolha_Habilidades`) pedida POR uma habilidade — projeção
 *  `rules.habilidadeChoices` (espelho do ChoiceDescriptor do plugin). Só o
 *  necessário pra renderizar o dropdown indentado. */
interface HabChoice {
  choiceKey: string
  label: string
  /** Opções em wikilink (`[[X]]`) ou display (prop-map/perícia-especial). */
  options: string[]
  /** Pick atual (wikilink ou display); null = nenhum. */
  pick: string | null
  kind: 'complementar-sel' | 'escolha-prop-map' | 'escolha-pericia-especial'
  /** targetRaw (`Complementar Tecnicas.Lista …`) — qual lista o pick alimenta. */
  targetRaw?: string
  /** Ocorrência 1-based da escolha dentro do MESMO pai (Escolha.NN.[[pai]]) —
   *  sem isso várias escolhas do mesmo pai (5 essências) colidiam num só pick. */
  occ?: number
}

interface TreeItem {
  txt: string
  ic: string
  child: boolean
  /** Basename-alvo do wikilink — casa com `sourceNote` das choices (plugin
   *  habilidades-card.ts:376-380: match por TARGET, não label). */
  target: string
  /** Escolhas indentadas sob esta habilidade (Item 1). */
  choices: HabChoice[]
}

/** Árvore por rank: pais na ordem do modelo, filhos (fonte → pai na lista) logo
 *  abaixo. `loaded=false` (refs ainda carregando) devolve árvore VAZIA — sem os
 *  docs alvos não dá pra saber o rank, e classificar tudo como 'Adepta' jogaria
 *  Experientes/Mestres na coluna errada (bug do Trovador). Espelho do
 *  bucketize-por-rank do plugin (habilidades-card.ts:119-139), onde o rank vem
 *  do `rank::` inline do body da nota alvo — indisponível até o doc resolver. */
function habTree(
  entries: ListaEntry[],
  refDoc: HeroRefs['refDoc'],
  loaded: boolean,
  choicesByTarget: Map<string, HabChoice[]>,
): Map<string, TreeItem[]> {
  if (!loaded) return new Map()
  const targets = new Set(entries.map((e) => e.target))
  const byParent = new Map<string, ListaEntry[]>()
  const roots: ListaEntry[] = []
  for (const e of entries) {
    // Pick de Escolha_Habilidades cujo pai TEM dropdown de escolha
    // (choicesByTarget) já é mostrado pela própria escolha — não duplicar como
    // filho na árvore (era isso que repetia as essências do Animista). EXCETO
    // quando o pick tem escolhas PRÓPRIAS (ex.: Treinamento de Animista, pick
    // da técnica de Classe Secundária, que abre as essências Menores): aí o
    // entry PRECISA estar na árvore pra pendurar os dropdowns dele.
    if (
      e.fonte.kind === 'Escolha' &&
      choicesByTarget.has(e.fonte.target) &&
      !choicesByTarget.has(e.target)
    )
      continue
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
  const itemOf = (e: ListaEntry, child: boolean): TreeItem => ({
    txt: e.label,
    ic: icOf(e.target),
    child,
    target: e.target,
    choices: choicesByTarget.get(e.target) ?? [],
  })
  for (const root of roots) {
    // Rank do doc alvo (inline `rank::`); default SEM rank explícito → 'Adepta',
    // como o plugin (habilidades-card.ts:123). Só chega aqui com `loaded`, então
    // o doc do root já resolveu e o Experiente/Mestre é confiável.
    const group = docRankGroup(refDoc(root.target)) || RANK_GROUP_ORDER[1]!
    push(group, itemOf(root, false))
    for (const child of byParent.get(root.target) ?? []) {
      push(group, itemOf(child, true))
    }
  }
  return groups
}

/** Cor da borda por RANK (aço escuro / prata / ouro) — mesma linguagem metálica
 *  dos tiers do item-card, aplicada às habilidades/técnicas. */
const RANK_BORDER: Record<string, string> = {
  Básica: '#6b727c',
  Adepta: '#6b727c',
  Experiente: '#dbe3ec',
  Mestre: '#e8c14a',
}

export function HabilidadesArvorePanel({
  doc,
  refs,
  readOnly,
}: {
  doc: VaultDoc
  refs: HeroRefs
  readOnly?: boolean
}) {
  const model = useHeroModel(doc, 'habilidades')
  const catalog = useCatalog()
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  const entries = listaEntries(fmPath(fm, 'Habilidades', 'Lista'))

  // Escolhas de habilidade (não-subclasse) por basename do sourceNote — casa
  // com a habilidade-pai na árvore (plugin habilidades-card.ts:377-380).
  const choicesByTarget = useMemo(() => {
    const map = new Map<string, HabChoice[]>()
    for (const c of rules?.habilidadeChoices ?? []) {
      const base = c.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
      if (!base) continue
      const list = map.get(base) ?? []
      list.push({
        choiceKey: c.choiceKey,
        label: c.label,
        options: c.options,
        pick: c.pick,
        kind: c.kind,
        targetRaw: c.targetRaw,
        occ: c.occurrenceWithinParent,
      })
      map.set(base, list)
    }
    return map
  }, [rules])

  const groups = habTree(entries, refs.refDoc, refs.loaded, choicesByTarget)
  const ordered = RANK_GROUP_ORDER.filter((g) => groups.has(g))
  // 2 colunas: esquerda = Básica/Adepta; direita = Experiente/Mestre (Mestre
  // ABAIXO de Experiente, não na coluna da esquerda).
  const leftGroups = ordered.filter((g) => g === 'Básica' || g === 'Adepta')
  const rightGroups = ordered.filter((g) => g === 'Experiente' || g === 'Mestre')
  // Alterar/Concluir (#148): fora do modo alterar as escolhas de habilidade
  // (Escolha_Habilidades de elementos de regra) ficam read-only; ao Alterar,
  // viram dropdown editável. Em Combate (readOnly) nunca edita.
  const [editState, setEdit] = useState(false)
  const edit = readOnly ? false : editState

  // Persiste o pick de uma `Escolha_Habilidades` (não-subclasse) como ESTADO no
  // FM salvo: regrava a linha `Escolha.[[<parent>]]` na LISTA-ALVO da choice
  // (Tecnicas/Magias/Acoes/Habilidades conforme targetRaw). O merge de regra
  // reaplica por cima e `resolveChoice/inferByOriginTag` re-infere o pick da
  // tag — mesmo mecanismo do subclassChoices (setSubclassPick acima) e da
  // persistência-como-estado do app (extract.ts:12). O plugin grava um
  // transient (`__choice__<key>`); aqui a fonte de verdade é o próprio FM.
  const onChoiceChange = (parentTarget: string, choice: HabChoice, newWl: string) =>
    writeChoicePick(model, catalog, refs, parentTarget, choice, newWl)

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <div style={{ ...monoTitle, letterSpacing: '.08em' }}>Habilidades</div>
        <span style={{ flex: 1 }} />
        {readOnly ? null : <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />}
      </div>
      <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>
        {[leftGroups, rightGroups].map((col, ci) => (
          <div key={ci} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {col.map((g) => (
          <div key={g}>
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 8 }}>
              {g}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {groups.get(g)!.map((it, i) => (
                <div key={`${it.txt}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      paddingLeft: it.child ? 30 : 8,
                      borderLeft: `3px solid ${RANK_BORDER[g] ?? 'var(--line2)'}`,
                    }}
                  >
                    {it.child ? (
                      <span style={{ fontSize: 14, color: 'var(--muted)', flex: 'none', lineHeight: 1 }}>↳</span>
                    ) : null}
                    {it.ic ? <span style={{ fontSize: 13, flex: 'none' }}>{it.ic}</span> : null}
                    <ItemHover doc={refs.refDoc(it.target)} fullBody>
                      {/* Filho identado: mostra só o que está entre parênteses
                          (ex.: "Estilo de Combate (Luta Artística)" → "Luta
                          Artística") — o contexto do pai acima já deixa claro; o
                          tooltip continua apontando pro doc certo (it.target). */}
                      <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>
                        {it.child ? (it.txt.match(/\(([^)]+)\)\s*$/)?.[1] ?? it.txt) : it.txt}
                      </span>
                    </ItemHover>
                  </div>
                  {/* Escolhas pedidas POR esta habilidade, indentadas como
                      children — mesmo SelectBox da subclasse (plugin
                      habilidades-card.ts renderChoiceLi:389-447). */}
                  {it.choices.map((c) => (
                    <div
                      key={c.choiceKey}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        paddingLeft: (it.child ? 26 : 0) + 26,
                      }}
                    >
                      {/* Label vem da rule (`Escolha_Habilidades "Label"`); sem
                          label a rule não deu um — não inventar (plugin
                          choiceLabel:485-487). */}
                      {c.label ? (
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 9.5,
                            letterSpacing: '.1em',
                            color: 'var(--muted)',
                          }}
                        >
                          {c.label}
                        </span>
                      ) : null}
                      {edit ? (
                        <SelectBox
                          ariaLabel={c.label || `Escolha de ${it.txt}`}
                          value={choicePickValue(c)}
                          options={choiceOptionsSiblingAware(c, it.choices)}
                          onChange={(v) => onChoiceChange(it.target, c, v)}
                        />
                      ) : (
                        // Fora do Alterar: pick sutil (texto + tooltip), não dropdown.
                        <ItemHover doc={refs.refDoc(choicePickValue(c))} fullBody>
                          <span
                            style={{
                              fontWeight: 600,
                              color: choicePickValue(c) ? 'var(--blue)' : 'var(--muted)',
                              fontSize: 13,
                              fontStyle: choicePickValue(c) ? 'normal' : 'italic',
                            }}
                          >
                            {linkLabel(choicePickValue(c)) || '(não definido)'}
                          </span>
                        </ItemHover>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** #297: escreve o pick de uma `Escolha_Habilidades`. Alvos PLANOS
 *  (Tecnicas/Acoes/Habilidades) gravam a linha tagueada na lista plana; alvo
 *  `Magias(.Secundaria).Lista` grava a magia no GRUPO DE ESCOLA certo (a lista é
 *  aninhada por escola), removendo o pick anterior — antes o alvo Magias caía no
 *  fallback Habilidades.Lista e trocar a magia "não fazia nada". Compartilhado
 *  pelos dois onChoiceChange (habilidade-pai e técnica-pai), idênticos. */
function writeChoicePick(
  model: ReturnType<typeof useHeroModel>,
  catalog: Catalog,
  refs: HeroRefs,
  parentTarget: string,
  choice: HabChoice,
  newWl: string,
): void {
  if (!newWl) return
  const t = (choice.targetRaw ?? '').toLowerCase()
  const newTarget = wikiTarget(newWl)
  const nn = choice.occ !== undefined ? String(choice.occ).padStart(2, '0') : null
  const source = nn ? `Escolha.${nn}.[[${parentTarget}]]` : `Escolha.[[${parentTarget}]]`
  if (t.startsWith('magias')) {
    const sec = t.startsWith('magias.secundaria') || t.startsWith('magias_secundaria')
    const path = sec ? ['Magias', 'Secundaria', 'Lista'] : ['Magias', 'Lista']
    const fmKey = sec ? 'Magias.Secundaria.Lista' : 'Magias.Lista'
    const grupos = (fmPath(model.fm, ...path) ?? []) as Array<Record<string, unknown>>
    const visited = new Map<string, VaultDoc>()
    const doc = refs.refDoc(newWl)
    if (doc) visited.set(newTarget, doc)
    const escola = escolaDestinoDaMagia(newTarget, catalog, visited, grupos)
    if (!escola) return // não resolvível → não corrompe (não ocorre p/ Arcana/Anima/Tesouros)
    const oldTarget = choice.pick ? wikiTarget(choice.pick) : null
    model.set(fmKey, placeMagiaChoicePick(grupos, oldTarget, newTarget, escola, source))
    return
  }
  // Alvo PLANO (Tecnicas/Acoes/Habilidades) — grava a linha tagueada na lista.
  const target = choiceTargetList(choice.targetRaw)
  const savedList = (fmPath(model.fm, ...target.path) ?? []) as Record<string, unknown>[]
  const esc = parentTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const thisTagRx = nn
    ? new RegExp(`^Escolha\\.${nn}\\.\\[\\[${esc}\\]\\]$`)
    : new RegExp(`^Escolha\\.\\[\\[${esc}\\]\\]$`)
  const kept = savedList.filter((row) => {
    const entriesRow = Object.entries(row)
    if (entriesRow.length !== 1) return true
    const src = entriesRow[0]![1]
    return !(typeof src === 'string' && thisTagRx.test(src))
  })
  kept.push({ [`[[${newTarget}]]`]: source })
  model.set(target.fmKey, kept)
}

/** Lista-alvo de uma `Escolha_Habilidades` a partir do `targetRaw` da rule
 *  (`Complementar Tecnicas.Lista …`) — espelho de pickListForComplementarSel
 *  do plugin (resolve-choices.ts:382-419), mas devolvendo o PATH do FM onde o
 *  pick vira estado. Default (sem targetRaw reconhecível): Habilidades. */
function choiceTargetList(targetRaw: string | undefined): { path: string[]; fmKey: string } {
  const t = (targetRaw ?? '').toLowerCase()
  if (t.startsWith('tecnicas') || t.startsWith('técnicas'))
    return { path: ['Tecnicas', 'Lista'], fmKey: 'Tecnicas.Lista' }
  if (t.startsWith('acoes') || t.startsWith('ações'))
    return { path: ['Acoes', 'Lista'], fmKey: 'Acoes.Lista' }
  if (t.startsWith('habilidades'))
    return { path: ['Habilidades', 'Lista'], fmKey: 'Habilidades.Lista' }
  // Magias vivem em Magias.Lista[].Lista (por escola) — não há um único path
  // plano; o pick por escola não é editável aqui (só complementar-sel de
  // Tecnicas/Acoes/Habilidades tem home plana). Cai em Habilidades como no
  // fallback do plugin (que também não escreve magia via este widget).
  return { path: ['Habilidades', 'Lista'], fmKey: 'Habilidades.Lista' }
}

/** Valor atual do dropdown de uma choice, no MESMO formato das options
 *  (wikilink pra complementar-sel; display cru pros demais kinds). */
function choicePickValue(c: HabChoice): string {
  if (!c.pick) return ''
  return c.kind === 'complementar-sel' ? c.pick : `[[${c.pick}]]`
}

/** Options do SelectBox: complementar-sel já vem em wikilink; prop-map e
 *  perícia-especial vêm em display, envolvidos em `[[]]` (plugin
 *  habilidades-card.ts:428). */
function choiceOptions(c: HabChoice): SelectOption[] {
  const wl = c.kind === 'complementar-sel' ? c.options : c.options.map((o) => `[[${o}]]`)
  return wl.map((o) => ({ value: o, label: linkLabel(o) }))
}

/** Options do dropdown considerando as escolhas IRMÃS (mesmo pai): remove as
 *  opções já escolhidas pelas outras ocorrências ("se pegou uma em um, no
 *  outro não pode") e abre com a opção vazia — irmã sem pick mostra vazio
 *  (o resolve não defaulta mais irmãs, resolve-choices.ts). */
function choiceOptionsSiblingAware(c: HabChoice, siblings: HabChoice[]): SelectOption[] {
  const taken = new Set(
    siblings
      .filter((s) => s.choiceKey !== c.choiceKey && s.pick)
      .map((s) => wikiTarget(String(s.pick))),
  )
  return [
    { value: '', label: '—' },
    ...choiceOptions(c).filter((o) => !taken.has(wikiTarget(o.value))),
  ]
}

export function AcoesPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
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
              <ItemHover doc={refs.refDoc(e.target)} fullBody>
                <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{e.label}</span>
              </ItemHover>
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

/** Grupo de rank de técnica → letra do slot (Tecnicas.Slots só tem A/E/M). */
const TEC_GROUP_LETTER: Record<string, 'A' | 'E' | 'M'> = { Adepta: 'A', Experiente: 'E', Mestre: 'M' }

/** Pasta-fonte das técnicas — espelho do PREFIX de listTecnicas (plugin
 *  cola/yaml-block-deps-factory.ts:255). A pasta NÃO decide elegibilidade
 *  por classe; isso é o `classe::` de cada nota (tecnicaClasses). */
const TECNICAS_PATH_PREFIX = 'Sistema/Criação de Personagem/Técnicas/'

const CLASSE_WIKILINK_RX = /\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g

/** Classes elegíveis de uma técnica, do `classe::` da nota (frontmatter senão
 *  inline) — espelho de collectClasses (plugin yaml-block-deps-factory.ts:
 *  263-279): basenames dos wikilinks numa string/array CSV; fallback texto
 *  cru. Vazio = qualquer classe. */
function tecnicaClasses(d: VaultDoc): string[] {
  const raw =
    (d.frontmatter as Record<string, unknown>)?.['classe'] ??
    (d.inlineFields as Record<string, unknown>)?.['classe']
  const s = Array.isArray(raw) ? raw.map(String).join(',') : String(raw ?? '')
  if (!s.trim()) return []
  const out: string[] = []
  CLASSE_WIKILINK_RX.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CLASSE_WIKILINK_RX.exec(s)) !== null) {
    const target = m[1]!.trim()
    out.push(target.split('/').pop() ?? target)
  }
  if (out.length === 0) {
    const txt = s.trim()
    if (txt && !txt.startsWith('[[')) out.push(txt)
  }
  return out
}

/** Linha de SLOT VAZIO — espelho de renderEmptySlot do plugin (magias-card.ts:
 *  520-525 / tecnicas-card.ts:293-301): marcador ● passivo + rótulo "Vazio"
 *  itálico apagado. Mostra quantos slots do rank ainda estão por preencher. */
function EmptySlot() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 23 }}>
      <span
        style={{
          width: 23,
          height: 23,
          borderRadius: '50%',
          border: '1px dashed color-mix(in srgb,var(--muted) 55%,transparent)',
          background: 'color-mix(in srgb,var(--muted) 12%,transparent)',
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        ●
      </span>
      <span style={{ fontStyle: 'italic', color: 'var(--muted)', fontSize: 12.5 }}>Vazio</span>
    </div>
  )
}

export function TecnicasPanel({
  doc,
  refs,
  readOnly,
}: {
  doc: VaultDoc
  refs: HeroRefs
  readOnly?: boolean
}) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  const [editState, setEdit] = useState(false)
  const edit = readOnly ? false : editState
  const entries = listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))
  // Escolha de benefício (prosa) por técnica — pick persistido no FM (#135/#148).
  const beneficios = (fmPath(model.fm, 'Tecnicas', 'Beneficios') ?? {}) as Record<string, string>
  const setBeneficio = (tecnica: string, valor: string) =>
    model.set('Tecnicas.Beneficios', { ...beneficios, [tecnica]: valor })

  const slotsFmTec = fmPath(fm, 'Tecnicas', 'Slots') as Record<string, unknown> | undefined
  const usedBy = (letter: string) =>
    entries.filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === letter).length
  const slots = slotsInfo(slotsFmTec, usedBy, ['A', 'E', 'M'])
  // Economia de slot (#74): fungível (M cobre E cobre A) como no plugin
  // (computeTecnicasDerived → computeSlotsView/canAddOne, view-model.ts:534-546).
  const slotsViewTec = computeSlotsView({
    total: { A: num(slotsFmTec?.['A']), E: num(slotsFmTec?.['E']), M: num(slotsFmTec?.['M']) },
    used: { A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })

  // Escolhas de Escolha_Habilidades cujo PAI é uma técnica (ex.: Treinamento de
  // Classe Secundária → escolher a classe) — antes só o painel de Habilidades
  // renderizava escolhas, então essa ficava órfã. Mesma lógica/handler.
  const choicesByTarget = useMemo(() => {
    const map = new Map<string, HabChoice[]>()
    for (const c of rules?.habilidadeChoices ?? []) {
      const base = c.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
      if (!base) continue
      const list = map.get(base) ?? []
      list.push({
        choiceKey: c.choiceKey,
        label: c.label,
        options: c.options,
        pick: c.pick,
        kind: c.kind,
        targetRaw: c.targetRaw,
        occ: c.occurrenceWithinParent,
      })
      map.set(base, list)
    }
    return map
  }, [rules])
  const onChoiceChange = (parentTarget: string, choice: HabChoice, newWl: string) =>
    writeChoicePick(model, catalog, refs, parentTarget, choice, newWl)

  // Técnicas aprendidas agrupadas por rank (Slot.target senão rank do doc).
  const learnedByGroup = useMemo(() => {
    const byRank = new Map<string, ListaEntry[]>()
    for (const e of entries) {
      const rank =
        (e.fonte.kind === 'Slot' && SLOT_GROUP[e.fonte.target]) || docRankGroup(refs.refDoc(e.target))
      const list = byRank.get(rank) ?? []
      list.push(e)
      byRank.set(rank, list)
    }
    return byRank
  }, [entries, refs])
  // Grupos a exibir em "Aprendidas": rank com técnica aprendida OU (em edição)
  // com slot livre — espelho do gate `slotN<=0 && !rule && !learned` do plugin
  // (tecnicas-card.ts:95).
  // Slots livres visíveis TAMBÉM no modo leitura (pedido do usuário: "mostre
  // os slots livres também no modo leitura, fica melhor pra ver o que tem pra
  // selecionar ainda") — só o Combate (readOnly) fica compacto.
  const aprGroups = RANK_GROUP_ORDER.filter((g) => {
    const letter = TEC_GROUP_LETTER[g]
    const learned = learnedByGroup.get(g)?.length ?? 0
    const slotN = letter ? num(slotsFmTec?.[letter]) : 0
    return learned > 0 || (!readOnly && slotN > 0)
  })

  // Técnicas da vault pro painel "Não Aprendidas" — espelho de listTecnicas
  // (plugin cola/yaml-block-deps-factory.ts:254-325): TODAS as notas
  // `categoria: Técnica` sob a pasta-fonte; a elegibilidade por classe vem do
  // `classe::` de CADA nota (filtro abaixo), não da pasta. O filtro por pasta
  // (Classe + Genéricas + Multidisciplinar) era heurística inventada e
  // oferecia Magia Distante (classe:: Animista/Arcanista, pasta
  // Multidisciplinar) pra Guerreiro (#216).
  const classeTarget = wikiTarget(fm['Classe'])
  const tecnicaIds = useMemo(
    () =>
      catalog.content
        .filter((e) => e.type === 'Técnica' && e.path.startsWith(TECNICAS_PATH_PREFIX))
        .map((e) => e.id),
    [catalog],
  )
  const tecnicaDocs = useDocs(edit ? tecnicaIds : [])
  const naoAprendidas = useMemo(() => {
    if (!edit || !tecnicaDocs) return []
    const learned = new Set(entries.map((e) => e.target))
    const byRank = new Map<string, { custo: string; txt: string; doc: VaultDoc }[]>()
    for (const d of tecnicaDocs.values()) {
      if (learned.has(d.basename)) continue
      // Filtro de classe pelo `classe::` da nota — espelho de
      // computeTecnicasDerived (plugin view-model.ts:527-531): vazio = todas;
      // senão precisa conter a classe atual.
      const classes = tecnicaClasses(d)
      if (classes.length > 0 && (!classeTarget || !classes.includes(classeTarget))) continue
      const rank = docRankGroup(d)
      // Só ranks com slot na ficha (plugin tecnicas-card.ts:153 pula slots[rk]<=0).
      const letter = TEC_GROUP_LETTER[rank]
      if (!letter || num(slotsFmTec?.[letter]) <= 0) continue
      const list = byRank.get(rank) ?? []
      list.push({
        custo: tecnicaCustoEmoji((d.inlineFields as Record<string, unknown>)['custo']),
        txt: d.basename,
        doc: d,
      })
      byRank.set(rank, list)
    }
    return RANK_GROUP_ORDER.filter((g) => byRank.has(g)).map((g) => ({
      rank: g,
      rows: byRank.get(g)!.sort((a, b) => a.txt.localeCompare(b.txt)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, tecnicaDocs, entries, classeTarget])

  // Aprender/remover técnica por slot (#74): grava na lista SALVA (Tecnicas.Lista);
  // o merge reaplica as concessões de regra. Espelho de addTecnica/removeTecnica.
  const onAddTecnica = (basename: string, rankGroup: string) => {
    const saved = (fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Record<string, unknown>[]
    const letter = TEC_GROUP_LETTER[rankGroup] ?? 'A'
    model.set('Tecnicas.Lista', addTecnicaToLista(saved, `[[${basename}]]`, letter))
  }
  const onRemoveTecnica = (target: string) => {
    const saved = (fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Record<string, unknown>[]
    model.set('Tecnicas.Lista', removeTecnicaFromLista(saved, target))
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <span style={{ ...monoTitle, letterSpacing: '.08em' }}>Técnicas</span>
        <span style={{ flex: 1 }} />
        {readOnly ? null : <EditToggle edit={edit} onToggle={() => setEdit((v) => !v)} />}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: edit ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)',
          gap: 14,
        }}
      >
        <div style={readOnly ? undefined : cardBox}>
          {/* Em read-only (Combate) o container "Técnicas Aprendidas" é redundante
              — o painel já se chama "Técnicas"; mostra o conteúdo direto. */}
          {readOnly ? null : (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              📖 Técnicas Aprendidas
            </div>
          )}
          {aprGroups.map((g) => {
            const rows = learnedByGroup.get(g) ?? []
            const letter = TEC_GROUP_LETTER[g]
            // Slots vazios (#75): livres = slots do rank − consumidos por Slot.<L>.
            const realEmpty =
              !readOnly && letter ? Math.max(0, num(slotsFmTec?.[letter]) - usedBy(letter)) : 0
            return (
              <div key={g} style={{ marginBottom: 12 }}>
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
                  {g}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((e) => {
                    const beneOpts = benefitChoiceOptions(refs.refDoc(e.target))
                    const bene = beneficios[e.target] ?? beneficios[e.label] ?? ''
                    const beneTxt = beneOpts.find((o) => o.nome === bene)?.texto ?? ''
                    return (
                    <div key={e.target} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        paddingLeft: 8,
                        borderLeft: `3px solid ${RANK_BORDER[g] ?? 'var(--line2)'}`,
                      }}
                    >
                      {/* − só nas slot-learned (rule-granted é readonly, plugin). */}
                      {edit && e.fonte.kind === 'Slot' ? (
                        <button
                          aria-label={`Remover ${e.label}`}
                          onClick={() => onRemoveTecnica(e.target)}
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
                      <ItemHover doc={refs.refDoc(e.target)} fullBody>
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
                      </ItemHover>
                    </div>
                    {beneOpts.length ? (
                      // Escolha de benefício (prosa) — dropdown ao Alterar, senão o
                      // pick read-only; tooltip com o texto do benefício escolhido.
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginLeft: 30,
                        }}
                      >
                        <span style={{ fontSize: 14, color: 'var(--muted)', flex: 'none', lineHeight: 1 }}>↳</span>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 9,
                            letterSpacing: '.1em',
                            color: 'var(--muted)',
                            flex: 'none',
                          }}
                        >
                          BENEFÍCIO
                        </span>
                        {edit ? (
                          <SelectBox
                            ariaLabel={`Benefício de ${e.label}`}
                            value={bene}
                            options={[
                              { value: '', label: '—' },
                              ...beneOpts.map((o) => ({ value: o.nome, label: o.nome })),
                            ]}
                            onChange={(v) => setBeneficio(e.target, v)}
                          />
                        ) : (
                          <TipHover
                            html={
                              beneTxt
                                ? `<div style="max-width:280px">${esc(beneTxt.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a))}</div>`
                                : null
                            }
                          >
                            <span
                              style={{
                                fontWeight: 600,
                                color: bene ? 'var(--blue)' : 'var(--muted)',
                                fontSize: 13,
                                fontStyle: bene ? 'normal' : 'italic',
                              }}
                            >
                              {bene || '(não definido)'}
                            </span>
                          </TipHover>
                        )}
                      </div>
                    ) : null}
                    {/* Escolha_Habilidades cujo pai é ESTA técnica (Treinamento de
                        Classe Secundária → escolher a classe) — mesmo dropdown/pick
                        do painel de Habilidades, agora sob a técnica. */}
                    {(choicesByTarget.get(e.target) ?? []).map((c) => (
                      <div
                        key={c.choiceKey}
                        style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 30 }}
                      >
                        {c.label ? (
                          <span
                            style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--muted)' }}
                          >
                            {c.label}
                          </span>
                        ) : null}
                        {edit ? (
                          <SelectBox
                            ariaLabel={c.label || `Escolha de ${e.label}`}
                            value={choicePickValue(c)}
                            options={choiceOptionsSiblingAware(c, choicesByTarget.get(e.target) ?? [])}
                            onChange={(v) => onChoiceChange(e.target, c, v)}
                          />
                        ) : (
                          <ItemHover doc={refs.refDoc(choicePickValue(c))} fullBody>
                            <span
                              style={{
                                fontWeight: 600,
                                color: choicePickValue(c) ? 'var(--blue)' : 'var(--muted)',
                                fontSize: 13,
                                fontStyle: choicePickValue(c) ? 'normal' : 'italic',
                              }}
                            >
                              {linkLabel(choicePickValue(c)) || '(não definido)'}
                            </span>
                          </ItemHover>
                        )}
                      </div>
                    ))}
                    </div>
                    )
                  })}
                  {Array.from({ length: realEmpty }, (_, i) => (
                    <EmptySlot key={`empty-${i}`} />
                  ))}
                </div>
              </div>
            )
          })}
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
                  {grp.rows.map((row) => {
                    // Gate por slot livre (#74): canAddOne fungível — sem slot,
                    // o + fica desabilitado (plugin tecnicas-card.ts:281).
                    const canAdd = canAddOne(slotsViewTec, TEC_GROUP_LETTER[grp.rank] ?? 'A')
                    return (
                    <div key={row.txt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        aria-label={`Aprender ${row.txt}`}
                        disabled={!canAdd}
                        title={canAdd ? undefined : 'Sem slot disponível'}
                        onClick={() => canAdd && onAddTecnica(row.txt, grp.rank)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: '1px solid color-mix(in srgb,#2f8f5b 55%,transparent)',
                          background: 'color-mix(in srgb,#2f8f5b 16%,transparent)',
                          color: '#4cc585',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: canAdd ? 'pointer' : 'not-allowed',
                          opacity: canAdd ? 1 : 0.4,
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
                      <ItemHover doc={row.doc} fullBody>
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
                      </ItemHover>
                    </div>
                    )
                  })}
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

function MagiasHabPanel({ doc, refs, sec }: { doc: VaultDoc; refs: HeroRefs; sec?: boolean }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'habilidades')
  const rules = useHeroRules(model.fm)
  const fm = rules?.derivedFm ?? model.fm
  // Secundária (#150): o MESMO card re-escopado — `Magias` ← `Magias.Secundaria`
  // — espelho do plugin (tab-magias.ts:104-126), que reusa magiasCard com
  // m.magias.secundaria.* e o título "Magias Secundárias". O scopedFm mantém
  // Atributos/nível na raiz (computeMagiaAtaque continua correto).
  const mfm = sec ? { ...fm, Magias: (fmPath(fm, 'Magias', 'Secundaria') ?? {}) as unknown } : fm
  const LISTA_KEY = sec ? 'Magias.Secundaria.Lista' : 'Magias.Lista'
  const savedEscolasOf = () =>
    (sec
      ? (fmPath(model.fm, 'Magias', 'Secundaria', 'Lista') ?? [])
      : (fmPath(model.fm, 'Magias', 'Lista') ?? [])) as Record<string, unknown>[]
  const [edit, setEdit] = useState(false)
  const escolasAll = (fmPath(mfm, 'Magias', 'Lista') ?? []) as EscolaFm[]
  // Painel ESQUERDO (Aprendidas): escolas com magia aprendida SEMPRE; também
  // as PROFICIENTES sem magia — pra exibir seus slots VAZIOS por rank (#75,
  // espelho do gate `hasProf` do plugin, magias-card.ts:249-252) TAMBÉM no
  // modo leitura (pedido do usuário: ver o que ainda tem pra selecionar sem
  // precisar do Alterar). Tesouros é exclusivo (não se aprende por slot), só
  // aparece quando tem tesouro.
  const escolas = escolasAll.filter((e) => {
    const learned = listaEntries(e.Lista).length > 0
    if (str(e.Nome) === 'Tesouros') return learned
    return learned || str(e.Proficiencia) !== 'N'
  })
  // Painel DIREITO (Não Aprendidas): escolas em que o herói PODE lançar
  // (proficiência ≠ N), mesmo sem magia aprendida ainda. Sem isto, uma ficha
  // NOVA com slot concedido por regra não oferecia o catálogo — os slots eram
  // computados mas o seletor nunca aparecia (issue #56). Espelha a regra do
  // plugin (magias-card.ts: renderiza a escola quando prof ≠ N). Tesouros é
  // exclusivo (não se aprende por slot), fica de fora.
  const escolasProficiente = escolasAll.filter(
    (e) => str(e.Nome) !== 'Tesouros' && str(e.Proficiencia) !== 'N',
  )
  const slotsFm = fmPath(mfm, 'Magias', 'Slots') as Record<string, unknown> | undefined

  // O design agrupa magias por SUBCATEGORIA ("Magias Arcana" — Negra+Branca
  // juntas — "Magias Anima"), não por escola (#165). Escola "Arcana Negra"/
  // "Arcana Branca" → Arcana; "Anima" → Anima.
  const escolaSubcat = (nome: string): string => (nome === 'Tesouros' ? 'Tesouros' : nome.split(' ')[0]!)
  const h2Of = (nome: string) =>
    nome === 'Tesouros' ? 'Magias de Tesouros' : `Magias ${escolaSubcat(nome)}`

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
    // #286: as magias ESSENCIAIS (pasta /Magia Arcana Essencial/) são Arcana
    // GENÉRICA — não têm escola própria na ficha, então nenhuma escola proficiente
    // casava a pasta e elas sumiam das não-aprendidas (só apareciam Negra/Branca).
    // Anexa-as à escola Arcana DESTINO (pickArcanaEspecial: Negra se proficiente,
    // senão Branca), exatamente como o roteamento das essenciais APRENDIDAS
    // (escolaDestinoDaMagia). Assim aparecem em "Magias Arcana" pra aprender.
    // #296: as Essenciais só entram no painel PRIMÁRIO quando a classe do herói
    // é Arcanista (plugin view-model.ts:617: `classeAtual !== "Arcanista" →
    // return false`). No painel SECUNDÁRIO são permitidas independente da classe
    // (Treinamento de Arcanista secundário, view-model.ts:676) — a proficiência
    // secundária já filtra. Antes entravam pra QUALQUER herói com prof Arcana:
    // o Bardo (Arcana Branca/Negra, não-Arcanista) recebia Essencial indevido.
    const temArcanaProf = escolasProficiente.some((e) => str(e.Nome).startsWith('Arcana'))
    const classeArcanista = (wikiTarget(str(fm['Classe'])).split('/').pop() ?? '') === 'Arcanista'
    if (shouldOfferEssenciais(!!sec, temArcanaProf, classeArcanista)) {
      const destino = pickArcanaEspecial(escolasAll as Array<Record<string, unknown>>)
      const essenciais = catalog.content
        .filter((e) => e.type === 'Magia' && e.id.includes('/Magia Arcana Essencial/'))
        .map((e) => e.id)
      if (essenciais.length) map.set(destino, [...(map.get(destino) ?? []), ...essenciais])
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

  // Consumo GLOBAL por rank: o orçamento Magias.Slots é único pra TODAS as
  // escolas/categorias (view-model.ts:641-648 conta todas as aprendidas).
  const usedBy = (letter: string) =>
    escolasAll
      .flatMap((e) => listaEntries(e.Lista))
      .filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === letter).length
  const slots = slotsInfo(slotsFm, usedBy, ['B', 'A', 'E', 'M'])
  // Economia SEM fungibilidade (#75/#62): cada rank com seu orçamento — espelho
  // de computeMagiaSlotsView/magiaCanAddOne (magia-slot-accounting.ts).
  const magiaSlotsView = computeMagiaSlotsView({
    total: { B: num(slotsFm?.['B']), A: num(slotsFm?.['A']), E: num(slotsFm?.['E']), M: num(slotsFm?.['M']) },
    used: { B: usedBy('B'), A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })
  /** Slots VAZIOS de um rank = livres do orçamento global (leitura + edição). */
  const emptyOfRank = (g: string): number => {
    const slot = RANK_GROUP_SLOT[g]!
    return Math.max(0, num(slotsFm?.[slot]) - usedBy(slot))
  }

  // Aprender/remover magia por slot (#62): grava na lista SALVA (o merge
  // reaplica as concessões de regra por cima). Espelho de addMagia/removeMagia
  // do plugin — `Slot.<letra>` ao aprender; − só nas slot-learned.
  const onAddMagia = (escolaNome: string, basename: string, rankGroup: string) => {
    const letter = RANK_GROUP_SLOT[rankGroup] ?? 'A'
    model.set(LISTA_KEY, addMagiaToEscola(savedEscolasOf(), escolaNome, `[[${basename}]]`, letter))
  }
  const onRemoveMagia = (escolaNome: string, target: string) => {
    model.set(LISTA_KEY, removeMagiaFromEscola(savedEscolasOf(), escolaNome, target))
  }

  // Regra do compêndio de Potência Mágica e EM (Energia Heroica) — tooltip do
  // corpo no hover do rótulo (#112).
  const emPotenciaDoc = useNamedDocs(['Potência Mágica', 'Energia Heroica'])

  // Gate de conteúdo da Secundária — espelho de hasMagiasContent do plugin
  // (tab-magias.ts:83-88): prof ≠ N, magia aprendida, slot ou EM ≥ 1; Potência
  // sozinha NÃO conta. Sem conteúdo, o card Secundária some (DEPOIS dos hooks).
  if (sec) {
    const hasContent =
      escolasAll.some((e) => str(e.Proficiencia) !== 'N' || listaEntries(e.Lista).length > 0) ||
      num(fmPath(mfm, 'Magias', 'EM')) >= 1 ||
      ['B', 'A', 'E', 'M'].some((l) => num(slotsFm?.[l]) > 0)
    if (!hasContent) return null
  }

  return (
    <>
      <div style={panel}>
        <div style={{ ...monoTitle, letterSpacing: '.08em', marginBottom: 13 }}>Recursos Mágicos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15 }}>{tokens.emojis.subcategoria.PotenciaMagica}</span>
            <ItemHover doc={emPotenciaDoc('Potência Mágica')} fullBody>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap' }}>
                Potência Mágica
              </span>
            </ItemHover>
            <span style={{ flex: 1 }} />
            {/* Fontes (elementos de regra) que somam a Potência, no NÚMERO (#145). */}
            <TipHover
              html={sourceTipHtml(
                rules?.ruleSourcesByPath[sec ? 'magias.secundaria.potencia' : 'magias.potencia'],
              )}
            >
              <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
                {num(fmPath(mfm, 'Magias', 'Potencia'))}
              </span>
            </TipHover>
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
            <ItemHover doc={emPotenciaDoc('Energia Heroica')} fullBody>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap' }}>
                EM Máximo
              </span>
            </ItemHover>
            <span style={{ flex: 1 }} />
            {/* Fontes (elementos de regra) que somam o EM Máximo, no NÚMERO (#145). */}
            <TipHover
              html={sourceTipHtml(rules?.ruleSourcesByPath[sec ? 'magias.secundaria.em' : 'magias.em'])}
            >
              <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
                {num(fmPath(mfm, 'Magias', 'EM'))}
              </span>
            </TipHover>
          </div>
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          {/* Título do card Secundária = proficienciasTitle do plugin
              ("Magias Secundárias", tab-magias.ts:123). */}
          <span style={{ ...monoTitle, letterSpacing: '.08em' }}>
            {sec ? 'Magias Secundárias' : 'Magias'}
          </span>
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
            {escolas.map((escola, escolaIdx) => {
              const nome = str(escola.Nome)
              const entries = listaEntries(escola.Lista)
              const isTesouro = nome === 'Tesouros'
              // Cabeçalho da subcategoria só quando muda (Arcana Negra + Branca
              // ficam sob um único "Magias Arcana", como no design — #165).
              const showH2 =
                escolaIdx === 0 || escolaSubcat(str(escolas[escolaIdx - 1]!.Nome)) !== escolaSubcat(nome)
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
              // Grupos: ranks com magia aprendida, mais (em edição) os ranks com
              // slot livre — pra mostrar seus slots VAZIOS (#75).
              const groupKeys = isTesouro
                ? ['']
                : RANK_GROUP_ORDER.filter((g) => byRank.has(g) || emptyOfRank(g) > 0)
              return (
                <div key={nome} style={{ marginBottom: 13 }}>
                  {showH2 ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '.05em',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                        }}
                      >
                        {h2Of(nome)}
                      </span>
                      {/* Modificador de ataque mágico da escola + prof (#143) —
                          title traz o cálculo (PB + atributo + item). */}
                      {(() => {
                        const rota = `Magia ${nome}`
                        const info = computeMagiaAtaque(mfm, rota)
                        const prof = lookupRota(mfm, rota)
                        return info ? (
                          <span
                            title={info.title}
                            style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--blue)', cursor: 'help' }}
                          >
                            {`${signed(info.total)}${prof ? ` (${prof})` : ''}`}
                          </span>
                        ) : null
                      })()}
                    </div>
                  ) : null}
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
                                // Bolinha da magia de tesouro → card do TESOURO
                                // (a fonte) no hover (#111).
                                <ItemHover doc={refs.refDoc(e.fonte.target)}>
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
                                </ItemHover>
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
                              <ItemHover doc={refs.refDoc(e.target)} fullBody>
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
                              </ItemHover>
                              
                            </div>
                          )
                        })}
                        {/* Slots VAZIOS do rank (#75) — só magias (Tesouros não usa slot). */}
                        {!isTesouro
                          ? Array.from({ length: emptyOfRank(g) }, (_, i) => (
                              <EmptySlot key={`empty-${i}`} />
                            ))
                          : null}
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
                            {byRank.get(g)!.map((d) => {
                              // Gate por slot livre (#75/#62): sem fungibilidade —
                              // magiaCanAddOne(rank). Sem slot, o + desabilita.
                              const canAdd = magiaCanAddOne(magiaSlotsView, RANK_GROUP_SLOT[g] as MagiaRank)
                              return (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  aria-label={`Aprender ${d.basename}`}
                                  disabled={!canAdd}
                                  title={canAdd ? undefined : 'Sem slot disponível'}
                                  onClick={() => canAdd && onAddMagia(nome, d.basename, g)}
                                  style={{
                                    width: 23,
                                    height: 23,
                                    borderRadius: '50%',
                                    border: '1px solid color-mix(in srgb,#2f8f5b 55%,transparent)',
                                    background: 'color-mix(in srgb,#2f8f5b 16%,transparent)',
                                    color: '#4cc585',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: canAdd ? 'pointer' : 'not-allowed',
                                    opacity: canAdd ? 1 : 0.4,
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
                                <ItemHover doc={d} fullBody>
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
                                </ItemHover>
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
  // Delta por FAMÍLIA (#201) — flags centrais de FICHA_FAMILIA: o CA não tem
  // MAGIAS (mount-interativa.ts:785 showMagias = Heroi), nem Passado/
  // Equipamentos/Ofícios/Especializações/Técnicas (tabs/ca/tab-completa.ts).
  const caps = fichaFamiliaOf(doc)
  const habTabs = HAB_TABS.filter((t) => t.id !== 'magias' || caps.magias)
  const index = Math.max(
    0,
    habTabs.findIndex((t) => t.id === tab),
  )

  return (
    // TipProvider: overlay singleton dos tooltips da aba (#21 #22 #25) —
    // espelho do popup único do plugin (breakdown-tooltip.ts:18-39).
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
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
        <TabStrip tabs={habTabs} active={tab} onSelect={setTab} pad="12px 18px" />
        <PanelTrack index={index}>
          <Col>
            <ClasseNivelPanel doc={doc} refs={refs} />
            <AtributosPanel doc={doc} />
            {/* Passado = biografia, só Heroi (plugin biografia-card.ts:20). */}
            {caps.biografia ? (
              <PassadoBox doc={doc} cols="repeat(4,minmax(0,1fr))" origem="habilidades" />
            ) : null}
            <StacksPanel doc={doc} />
            {/* Proficiências de equipamento: CA não tem o card (tab-completa
                do CA; defesa do CA = Armadura Natural, defesa.ts:58-64). */}
            {caps.equipamentos ? <EquipamentosProfPanel doc={doc} refs={refs} /> : null}
          </Col>
          <Col>
            <PericiasProfPanel doc={doc} />
            {caps.especializacoes ? <EspecializacoesPanel doc={doc} /> : null}
            {caps.oficios ? <OficiosPanel doc={doc} /> : null}
          </Col>
          <Col>
            <HabilidadesArvorePanel doc={doc} refs={refs} />
            <AcoesPanel doc={doc} refs={refs} />
            {caps.tecnicas ? <TecnicasPanel doc={doc} refs={refs} /> : null}
          </Col>
          {caps.magias ? (
            <Col>
              <MagiasHabPanel doc={doc} refs={refs} />
              {/* Card "Magias Secundárias" abaixo do principal (#150) — espelho
                  de tab-magias.ts:77-129; some sem conteúdo (gate interno). */}
              <MagiasHabPanel doc={doc} refs={refs} sec />
            </Col>
          ) : null}
        </PanelTrack>
      </div>
    </TipProvider>
  )
}
