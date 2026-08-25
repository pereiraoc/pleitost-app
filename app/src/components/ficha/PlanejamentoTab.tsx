// Aba PLANEJAMENTO da Biografia — timeline vertical nível 1..10 no formato do
// PATHBUILDER (referência visual: screenshots do mestre, 2026-08-24):
//   • bloco-base no topo (Classe/Subclasse/Sintonia/Passado — rows kicker+valor);
//   • banner "NÍVEL N" de largura cheia separando os níveis;
//   • slots NÃO preenchidos = botões destacados centrados sob o banner (some
//     quando preenche — vira row);
//   • seleções feitas e ganhos automáticos = ROWS de largura cheia
//     [kicker do tipo · valor em negrito]; TOCAR expande a descrição INLINE
//     (mesmo card do hover; clickDetalhes segue valendo nos chips);
//   • ganhos em TREE VIEW: filho identado com ↳ sob a habilidade que concedeu;
//     escalares (Vitalidade/Potência/EM) com a fonte;
//   • roadmap: qualquer nível é editável — nível ≤ atual escreve pelos
//     caminhos EXISTENTES e registra o nível em `Planejamento.gastosSlots`;
//     nível futuro só registra (plano); o sync materializa ao subir e desfaz
//     ao baixar (registro fica = restaura ao re-subir).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import { useAssetIndex } from '../../data/assets'
import {
  buildLevelTimeline,
  gastosRegistrados,
  NIVEL_MAX_PLANEJAMENTO,
  type GastoRegistrado,
  type LevelCard,
  type TimelineChoice,
} from '../../rules/level-timeline'
import {
  SelectBox,
  writeChoicePick,
  choiceOptionsSiblingAware,
  docRankGroup,
  tecnicaClasses,
  escolaCobreRank,
  TECNICAS_PATH_PREFIX,
  TEC_GROUP_LETTER,
  Losango,
  type HabChoice,
} from './HabilidadesTab'
import { rankGroupLabel, tecnicaCustoEmoji, tokens, type RankLetter, type RankStateKey } from './registry'
import { RankBtns } from './bits'
import { tecnicaRequisitosCumpridos } from '../../rules/extract'
import { rulesModelFromFm } from '../../rules/rules-model'
import { listEspecializacoesByPericia } from '../../rules/projection'
import { applyPericiaRankEdit } from '../../rules/apply-pericia-rank-edit'
import { addTecnicaToLista, removeTecnicaFromLista } from '../../rules/apply-tecnica-edit'
import { addMagiaToEscola, removeMagiaFromEscola } from '../../rules/apply-magia-edit'
import type { HeroRefs } from './useHeroRefs'
import { fmPath, wikiTarget } from './hero-model'
import { slugify } from './registry'
import { linkLabel } from '../../markdown/dataview-value'
import { ITEM_CARD_CSS, ItemHover, docImageUrl, docTier, itemCardHtml } from '../item-card'
import { linkIconForEntry } from '../../markdown/link-icon'

// Emojis por TIPO de slot — do registro supercharged (supercharged-icons.ts;
// nunca inventar): Perícia 🧠, Energia Mágica 🔷 (slots de magia), Técnica 📘,
// Especialização 🎖️, Maestria 🏆, Habilidade 📕.
const TIPO_EMOJI = {
  pericia: '🧠',
  magia: '🔷',
  tecnica: '📘',
  especialidade: '🎖️',
  maestria: '🏆',
  selecao: '📕',
} as const

const mono = (extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: 'var(--mono)',
  letterSpacing: '.08em',
  ...extra,
})
const clip = (n: number) =>
  `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, ${n}px 100%, 0 calc(100% - ${n}px))`
const kicker: CSSProperties = mono({ fontSize: 9, color: 'var(--muted)', fontWeight: 700 })

const GROUP_OF: Record<string, string> = { B: 'Básica', A: 'Adepta', E: 'Experiente', M: 'Mestre' }
type RankAEM = 'A' | 'E' | 'M'
type RankBAEM = 'B' | 'A' | 'E' | 'M'
type Row = Record<string, unknown>

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function planPicks(fm: Record<string, unknown>): Record<string, string> {
  const p = fmPath(fm, 'Planejamento', 'picks')
  return p && typeof p === 'object' ? (p as Record<string, string>) : {}
}

function toHabChoice(c: TimelineChoice): HabChoice {
  return {
    choiceKey: c.choiceKey,
    label: c.label,
    options: c.options,
    pick: c.pick,
    kind: (c.kind ?? 'complementar-sel') as HabChoice['kind'],
    targetRaw: c.targetRaw,
    occ: c.occ,
    source: c.source,
  }
}

/** Card inline do doc (mesmo HTML do hover) — a expansão do Pathbuilder. */
function DocInline({ doc }: { doc: VaultDoc }) {
  const assets = useAssetIndex()
  const t = docTier(doc)
  const html = `<div class="shc-wrap">${itemCardHtml(doc, t, docImageUrl(doc, t, assets), false, true, assets, doc.id.includes('/Classes/'))}</div>`
  return (
    <div style={{ padding: '4px 0 2px' }}>
      <style>{ITEM_CARD_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

/** Chip compacto com hover (tooltip) + clique (detalhes conforme
 *  clickDetalhes — o ItemHover cuida). Usado nos GASTOS em linha única. */
function PlanChip({ wl, refs, sufixo }: { wl: string; refs: HeroRefs; sufixo?: string }) {
  const doc = refs.refDoc(wl)
  const chip = (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--blue)',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        padding: '1px 8px',
        clipPath: clip(4),
        cursor: doc ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {linkLabel(wl) || wl}
      {sufixo ? <span style={mono({ fontSize: 8.5, color: 'var(--muted)', marginLeft: 5 })}>{sufixo}</span> : null}
    </span>
  )
  return doc ? (
    <ItemHover doc={doc} fullBody>
      {chip}
    </ItemHover>
  ) : (
    chip
  )
}

/** Row estilo Pathbuilder: [kicker do tipo] + valor em negrito; toca → expande
 *  a descrição inline; `extra` (ex.: repicker/✕) aparece na direita. */
function PbRow({
  rid,
  kickerTxt,
  valor,
  doc,
  icon,
  depth = 0,
  expanded,
  onToggle,
  right,
  children,
}: {
  rid: string
  kickerTxt: string
  valor: string
  doc?: VaultDoc | null
  /** Emoji do registro (linkIconForEntry do alvo, ou o do TIPO do slot). */
  icon?: string
  depth?: number
  expanded: boolean
  onToggle: (rid: string) => void
  right?: ReactNode
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: depth * 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'var(--card)',
          border: '1px solid var(--line)',
          clipPath: clip(7),
          padding: '7px 12px',
        }}
      >
        {depth > 0 ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>↳</span> : null}
        {icon ? <span style={{ fontSize: 15, flex: 'none' }}>{icon}</span> : null}
        <button
          onClick={() => onToggle(rid)}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: 'flex-start',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <span style={kicker}>{kickerTxt.toUpperCase()}</span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {valor || '(não definido)'}
          </span>
        </button>
        {right}
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded ? (
        <div
          style={{
            border: '1px solid var(--line)',
            borderTop: 'none',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {children}
          {doc ? <DocInline doc={doc} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Overlay modal dos editores por nível (Incrementos de Perícia / Magias) —
 *  dentro: o MESMO painel do wizard de criação (PericiasProfPanel /
 *  MagiasHabPanel). */
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  // PORTAL no body: o painel vive dentro do PanelTrack (transform) — um
  // position:fixed ali vira relativo ao track e é CLIPADO pelos clip-path
  // (no browser o popup nunca aparecia; jsdom não tem layout e passava).
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4vh 12px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
          width: 'min(920px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={mono({ fontSize: 11, fontWeight: 700, color: 'var(--accent)' })}>{titulo}</span>
          <span style={{ flex: 1 }} />
          <button
            aria-label="Fechar editor"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Botão-slot pendente (os "gears" do Pathbuilder): destaque centrado sob o
 *  banner do nível — some quando o slot é preenchido. */
function SlotButton({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={mono({
        fontSize: 10,
        fontWeight: 700,
        padding: '9px 14px',
        cursor: 'pointer',
        background: ativo
          ? 'color-mix(in srgb,var(--accent) 20%,transparent)'
          : 'color-mix(in srgb,var(--accent) 8%,var(--card))',
        border: '1px solid color-mix(in srgb,var(--accent) 55%,var(--line2))',
        color: 'var(--accent)',
        clipPath: clip(8),
      })}
    >
      {children}
    </button>
  )
}

export function PlanejamentoPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'planejamento')
  const fm = model.fm
  const rules = useHeroRules(fm)
  const dfm = rules?.derivedFm ?? fm
  const nivelAtual = Math.max(1, Math.min(NIVEL_MAX_PLANEJAMENTO, num(fm['Nível'] ?? fm['Nivel']) || 1))
  const [cards, setCards] = useState<LevelCard[] | null>(null)
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set())
  const [pickerAberto, setPickerAberto] = useState<string | null>(null)
  // Popup por nível (Incrementos de Perícia / Magias) — editor ESCOPADO: só
  // os slots DAQUELE nível são editáveis; o passado aparece como contexto
  // travado (report 2026-08-25).
  const [popup, setPopup] = useState<{ nivel: number; tipo: 'pericia' | 'magia' } | null>(null)
  const fmSig = useMemo(() => JSON.stringify(fm), [fm])
  const buildSeq = useRef(0)

  useEffect(() => {
    const seq = ++buildSeq.current
    let vivo = true
    void buildLevelTimeline(fm, catalog, loadDoc).then((c) => {
      if (vivo && buildSeq.current === seq) setCards(c)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmSig, catalog])

  const toggleRow = (rid: string) =>
    setExpandidos((s) => {
      const n = new Set(s)
      if (n.has(rid)) n.delete(rid)
      else n.add(rid)
      return n
    })
  const togglePicker = (pid: string) => setPickerAberto((p) => (p === pid ? null : pid))

  // ── catálogos pros pickers ────────────────────────────────────────────────
  const classeTarget = wikiTarget(String(fm['Classe'] ?? ''))
  const tecnicaIds = useMemo(
    () =>
      catalog.content
        .filter((e) => e.type === 'Técnica' && e.path.startsWith(TECNICAS_PATH_PREFIX))
        .map((e) => e.id),
    [catalog],
  )
  const tecnicaDocs = useDocs(tecnicaIds)
  const reqModel = useMemo(() => rulesModelFromFm(dfm), [dfm])
  const tecnicasAprendidas = useMemo(
    () =>
      new Set(
        ((fmPath(dfm, 'Tecnicas', 'Lista') ?? []) as Row[])
          .flatMap((r) => Object.keys(r))
          .map((k) => wikiTarget(k)),
      ),
    [dfm],
  )
  const tecnicasElegiveis = useMemo(() => {
    const byRank = new Map<RankAEM, string[]>()
    if (!tecnicaDocs) return byRank
    for (const d of tecnicaDocs.values()) {
      if (tecnicasAprendidas.has(d.basename)) continue
      const classes = tecnicaClasses(d)
      if (classes.length > 0 && (!classeTarget || !classes.includes(classeTarget))) continue
      if (!tecnicaRequisitosCumpridos(reqModel, d)) continue
      const letter = TEC_GROUP_LETTER[docRankGroup(d)]
      if (!letter) continue
      byRank.set(letter, [...(byRank.get(letter) ?? []), `[[${d.basename}]]`].sort())
    }
    return byRank
  }, [tecnicaDocs, tecnicasAprendidas, classeTarget, reqModel])

  // Magias: escolas proficientes (primária) + spells da pasta da escola.
  // (Essenciais seguem aprendíveis na aba Habilidades — fora deste picker.)
  const escolasProf = useMemo(
    () =>
      ((fmPath(dfm, 'Magias', 'Lista') ?? []) as Row[]).filter(
        (e) => String(e.Proficiencia ?? 'N') !== 'N' && String(e.Nome) !== 'Tesouros',
      ),
    [dfm],
  )
  const spellIds = useMemo(
    () =>
      catalog.content
        .filter((e) => e.type === 'Magia' && escolasProf.some((esc) => e.id.includes(`/Magia ${String(esc.Nome)}/`)))
        .map((e) => e.id),
    [catalog, escolasProf],
  )
  const spellDocs = useDocs(spellIds)
  const magiasAprendidas = useMemo(() => {
    const out = new Set<string>()
    for (const esc of (fmPath(dfm, 'Magias', 'Lista') ?? []) as Row[]) {
      for (const e of (Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : []).flatMap((r) => Object.keys(r)))
        out.add(wikiTarget(e))
    }
    return out
  }, [dfm])
  const espMaes = useMemo(() => listEspecializacoesByPericia(catalog), [catalog])

  // ── registros (nível explícito dos gastos) ────────────────────────────────
  const registros = gastosRegistrados(fm)
  const setRegistros = (next: GastoRegistrado[]) => model.set('Planejamento.gastosSlots', next)
  const registrar = (r: GastoRegistrado) =>
    setRegistros([
      ...registros.filter((x) => !(x.tipo === r.tipo && wikiTarget(x.alvo) === wikiTarget(r.alvo))),
      r,
    ])
  const desregistrar = (tipo: GastoRegistrado['tipo'], alvo: string) =>
    setRegistros(registros.filter((x) => !(x.tipo === tipo && wikiTarget(x.alvo) === wikiTarget(alvo))))

  // ── aplicadores (caminhos existentes) ─────────────────────────────────────
  const savedPericias = () => (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as Row[]
  const derivedIncsDe = (nome: string): Row[] => {
    const row = ((fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]).find((r) => String(r.Nome) === nome)
    return (row?.Incrementos ?? []) as Row[]
  }
  const aplicaPericia = (nome: string, rank: RankAEM) =>
    model.set('Pericias.Lista', applyPericiaRankEdit(savedPericias(), derivedIncsDe(nome), nome, rank))
  const desfazPericia = (nome: string, rank: RankAEM) => {
    const abaixo: Record<RankAEM, 'N' | 'A' | 'E'> = { A: 'N', E: 'A', M: 'E' }
    model.set('Pericias.Lista', applyPericiaRankEdit(savedPericias(), derivedIncsDe(nome), nome, abaixo[rank]))
  }
  const aplicaTecnica = (alvo: string, rank: RankAEM) =>
    model.set('Tecnicas.Lista', addTecnicaToLista((fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Row[], alvo, rank))
  const desfazTecnica = (alvo: string) =>
    model.set('Tecnicas.Lista', removeTecnicaFromLista((fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Row[], alvo))
  const aplicaMagia = (escola: string, alvo: string, rank: RankBAEM) =>
    model.set('Magias.Lista', addMagiaToEscola((fmPath(model.fm, 'Magias', 'Lista') ?? []) as Row[], escola, alvo, rank))
  const desfazMagia = (escola: string, alvo: string) =>
    model.set('Magias.Lista', removeMagiaFromEscola((fmPath(model.fm, 'Magias', 'Lista') ?? []) as Row[], escola, alvo))
  const aplicaEspecialidade = (pericia: string, campo: 'Especializacao' | 'Maestria', alvo: string) => {
    const rows = savedPericias().map((r) => ({ ...r }))
    let row = rows.find((r) => String(r.Nome) === pericia)
    if (!row) {
      row = { Nome: pericia, Atributo: '', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] }
      rows.push(row)
    }
    row[campo] = alvo
    model.set('Pericias.Lista', rows)
  }

  const abrePopup = (nivel: number, tipo: 'pericia' | 'magia') => setPopup({ nivel, tipo })

  // ── sync plano ⇄ real quando o nível muda (roadmap do Pathbuilder) ────────
  useEffect(() => {
    if (!cards) return
    const plano = planPicks(fm)
    let planoNovo: Record<string, string> | null = null
    for (const card of cards) {
      for (const c of card.escolhas) {
        if (c.isSubclass) continue
        if (c.gateLevel <= nivelAtual) {
          const planejado = plano[c.choiceKey]
          if (!c.pick && planejado && c.options.some((o) => wikiTarget(o) === wikiTarget(planejado))) {
            writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), planejado)
            planoNovo = planoNovo ?? { ...plano }
            delete planoNovo[c.choiceKey]
          }
        } else if (c.pick && plano[c.choiceKey] !== c.pick) {
          planoNovo = planoNovo ?? { ...plano }
          planoNovo[c.choiceKey] = c.pick
        }
      }
    }
    if (planoNovo) model.set('Planejamento.picks', planoNovo)

    for (const r of registros) {
      const alvoBase = wikiTarget(r.alvo)
      if (r.tipo === 'tecnica') {
        const tem = tecnicasAprendidas.has(alvoBase)
        if (r.nivel <= nivelAtual && !tem && r.rank && r.rank !== 'B') aplicaTecnica(r.alvo, r.rank)
        if (r.nivel > nivelAtual && tem) desfazTecnica(r.alvo)
      } else if (r.tipo === 'magia' && r.contexto) {
        const tem = magiasAprendidas.has(alvoBase)
        if (r.nivel <= nivelAtual && !tem && r.rank) aplicaMagia(r.contexto, r.alvo, r.rank)
        if (r.nivel > nivelAtual && tem) desfazMagia(r.contexto, r.alvo)
      } else if (r.tipo === 'pericia' && r.rank && r.rank !== 'B') {
        const row = ((fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]).find((x) => String(x.Nome) === r.alvo)
        const incs = (row?.Incrementos ?? []) as Row[]
        const tem = incs.some((i) => typeof i[r.rank!] === 'string' && String(i[r.rank!]).startsWith('Slot'))
        if (r.nivel <= nivelAtual && !tem) aplicaPericia(r.alvo, r.rank)
        if (r.nivel > nivelAtual && tem) desfazPericia(r.alvo, r.rank)
      } else if ((r.tipo === 'especialidade' || r.tipo === 'maestria') && r.contexto) {
        const campo = r.tipo === 'especialidade' ? 'Especializacao' : 'Maestria'
        const row = ((fmPath(fm, 'Pericias', 'Lista') ?? []) as Row[]).find((x) => String(x.Nome) === r.contexto)
        const tem = String(row?.[campo] ?? '').trim() !== ''
        if (r.nivel <= nivelAtual && !tem) aplicaEspecialidade(r.contexto, campo, r.alvo)
        if (r.nivel > nivelAtual && tem) aplicaEspecialidade(r.contexto, campo, '')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, nivelAtual])

  if (!cards) {
    return <div style={mono({ fontSize: 11, color: 'var(--muted)', padding: '18px 4px' })}>Projetando níveis…</div>
  }

  const plano = planPicks(fm)
  const registraEAplica = (r: GastoRegistrado, aplica: () => void) => {
    registrar(r)
    if (r.nivel <= nivelAtual) aplica()
    setPickerAberto(null)
  }
  // ── bloco-base (topo, estilo Ancestry/Background/Class do Pathbuilder) ────
  const subclasseRow = cards[0]!.escolhas.find((c) => c.isSubclass)
  const passadoPericia = (() => {
    for (const row of (fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]) {
      const incs = (row.Incrementos ?? []) as Row[]
      if (incs.some((i) => Object.values(i).some((v) => String(v).startsWith('Passado')))) return String(row.Nome)
    }
    return null
  })()
  const baseRows: Array<{ rid: string; kicker: string; valor: string; doc?: VaultDoc | null }> = [
    { rid: 'base|classe', kicker: 'Classe', valor: linkLabel(String(fm['Classe'] ?? '')), doc: refs.refDoc(String(fm['Classe'] ?? '')) },
    ...(subclasseRow
      ? [
          {
            rid: 'base|subclasse',
            kicker: `Subclasse · ${subclasseRow.sourceNote}`,
            valor: linkLabel(subclasseRow.pick ?? '') || '(não definida)',
            doc: subclasseRow.pick ? refs.refDoc(subclasseRow.pick) : null,
          },
        ]
      : []),
    ...(fm['Sintonia']
      ? [
          {
            rid: 'base|sintonia',
            kicker: 'Sintonia',
            valor: linkLabel(String(fm['Sintonia'])),
            doc: refs.refDoc(String(fm['Sintonia'])),
          },
        ]
      : []),
    ...(fm['Passado']
      ? [
          {
            rid: 'base|passado',
            kicker: `Passado${passadoPericia ? ` · perícia ${passadoPericia}` : ''}`,
            valor: linkLabel(String(fm['Passado'])),
            doc: refs.refDoc(String(fm['Passado'])),
          },
        ]
      : []),
  ]

  // ── pendências/preenchidos por nível ──────────────────────────────────────
  interface SlotPend {
    pid: string
    label: string
    icon: string
    /** Editor inline — ou popup (onOpen) pros painéis do wizard. */
    picker?: ReactNode
    onOpen?: () => void
    /** Tudo preenchido → botão persiste com ✓ sutil (report 2026-08-25). */
    done?: boolean
    /** Notas que CONCEDERAM os slots (rastreabilidade — linha discreta acima). */
    fontes?: string[]
  }

  /** ➕ circular verde — verbatim do estilo das competências
   *  (HabilidadesTab não-aprendidas). */
  const addCirc = (aria: string, enabled: boolean, onClick: () => void, size = 24) => (
    <button
      aria-label={aria}
      disabled={!enabled}
      title={enabled ? undefined : 'Sem slot disponível neste nível'}
      onClick={() => enabled && onClick()}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid color-mix(in srgb,#2f8f5b 55%,transparent)',
        background: 'color-mix(in srgb,#2f8f5b 16%,transparent)',
        color: '#4cc585',
        fontSize: 15,
        fontWeight: 700,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.4,
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
  )
  const remCirc = (aria: string, onClick: () => void) => (
    <button
      aria-label={aria}
      onClick={onClick}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, flex: 'none' }}
    >
      ✕
    </button>
  )
  const grupoLabel: CSSProperties = { fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 8 }

  /** Editor de TÉCNICAS escopado — mesmas linhas das "Técnicas Não Aprendidas"
   *  das competências (➕ verde, custo, emoji da categoria, nome com hover). */
  const editorTecnicasNivel = (card: LevelCard) => {
    const livresDe = (r: 'A' | 'E' | 'M') =>
      card.slots.tecnicas[r] - card.gastos.tecnicas.filter((g) => g.rank === r).length
    const ranks = (['A', 'E', 'M'] as const).filter((r) => card.slots.tecnicas[r] > 0)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {card.gastos.tecnicas.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {card.gastos.tecnicas.map((g) => {
              const d = refs.refDoc(g.link)
              return (
                <div key={g.link} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {remCirc(`Remover ${linkLabel(g.link)}`, () => {
                    if (!g.planejado) desfazTecnica(g.link)
                    desregistrar('tecnica', g.link)
                  })}
                  <span style={{ fontSize: 13, flex: 'none' }}>{tokens.emojis.categoria.Tecnica}</span>
                  <ItemHover doc={d ?? undefined} fullBody>
                    <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {linkLabel(g.link)}
                    </span>
                  </ItemHover>
                  <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>
                    {g.rank}
                    {g.planejado ? ' · plano' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
        {ranks.map((rank) => {
          const linhas = (tecnicasElegiveis.get(rank) ?? []).map((wl) => {
            const d = refs.refDoc(wl) ?? (tecnicaDocs ? [...tecnicaDocs.values()].find((x) => x.basename === wikiTarget(wl)) : undefined)
            const custo = d ? tecnicaCustoEmoji((d.inlineFields as Record<string, unknown>)['custo']) : ''
            return { wl, d, custo }
          })
          if (!linhas.length) return null
          const podeAdd = livresDe(rank) > 0
          return (
            <div key={rank}>
              <div style={grupoLabel}>{GROUP_OF[rank]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {linhas.map(({ wl, d, custo }) => (
                  <div key={wl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {addCirc(`Aprender ${linkLabel(wl)}`, podeAdd, () =>
                      registraEAplica({ nivel: card.nivel, tipo: 'tecnica', rank, alvo: wl }, () =>
                        aplicaTecnica(wl, rank),
                      ),
                    )}
                    <span style={{ fontSize: 12, flex: 'none', width: 17, textAlign: 'center' }}>{custo}</span>
                    <span style={{ fontSize: 13, flex: 'none' }}>{tokens.emojis.categoria.Tecnica}</span>
                    <ItemHover doc={d ?? undefined} fullBody>
                      <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {linkLabel(wl)}
                      </span>
                    </ItemHover>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  /** Editor de ESPEC/MAESTRIAS escopado — a MESMA seleção radial das
   *  competências (Losango + radio-toggle + emoji + nome com hover). */
  const editorEspecNivel = (
    card: LevelCard,
    oportunidades: Array<{ nome: string; rank: 'E' | 'M'; opts: string[] }>,
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {card.gastos.especialidades.map((f) => (
        <div key={`${f.pericia}|${f.alvo}`}>
          <div style={grupoLabel}>
            {f.pericia} ({f.tipo === 'especialidade' ? 'E' : 'M'})
          </div>
          <div style={{ ['--on' as string]: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
            <Losango />
            <button
              onClick={() => {
                if (!f.planejado)
                  aplicaEspecialidade(f.pericia, f.tipo === 'especialidade' ? 'Especializacao' : 'Maestria', '')
                desregistrar(f.tipo, f.alvo)
              }}
              aria-label={`${f.pericia}: ${linkLabel(f.alvo)}`}
              aria-pressed
              style={{
                width: 15,
                height: 15,
                borderRadius: '50%',
                border: '2px solid color-mix(in srgb,var(--red) 100%,var(--line2))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                cursor: 'pointer',
                background: 'transparent',
                padding: 0,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
            </button>
            <span style={{ fontSize: 13, flex: 'none' }}>
              {f.tipo === 'especialidade' ? TIPO_EMOJI.especialidade : TIPO_EMOJI.maestria}
            </span>
            <ItemHover doc={refs.refDoc(f.alvo) ?? undefined} fullBody>
              <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{linkLabel(f.alvo)}</span>
            </ItemHover>
            {f.planejado ? <span style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>plano</span> : null}
          </div>
        </div>
      ))}
      {oportunidades.map((o) => (
        <div key={`${o.nome}|${o.rank}`}>
          <div style={grupoLabel}>
            {o.nome} ({o.rank})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {o.opts.map((wl) => (
              <div key={wl} style={{ ['--on' as string]: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                <Losango />
                <button
                  onClick={() =>
                    registraEAplica(
                      {
                        nivel: card.nivel,
                        tipo: o.rank === 'E' ? 'especialidade' : 'maestria',
                        alvo: wl,
                        contexto: o.nome,
                      },
                      () => aplicaEspecialidade(o.nome, o.rank === 'E' ? 'Especializacao' : 'Maestria', wl),
                    )
                  }
                  aria-label={`${o.nome}: ${linkLabel(wl)}`}
                  aria-pressed={false}
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: '50%',
                    border: '2px solid color-mix(in srgb,var(--red) 40%,var(--line2))',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                    cursor: 'pointer',
                    background: 'transparent',
                    padding: 0,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'transparent' }} />
                </button>
                <span style={{ fontSize: 13, flex: 'none' }}>
                  {o.rank === 'E' ? TIPO_EMOJI.especialidade : TIPO_EMOJI.maestria}
                </span>
                <ItemHover doc={refs.refDoc(wl) ?? undefined} fullBody>
                  <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>{linkLabel(wl)}</span>
                </ItemHover>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  /** Editor de PERÍCIAS escopado no nível — a MESMA grade das competências/
   *  wizard (RankBtns N/A/E/M): passado travado (contexto), clicável só a
   *  transição coberta por slot livre DESTE nível; clicar no rank gasto aqui
   *  desfaz. */
  const editorPericiasNivel = (card: LevelCard) => {
    const LETRAS: RankLetter[] = ['N', 'A', 'E', 'M']
    const RANK_N: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
    const livresDe = (r: 'A' | 'E' | 'M') =>
      card.slots.pericias[r] - card.gastos.pericias.filter((g) => g.rank === r && g.fonte === 'Slot').length
    const nomes = Object.keys(card.periciasEntrando).sort((a, b) => a.localeCompare(b))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>
          {(['A', 'E', 'M'] as const)
            .filter((r) => card.slots.pericias[r] > 0)
            .map((r) => `${r}: ${Math.max(0, livresDe(r))}/${card.slots.pericias[r]} livres`)
            .join(' · ')}
        </div>
        {nomes.map((nome) => {
          const entrando = card.periciasEntrando[nome]!
          const gastoAqui = card.gastos.pericias.find((g) => g.nome === nome && g.fonte === 'Slot')
          const atual = gastoAqui ? gastoAqui.rank : entrando
          const proximo = LETRAS[RANK_N[atual]! + 1]
          const podeSubir =
            !gastoAqui && proximo && proximo !== 'N' && livresDe(proximo as 'A' | 'E' | 'M') > 0
          const states = {} as Record<RankLetter, RankStateKey>
          for (const l of LETRAS) {
            const i = RANK_N[l]!
            if (i < RANK_N[atual]!) states[l] = l === 'N' ? 'passN' : 'selSlot'
            else if (i === RANK_N[atual]!) states[l] = l === 'N' ? 'selN' : gastoAqui ? 'sel' : 'selSlot'
            else states[l] = 'off'
          }
          const clicaveis = new Set<RankLetter>()
          if (gastoAqui) clicaveis.add(gastoAqui.rank)
          if (podeSubir) clicaveis.add(proximo!)
          return (
            <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nome}
                {gastoAqui?.planejado ? (
                  <span style={mono({ fontSize: 8.5, color: 'var(--muted)', marginLeft: 6 })}>plano</span>
                ) : null}
              </span>
              <RankBtns
                states={states}
                disabledRanks={LETRAS.filter((l) => !clicaveis.has(l))}
                onPick={(letter) => {
                  if (gastoAqui && letter === gastoAqui.rank) {
                    if (!gastoAqui.planejado) desfazPericia(nome, gastoAqui.rank)
                    desregistrar('pericia', nome)
                    return
                  }
                  if (letter === proximo && podeSubir) {
                    const rank = letter as 'A' | 'E' | 'M'
                    registraEAplica({ nivel: card.nivel, tipo: 'pericia', rank, alvo: nome }, () =>
                      aplicaPericia(nome, rank),
                    )
                  }
                }}
              />
            </div>
          )
        })}
      </div>
    )
  }

  /** Magias conhecidas ANTES do nível (contexto) — gastos e concessões dos
   *  cards anteriores. */
  const magiasConhecidasAntes = (nivel: number): Set<string> => {
    const out = new Set<string>()
    for (const c of cards ?? []) {
      if (c.nivel >= nivel) break
      for (const g of c.gastos.magias) out.add(wikiTarget(g.link))
      for (const m of c.magiasRegra) out.add(wikiTarget(m.link))
    }
    return out
  }

  /** Editor de MAGIAS escopado no nível — mesmo estilo das listas de magia
   *  das competências (linhas com hover; aprender por linha), por escola,
   *  limitado aos slots DESTE nível. */
  const editorMagiasNivel = (card: LevelCard) => {
    const livresDe = (r: 'B' | 'A' | 'E' | 'M') =>
      card.slots.magias[r] - card.gastos.magias.filter((g) => g.rank === r && !g.secundaria).length
    const ranksComSlot = (['B', 'A', 'E', 'M'] as const).filter((r) => card.slots.magias[r] > 0)
    const conhecidas = magiasConhecidasAntes(card.nivel + 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>
          {ranksComSlot.map((r) => `${r}: ${Math.max(0, livresDe(r))}/${card.slots.magias[r]} livres`).join(' · ')}
        </div>
        {card.gastos.magias.filter((g) => !g.secundaria).length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={kicker}>APRENDIDAS NESTE NÍVEL</span>
            {card.gastos.magias
              .filter((g) => !g.secundaria)
              .map((g) => (
                <div key={g.link} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <PlanChip
                    wl={g.link}
                    refs={refs}
                    sufixo={`${g.rank} · ${g.escola}${g.planejado ? ' · plano' : ''}`}
                  />
                  <button
                    aria-label={`Remover ${linkLabel(g.link)}`}
                    onClick={() => {
                      if (!g.planejado) desfazMagia(g.escola, g.link)
                      desregistrar('magia', g.link)
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        ) : null}
        {card.escolasProfNivel.map((esc) => {
          const linhas: ReactNode[] = []
          if (spellDocs) {
            for (const rank of ranksComSlot) {
              if (livresDe(rank) <= 0) continue
              const grupo = GROUP_OF[rank]!
              if (!escolaCobreRank(esc.prof, grupo)) continue
              for (const d of [...spellDocs.values()].sort((a, b) => a.basename.localeCompare(b.basename))) {
                if (!d.id.includes(`/Magia ${esc.nome}/`)) continue
                if (conhecidas.has(d.basename)) continue
                if (rankGroupLabel(String(d.frontmatter['rank'] ?? '')) !== grupo) continue
                linhas.push(
                  <div key={`${d.basename}|${rank}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {addCirc(
                      `Aprender ${d.basename}`,
                      true,
                      () =>
                        registraEAplica(
                          { nivel: card.nivel, tipo: 'magia', rank, alvo: `[[${d.basename}]]`, contexto: esc.nome },
                          () => aplicaMagia(esc.nome, `[[${d.basename}]]`, rank),
                        ),
                      23,
                    )}
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
                        flex: 'none',
                      }}
                    >
                      {rank}
                    </span>
                    <ItemHover doc={d} fullBody>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--blue)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.basename}
                      </span>
                    </ItemHover>
                  </div>,
                )
              }
            }
          }
          if (!linhas.length) return null
          return (
            <div key={esc.nome} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={kicker}>{esc.nome.toUpperCase()}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{linhas}</div>
            </div>
          )
        })}
      </div>
    )
  }

  const pendenciasDe = (card: LevelCard): SlotPend[] => {
    const out: SlotPend[] = []
    // Perícias: botão SEMPRE clicável — ≤ atual abre o POPUP do wizard;
    // futuro expande o editor de plano (gastos deste nível + pickers).
    const perTot = (['A', 'E', 'M'] as const).filter((r) => card.slots.pericias[r] > 0)
    if (perTot.length) {
      const livresDe = (r: 'A' | 'E' | 'M') =>
        card.slots.pericias[r] - card.gastos.pericias.filter((g) => g.rank === r && g.fonte === 'Slot').length
      const pendentes = perTot.reduce((n, r) => n + Math.max(0, livresDe(r)), 0)
      out.push({
        pid: `${card.nivel}|per`,
        label: `INCREMENTOS DE PERÍCIA (${perTot.map((r) => `${r}×${card.slots.pericias[r]}`).join(' ')})`,
        icon: TIPO_EMOJI.pericia,
        done: pendentes === 0,
        ...(card.nivel <= nivelAtual
          ? { onOpen: () => abrePopup(card.nivel, 'pericia') }
          : { picker: editorPericiasNivel(card) }),
      })
    }

    // Técnicas: botão sempre clicável — editor com os gastos (remover) + pickers.
    const tecTot = (['A', 'E', 'M'] as const).filter((r) => card.slots.tecnicas[r] > 0)
    if (tecTot.length || card.gastos.tecnicas.length) {
      const livresDe = (r: 'A' | 'E' | 'M') =>
        card.slots.tecnicas[r] - card.gastos.tecnicas.filter((g) => g.rank === r).length
      const pendentes = tecTot.reduce((n, r) => n + Math.max(0, livresDe(r)), 0)
      out.push({
        pid: `${card.nivel}|tec`,
        label: tecTot.length
          ? `TÉCNICAS (${tecTot.map((r) => `${r}×${card.slots.tecnicas[r]}`).join(' ')})`
          : 'TÉCNICAS',
        icon: TIPO_EMOJI.tecnica,
        done: pendentes === 0,
        picker: editorTecnicasNivel(card),
      })
    }

    // Magias: ≤ atual abre o painel do wizard; futuro editor de plano.
    const magTot = (['B', 'A', 'E', 'M'] as const).filter((r) => card.slots.magias[r] > 0)
    if (magTot.length || card.gastos.magias.length) {
      const livresDe = (r: 'B' | 'A' | 'E' | 'M') =>
        card.slots.magias[r] - card.gastos.magias.filter((g) => g.rank === r && !g.secundaria).length
      const pendentes = magTot.reduce((n, r) => n + Math.max(0, livresDe(r)), 0)
      out.push({
        pid: `${card.nivel}|mag`,
        label: magTot.length
          ? `MAGIAS (${magTot.map((r) => `${r}×${card.slots.magias[r]}`).join(' ')})`
          : 'MAGIAS',
        icon: TIPO_EMOJI.magia,
        done: pendentes === 0,
        ...(card.nivel <= nivelAtual
          ? { onOpen: () => abrePopup(card.nivel, 'magia') }
          : { picker: editorMagiasNivel(card) }),
      })
    }

    // Especialidades/Maestrias: botão sempre clicável (feitas com remover +
    // oportunidades pendentes).
    const oportunidades: Array<{ nome: string; rank: 'E' | 'M'; opts: string[] }> = []
    for (const g of card.gastos.pericias) {
      if (g.rank !== 'E' && g.rank !== 'M') continue
      const row = ((fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]).find((r) => String(r.Nome) === g.nome)
      const campo = g.rank === 'E' ? 'Especializacao' : 'Maestria'
      if (String(row?.[campo] ?? '').trim()) continue
      const opts =
        g.rank === 'E'
          ? (espMaes.especializacoes[g.nome] ?? [])
          : (() => {
              const esp = String(row?.Especializacao ?? '')
              return esp ? (espMaes.maestriasByEspecialidade[slugify(wikiTarget(esp))] ?? []) : []
            })()
      if (opts.length) oportunidades.push({ nome: g.nome, rank: g.rank, opts })
    }
    if (oportunidades.length || card.gastos.especialidades.length) {
      out.push({
        pid: `${card.nivel}|esp`,
        label: `ESPEC/MAESTRIAS (${card.gastos.especialidades.length + oportunidades.length})`,
        icon: TIPO_EMOJI.especialidade,
        done: oportunidades.length === 0,
        picker: editorEspecNivel(card, oportunidades),
      })
    }

    // Seleções de habilidade: botão sempre clicável (feitas com re-picker +
    // pendentes).
    const escolhasNormais = card.escolhas.filter((c) => !c.isSubclass)
    if (escolhasNormais.length) {
      const valorDe = (c: TimelineChoice) =>
        c.gateLevel <= nivelAtual ? c.pick : (plano[c.choiceKey] ?? null)
      const pendentesSel = escolhasNormais.filter((c) => !valorDe(c))
      out.push({
        pid: `${card.nivel}|sel`,
        label: `SELEÇÕES (${escolhasNormais.length})`,
        icon: TIPO_EMOJI.selecao,
        done: pendentesSel.length === 0,
        picker: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {escolhasNormais.map((c) => {
              const desbloqueada = c.gateLevel <= nivelAtual
              return (
                <div key={c.choiceKey}>
                  <span style={kicker}>
                    {(c.label || 'SELEÇÃO').toUpperCase()} · {c.sourceNote}
                    {desbloqueada ? '' : ' · PLANO'}
                  </span>
                  <SelectBox
                    ariaLabel={`${c.label || 'Escolha'} (nível ${c.gateLevel})`}
                    value={valorDe(c) ?? ''}
                    options={choiceOptionsSiblingAware(toHabChoice(c), [], fm, c.sourceNote)}
                    onChange={(v) => {
                      if (!v) return
                      if (desbloqueada) writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
                      else model.set('Planejamento.picks', { ...planPicks(model.fm), [c.choiceKey]: v })
                    }}
                  />
                </div>
              )
            })}
          </div>
        ),
      })
    }
    return out
  }

  // Rows das ESCOLHAS preenchidas (expansão mostra a descrição + re-picker).
  // Gastos de slot NÃO são rows — viram a linha de chips do card (edição pelo
  // botão do tipo, report 2026-08-25).
  const rowsPreenchidas = (card: LevelCard): ReactNode[] => {
    const out: ReactNode[] = []
    for (const c of card.escolhas) {
      if (c.isSubclass) continue
      const desbloqueada = c.gateLevel <= nivelAtual
      const valor = desbloqueada ? c.pick : (plano[c.choiceKey] ?? null)
      if (!valor) continue
      const rid = `sel|${c.choiceKey}`
      out.push(
        <PbRow
          key={rid}
          rid={rid}
          kickerTxt={`${c.label || 'Seleção'} · ${c.sourceNote}${desbloqueada ? '' : ' · plano'}`}
          valor={linkLabel(valor)}
          doc={refs.refDoc(valor)}
          icon={linkIconForEntry(refs.refDoc(valor) ?? undefined) || TIPO_EMOJI.selecao}
          expanded={expandidos.has(rid)}
          onToggle={toggleRow}
        >
          <SelectBox
            ariaLabel={`${c.label || 'Escolha'} (nível ${c.gateLevel})`}
            value={valor}
            options={choiceOptionsSiblingAware(toHabChoice(c), [], fm, c.sourceNote)}
            onChange={(v) => {
              if (!v) return
              if (desbloqueada) writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
              else model.set('Planejamento.picks', { ...planPicks(model.fm), [c.choiceKey]: v })
            }}
          />
        </PbRow>,
      )
    }
    return out
  }

  // Tree view dos GANHOS automáticos (↳ sob quem concedeu). Itens com fonte
  // Escolha.* ficam FORA (já aparecem como row de seleção) — os filhos deles
  // entram como raiz com "via [pick]".
  const arvoreGanhos = (card: LevelCard): ReactNode => {
    const todos = [...card.habilidades, ...card.tecnicasRegra, ...card.acoesRegra].filter(
      (wl) => !String(card.fonteDe[wl] ?? '').startsWith('Escolha'),
    )
    const nomes = new Set(todos.map((wl) => wikiTarget(wl)))
    const paiDe = (wl: string): string | null => {
      const m = /^Regra\.\[\[(.+?)\]\]$/.exec(card.fonteDe[wl] ?? '')
      return m ? wikiTarget(`[[${m[1]}]]`) : null
    }
    const filhosDe = (wl: string) => todos.filter((f) => paiDe(f) === wikiTarget(wl))
    const linha = (wl: string, depth: number): ReactNode => {
      const rid = `ganho|${card.nivel}|${wl}`
      const pai = paiDe(wl)
      const via = depth === 0 && pai && pai !== classeTarget ? ` · via ${pai}` : ''
      return (
        <div key={wl} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <PbRow
            rid={rid}
            kickerTxt={`Ganho do nível${via}`}
            valor={linkLabel(wl)}
            doc={refs.refDoc(wl)}
            icon={linkIconForEntry(refs.refDoc(wl) ?? undefined) || undefined}
            depth={depth}
            expanded={expandidos.has(rid)}
            onToggle={toggleRow}
          />
          {filhosDe(wl).map((f) => linha(f, depth + 1))}
        </div>
      )
    }
    const raizes = todos.filter((wl) => !nomes.has(paiDe(wl) ?? ''))
    return (
      <>
        {raizes.map((wl) => linha(wl, 0))}
        {card.magiasRegra.map((m) => {
          const rid = `ganho|${card.nivel}|${m.escola}|${m.link}`
          return (
            <PbRow
              key={rid}
              rid={rid}
              kickerTxt={`Magia concedida · ${m.escola}${m.secundaria ? ' (2ª)' : ''}`}
              valor={linkLabel(m.link)}
              doc={refs.refDoc(m.link)}
              icon={linkIconForEntry(refs.refDoc(m.link) ?? undefined) || TIPO_EMOJI.magia}
              expanded={expandidos.has(rid)}
              onToggle={toggleRow}
            />
          )
        })}
        {card.escalares.length ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '2px 4px' }}>
            {card.escalares.map((e) => (
              <span key={e.label} style={mono({ fontSize: 10, color: 'var(--muted)' })}>
                {e.label} {e.de} → <span style={{ color: 'var(--text)', fontWeight: 700 }}>{e.para}</span>
                {e.fonte && /^Regra\.\[\[/.test(e.fonte)
                  ? ` · ${linkLabel(e.fonte.replace(/^Regra\./, ''))}`
                  : ''}
              </span>
            ))}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={mono({ fontSize: 10, color: 'var(--muted)' })}>
        Roadmap até o nível {NIVEL_MAX_PLANEJAMENTO} — nível atual{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{nivelAtual}</span>. Slots e escolhas
        de níveis futuros ficam no plano e entram sozinhos quando o nível subir.
      </div>

      {/* bloco-base (Classe/Subclasse/Sintonia/Passado) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {baseRows.map((r) => (
          <PbRow
            key={r.rid}
            rid={r.rid}
            kickerTxt={r.kicker}
            valor={r.valor}
            doc={r.doc}
            expanded={expandidos.has(r.rid)}
            onToggle={toggleRow}
          />
        ))}
      </div>

      {cards.map((card) => {
        const atual = card.nivel === nivelAtual
        const futuro = card.nivel > nivelAtual
        const pendencias = pendenciasDe(card)
        const preenchidas = rowsPreenchidas(card)
        return (
          <div key={card.nivel} data-nivel={card.nivel} style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: futuro ? 0.8 : 1 }}>
            {/* banner do nível (largura cheia, como no Pathbuilder) */}
            <div
              style={{
                background: atual
                  ? 'color-mix(in srgb,var(--accent) 82%,#000)'
                  : 'color-mix(in srgb,var(--accent) 45%,#222)',
                color: '#fff',
                textAlign: 'center',
                padding: '6px 0',
                clipPath: clip(6),
                ...mono({ fontSize: 12, fontWeight: 700, letterSpacing: '.2em' }),
              }}
            >
              NÍVEL {card.nivel}
              {atual ? '  ◄' : futuro ? '  · PLANO' : ''}
            </div>
            {/* slots pendentes: botões destacados centrados */}
            {pendencias.length ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', padding: '2px 0', alignItems: 'flex-end' }}>
                {pendencias.map((p) => (
                  <SlotButton
                    key={p.pid}
                    ativo={pickerAberto === p.pid}
                    onClick={p.onOpen ?? (() => togglePicker(p.pid))}
                  >
                    {p.icon} {p.label}
                    {p.done ? (
                      <span style={{ color: 'var(--accent)', marginLeft: 6, opacity: 0.8 }}>✓</span>
                    ) : null}
                  </SlotButton>
                ))}
              </div>
            ) : null}
            {pendencias.map((p) =>
              p.picker && pickerAberto === p.pid ? (
                <div
                  key={`picker|${p.pid}`}
                  style={{ border: '1px dashed var(--line2)', padding: '9px 12px', clipPath: clip(7) }}
                >
                  <span style={kicker}>{p.label}</span>
                  <div style={{ marginTop: 6 }}>{p.picker}</div>
                </div>
              ) : null,
            )}
            {preenchidas}
            {card.slotGrants.length ? (
              // rastreabilidade sutil: quem adicionou slot NESTE nível (a
              // Evolução Básica aparece no N4, N5, N6…)
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '0 2px' }}>
                {Object.entries(
                  card.slotGrants.reduce<Record<string, string[]>>((acc, g) => {
                    ;(acc[g.link] ??= []).push(`+${g.ns} (${g.rank})`)
                    return acc
                  }, {}),
                ).map(([link, adds]) => (
                  <span key={link} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    <PlanChip wl={link} refs={refs} />
                    <span style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>{adds.join(' · ')}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {arvoreGanhos(card)}
            {card.gastos.pericias.length ||
            card.gastos.tecnicas.length ||
            card.gastos.magias.length ||
            card.gastos.especialidades.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>GASTOS</span>
                {card.gastos.pericias.map((g) => (
                  <PlanChip
                    key={`p|${g.nome}|${g.rank}`}
                    wl={`[[${g.nome}]]`}
                    refs={refs}
                    sufixo={`${g.rank}${g.fonte === 'Passado' ? ' · Passado' : ''}${g.planejado ? ' · plano' : ''}`}
                  />
                ))}
                {card.gastos.tecnicas.map((g) => (
                  <PlanChip
                    key={`t|${g.link}`}
                    wl={g.link}
                    refs={refs}
                    sufixo={`Técnica ${g.rank}${g.planejado ? ' · plano' : ''}`}
                  />
                ))}
                {card.gastos.magias.map((g) => (
                  <PlanChip
                    key={`m|${g.escola}|${g.link}`}
                    wl={g.link}
                    refs={refs}
                    sufixo={`Magia ${g.rank}${g.secundaria ? ' (2ª)' : ''}${g.planejado ? ' · plano' : ''}`}
                  />
                ))}
                {card.gastos.especialidades.map((f) => (
                  <PlanChip
                    key={`e|${f.pericia}|${f.alvo}`}
                    wl={f.alvo}
                    refs={refs}
                    sufixo={`${f.tipo === 'especialidade' ? '🎖️' : '🏆'} ${f.pericia}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
      {popup ? (
        <Modal
          titulo={`${popup.tipo === 'pericia' ? `${TIPO_EMOJI.pericia} INCREMENTOS DE PERÍCIA` : `${TIPO_EMOJI.magia} MAGIAS`} — NÍVEL ${popup.nivel}`}
          onClose={() => setPopup(null)}
        >
          {(() => {
            const grants = (cards?.[popup.nivel - 1]?.slotGrants ?? []).filter((g) =>
              popup.tipo === 'pericia' ? g.ns === 'Perícia' : g.ns === 'Magia',
            )
            return grants.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>SLOTS DESTE NÍVEL VÊM DE</span>
                {grants.map((g) => (
                  <span key={`${g.link}|${g.rank}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <PlanChip wl={g.link} refs={refs} sufixo={`+${g.rank}`} />
                  </span>
                ))}
              </div>
            ) : null
          })()}
          <div style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
            Só os slots DESTE nível são editáveis aqui — o que veio antes é contexto travado.
          </div>
          {(() => {
            const cardPopup = cards?.[popup.nivel - 1]
            if (!cardPopup) return null
            if (popup.tipo === 'pericia') {
              const contexto = Object.entries(cardPopup.periciasEntrando).filter(([, rk]) => rk !== 'N')
              return (
                <>
                  {contexto.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={kicker}>CONTEXTO (ATÉ O NÍVEL {popup.nivel - 1}) — TRAVADO</span>
                      {contexto.map(([nome, rk]) => (
                        <span key={nome} style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
                          {nome} {rk}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {editorPericiasNivel(cardPopup)}
                </>
              )
            }
            const conhecidas = [...magiasConhecidasAntes(popup.nivel)]
            return (
              <>
                {conhecidas.length ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={kicker}>CONHECIDAS ATÉ O NÍVEL {popup.nivel - 1} — TRAVADO</span>
                    {conhecidas.map((nome) => (
                      <span key={nome} style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
                        {nome}
                      </span>
                    ))}
                  </div>
                ) : null}
                {editorMagiasNivel(cardPopup)}
              </>
            )
          })()}
        </Modal>
      ) : null}
    </div>
  )
}
