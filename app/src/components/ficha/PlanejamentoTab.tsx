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
  PericiasProfPanel,
  MagiasHabPanel,
  type HabChoice,
} from './HabilidadesTab'
import { rankGroupLabel } from './registry'
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
import { ITEM_CARD_CSS, docImageUrl, docTier, itemCardHtml } from '../item-card'
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
  return (
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
    </div>
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
  // Popup por nível (Incrementos de Perícia / Magias — painéis do wizard).
  // Enquanto aberto, o DIFF do FM atribui cada gasto novo ao nível do popup
  // (Planejamento.gastosSlots); remoções derrubam o registro (e os ranks
  // acima da perícia — cascata).
  const [popup, setPopup] = useState<{ nivel: number; tipo: 'pericia' | 'magia' } | null>(null)
  const snapPopup = useRef<Set<string>>(new Set())
  const fmSig = useMemo(() => JSON.stringify(fm), [fm])
  const buildSeq = useRef(0)

  useEffect(() => {
    // Com o POPUP aberto, cada clique no painel mudava o FM e disparava as 10
    // projeções de novo — a UI congelava ("nada acontece quando clico",
    // report 2026-08-25). Pausa o rebuild enquanto edita; refaz ao fechar.
    if (popup) return
    const seq = ++buildSeq.current
    let vivo = true
    void buildLevelTimeline(fm, catalog, loadDoc).then((c) => {
      if (vivo && buildSeq.current === seq) setCards(c)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmSig, catalog, popup])

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

  // ── diff-registro do POPUP (atribuição de nível dos gastos do painel) ─────
  const snapshotPericias = (): Set<string> => {
    const out = new Set<string>()
    for (const row of (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as Row[]) {
      const nome = String(row.Nome ?? '')
      for (const inc of (row.Incrementos ?? []) as Row[]) {
        for (const r of ['A', 'E', 'M'] as const) {
          if (typeof inc[r] === 'string' && String(inc[r]).startsWith('Slot')) out.add(`inc|${nome}|${r}`)
        }
      }
      if (String(row.Especializacao ?? '').trim()) out.add(`esp|${nome}|${String(row.Especializacao)}`)
      if (String(row.Maestria ?? '').trim()) out.add(`mae|${nome}|${String(row.Maestria)}`)
    }
    return out
  }
  const snapshotMagias = (): Set<string> => {
    const out = new Set<string>()
    for (const sec of [false, true]) {
      const escolas = sec
        ? ((fmPath(model.fm, 'Magias', 'Secundaria', 'Lista') ?? []) as Row[])
        : ((fmPath(model.fm, 'Magias', 'Lista') ?? []) as Row[])
      for (const esc of escolas) {
        for (const row of Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : []) {
          const e = Object.entries(row)[0]
          if (!e) continue
          const m = /^Slot\.([BAEM])$/.exec(String(e[1]))
          if (m) out.add(`mag|${String(esc.Nome)}|${wikiTarget(e[0])}|${m[1]}`)
        }
      }
    }
    return out
  }
  const snapshotDe = (tipo: 'pericia' | 'magia') => (tipo === 'pericia' ? snapshotPericias() : snapshotMagias())

  useEffect(() => {
    if (!popup) return
    const agora = snapshotDe(popup.tipo)
    const antes = snapPopup.current
    let regs = [...registros]
    let mudou = false
    for (const key of agora) {
      if (antes.has(key)) continue
      const [kind, a, b, c] = key.split('|')
      mudou = true
      if (kind === 'inc') {
        regs = regs.filter((x) => !(x.tipo === 'pericia' && x.alvo === a && x.rank === b))
        regs.push({ nivel: popup.nivel, tipo: 'pericia', rank: b as 'A' | 'E' | 'M', alvo: a! })
      } else if (kind === 'esp' || kind === 'mae') {
        const tipo = kind === 'esp' ? 'especialidade' : 'maestria'
        regs = regs.filter((x) => !(x.tipo === tipo && wikiTarget(x.alvo) === wikiTarget(b!)))
        regs.push({ nivel: popup.nivel, tipo, alvo: b!, contexto: a })
      } else if (kind === 'mag') {
        regs = regs.filter((x) => !(x.tipo === 'magia' && wikiTarget(x.alvo) === b))
        regs.push({ nivel: popup.nivel, tipo: 'magia', rank: c as 'B' | 'A' | 'E' | 'M', alvo: `[[${b}]]`, contexto: a })
      }
    }
    for (const key of antes) {
      if (agora.has(key)) continue
      const [kind, a, b] = key.split('|')
      mudou = true
      if (kind === 'inc') {
        // cascata: removeu o rank — caem os registros do MESMO rank e acima
        const ordem: Record<string, number> = { A: 1, E: 2, M: 3 }
        regs = regs.filter(
          (x) => !(x.tipo === 'pericia' && x.alvo === a && (ordem[String(x.rank)] ?? 0) >= (ordem[b ?? ''] ?? 0)),
        )
      } else if (kind === 'esp' || kind === 'mae') {
        const tipo = kind === 'esp' ? 'especialidade' : 'maestria'
        regs = regs.filter((x) => !(x.tipo === tipo && wikiTarget(x.alvo) === wikiTarget(b!)))
      } else if (kind === 'mag') {
        regs = regs.filter((x) => !(x.tipo === 'magia' && wikiTarget(x.alvo) === b))
      }
    }
    snapPopup.current = agora
    if (mudou) setRegistros(regs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmSig, popup])

  const abrePopup = (nivel: number, tipo: 'pericia' | 'magia') => {
    snapPopup.current = snapshotDe(tipo)
    setPopup({ nivel, tipo })
  }

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
  const removerX = (aria: string, onClick: () => void) => (
    <button
      aria-label={aria}
      onClick={onClick}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}
    >
      ✕
    </button>
  )

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

  const pickerSelect = (
    aria: string,
    options: Array<{ value: string; label: string }>,
    onPick: (v: string) => void,
  ) => (
    <SelectBox
      ariaLabel={aria}
      value=""
      options={[{ value: '', label: '— escolher —' }, ...options]}
      onChange={(v) => {
        if (v) onPick(v)
      }}
    />
  )

  const pendenciasDe = (card: LevelCard): SlotPend[] => {
    const out: SlotPend[] = []
    // Perícias: botão SEMPRE que o nível tem slot (✓ sutil quando tudo gasto);
    // ≤ atual abre o POPUP do wizard; futuro expande pickers de plano.
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
        fontes: card.slotFontes.pericias,
        ...(card.nivel <= nivelAtual
          ? { onOpen: () => abrePopup(card.nivel, 'pericia') }
          : pendentes > 0
            ? {
                picker: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {perTot.flatMap((rank) =>
                      Array.from({ length: Math.max(0, livresDe(rank)) }, (_, i) => (
                        <div key={`${rank}|${i}`}>
                          <span style={kicker}>INCREMENTO ({rank})</span>
                          {pickerSelect(
                            `Incremento de Perícia ${rank} (nível ${card.nivel})`,
                            card.periciasElegiveis[rank].map((n) => ({ value: n, label: n })),
                            (nome) =>
                              registraEAplica({ nivel: card.nivel, tipo: 'pericia', rank, alvo: nome }, () =>
                                aplicaPericia(nome, rank),
                              ),
                          )}
                        </div>
                      )),
                    )}
                  </div>
                ),
              }
            : {}),
      })
    }
    // Técnicas: botão agregado por nível (✓ quando tudo gasto).
    const tecTot = (['A', 'E', 'M'] as const).filter((r) => card.slots.tecnicas[r] > 0)
    if (tecTot.length) {
      const livresDe = (r: 'A' | 'E' | 'M') =>
        card.slots.tecnicas[r] - card.gastos.tecnicas.filter((g) => g.rank === r).length
      const pendentes = tecTot.reduce((n, r) => n + Math.max(0, livresDe(r)), 0)
      out.push({
        pid: `${card.nivel}|tec`,
        label: `TÉCNICAS (${tecTot.map((r) => `${r}×${card.slots.tecnicas[r]}`).join(' ')})`,
        icon: TIPO_EMOJI.tecnica,
        done: pendentes === 0,
        fontes: card.slotFontes.tecnicas,
        ...(pendentes > 0
          ? {
              picker: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {tecTot.flatMap((rank) =>
                    Array.from({ length: Math.max(0, livresDe(rank)) }, (_, i) => (
                      <div key={`${rank}|${i}`}>
                        <span style={kicker}>TÉCNICA ({rank})</span>
                        {pickerSelect(
                          `Técnica ${rank} (nível ${card.nivel})`,
                          (tecnicasElegiveis.get(rank) ?? []).map((wl) => ({ value: wl, label: linkLabel(wl) })),
                          (wl) =>
                            registraEAplica({ nivel: card.nivel, tipo: 'tecnica', rank, alvo: wl }, () =>
                              aplicaTecnica(wl, rank),
                            ),
                        )}
                      </div>
                    )),
                  )}
                </div>
              ),
            }
          : {}),
      })
    }
    // Magias: botão persistente por nível (✓ quando tudo gasto); ≤ atual abre
    // o painel do wizard; futuro expande pickers de plano.
    const magTot = (['B', 'A', 'E', 'M'] as const).filter((r) => card.slots.magias[r] > 0)
    if (magTot.length) {
      const livresDe = (r: 'B' | 'A' | 'E' | 'M') =>
        card.slots.magias[r] - card.gastos.magias.filter((g) => g.rank === r && !g.secundaria).length
      const pendentes = magTot.reduce((n, r) => n + Math.max(0, livresDe(r)), 0)
      const pickerFuturo = (rank: 'B' | 'A' | 'E' | 'M', i: number) => {
        const grupo = GROUP_OF[rank]!
        const opcoes: Array<{ value: string; label: string }> = []
        if (spellDocs) {
          for (const esc of escolasProf) {
            const nome = String(esc.Nome)
            if (!escolaCobreRank(String(esc.Proficiencia ?? 'N'), grupo)) continue
            for (const d of spellDocs.values()) {
              if (!d.id.includes(`/Magia ${nome}/`)) continue
              if (magiasAprendidas.has(d.basename)) continue
              if (rankGroupLabel(String(d.frontmatter['rank'] ?? '')) !== grupo) continue
              opcoes.push({ value: `${nome}|[[${d.basename}]]`, label: `${d.basename} · ${nome}` })
            }
          }
        }
        return (
          <div key={`${rank}|${i}`}>
            <span style={kicker}>MAGIA ({rank})</span>
            {pickerSelect(
              `Magia ${rank} (nível ${card.nivel})`,
              opcoes.sort((a, b) => a.label.localeCompare(b.label)),
              (v) => {
                const [escola, wl] = v.split('|') as [string, string]
                registraEAplica({ nivel: card.nivel, tipo: 'magia', rank, alvo: wl, contexto: escola }, () =>
                  aplicaMagia(escola, wl, rank),
                )
              },
            )}
          </div>
        )
      }
      out.push({
        pid: `${card.nivel}|mag`,
        label: `MAGIAS (${magTot.map((r) => `${r}×${card.slots.magias[r]}`).join(' ')})`,
        icon: TIPO_EMOJI.magia,
        done: pendentes === 0,
        fontes: card.slotFontes.magias,
        ...(card.nivel <= nivelAtual
          ? { onOpen: () => abrePopup(card.nivel, 'magia') }
          : pendentes > 0
            ? {
                picker: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {magTot.flatMap((rank) =>
                      Array.from({ length: Math.max(0, livresDe(rank)) }, (_, i) => pickerFuturo(rank, i)),
                    )}
                  </div>
                ),
              }
            : {}),
      })
    }
    // Especialidades/Maestrias destravadas pelos ranks E/M atribuídos aqui —
    // botão agregado persistente (✓ quando todas definidas).
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
        ...(oportunidades.length
          ? {
              picker: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {oportunidades.map((o) => (
                    <div key={`${o.nome}|${o.rank}`}>
                      <span style={kicker}>
                        {o.rank === 'E' ? 'ESPECIALIDADE' : 'MAESTRIA'} · {o.nome}
                      </span>
                      {pickerSelect(
                        `${o.rank === 'E' ? 'Especialidade' : 'Maestria'} de ${o.nome} (nível ${card.nivel})`,
                        o.opts.map((wl) => ({ value: wl, label: linkLabel(wl) })),
                        (wl) =>
                          registraEAplica(
                            {
                              nivel: card.nivel,
                              tipo: o.rank === 'E' ? 'especialidade' : 'maestria',
                              alvo: wl,
                              contexto: o.nome,
                            },
                            () =>
                              aplicaEspecialidade(
                                o.nome,
                                o.rank === 'E' ? 'Especializacao' : 'Maestria',
                                wl,
                              ),
                          ),
                      )}
                    </div>
                  ))}
                </div>
              ),
            }
          : {}),
      })
    }
    // Seleções de habilidade do nível — botão agregado persistente.
    const escolhasNormais = card.escolhas.filter((c) => !c.isSubclass)
    if (escolhasNormais.length) {
      const pendentesSel = escolhasNormais.filter((c) => {
        const desbloqueada = c.gateLevel <= nivelAtual
        return !(desbloqueada ? c.pick : (plano[c.choiceKey] ?? null))
      })
      out.push({
        pid: `${card.nivel}|sel`,
        label: `SELEÇÕES (${escolhasNormais.length})`,
        icon: TIPO_EMOJI.selecao,
        done: pendentesSel.length === 0,
        ...(pendentesSel.length
          ? {
              picker: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {pendentesSel.map((c) => {
                    const desbloqueada = c.gateLevel <= nivelAtual
                    return (
                      <div key={c.choiceKey}>
                        <span style={kicker}>
                          {(c.label || 'SELEÇÃO').toUpperCase()} · {c.sourceNote}
                        </span>
                        <SelectBox
                          ariaLabel={`${c.label || 'Escolha'} (nível ${c.gateLevel})`}
                          value=""
                          options={choiceOptionsSiblingAware(toHabChoice(c), [], fm, c.sourceNote)}
                          onChange={(v) => {
                            if (!v) return
                            if (desbloqueada)
                              writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
                            else
                              model.set('Planejamento.picks', {
                                ...planPicks(model.fm),
                                [c.choiceKey]: v,
                              })
                            setPickerAberto(null)
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              ),
            }
          : {}),
      })
    }
    return out
  }

  // Rows de seleções preenchidas do nível (repicker inline na expansão).
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
    for (const g of card.gastos.pericias) {
      if (g.fonte === 'Passado') continue
      const rid = `per|${g.nome}|${g.rank}`
      out.push(
        <PbRow
          key={rid}
          rid={rid}
          kickerTxt={`Incremento de Perícia (${g.rank})`}
          valor={g.nome}
          doc={refs.refDoc(`[[${g.nome}]]`)}
          icon={TIPO_EMOJI.pericia}
          expanded={expandidos.has(rid)}
          onToggle={toggleRow}
          right={removerX(`Remover ${g.nome} ${g.rank}`, () => {
            desfazPericia(g.nome, g.rank)
            desregistrar('pericia', g.nome)
          })}
        />,
      )
    }
    for (const g of card.gastos.tecnicas) {
      const rid = `tec|${g.link}`
      out.push(
        <PbRow
          key={rid}
          rid={rid}
          kickerTxt={`Técnica (${g.rank})`}
          valor={linkLabel(g.link)}
          doc={refs.refDoc(g.link)}
          icon={linkIconForEntry(refs.refDoc(g.link) ?? undefined) || TIPO_EMOJI.tecnica}
          expanded={expandidos.has(rid)}
          onToggle={toggleRow}
          right={removerX(`Remover ${linkLabel(g.link)}`, () => {
            desfazTecnica(g.link)
            desregistrar('tecnica', g.link)
          })}
        />,
      )
    }
    for (const g of card.gastos.magias) {
      const rid = `mag|${g.escola}|${g.link}`
      out.push(
        <PbRow
          key={rid}
          rid={rid}
          kickerTxt={`Magia (${g.rank}) · ${g.escola}${g.secundaria ? ' (2ª)' : ''}`}
          valor={linkLabel(g.link)}
          doc={refs.refDoc(g.link)}
          icon={linkIconForEntry(refs.refDoc(g.link) ?? undefined) || TIPO_EMOJI.magia}
          expanded={expandidos.has(rid)}
          onToggle={toggleRow}
          right={
            g.secundaria
              ? undefined
              : removerX(`Remover ${linkLabel(g.link)}`, () => {
                  desfazMagia(g.escola, g.link)
                  desregistrar('magia', g.link)
                })
          }
        />,
      )
    }
    for (const f of card.gastos.especialidades) {
      const rid = `esp|${f.pericia}|${f.alvo}`
      out.push(
        <PbRow
          key={rid}
          rid={rid}
          kickerTxt={`${f.tipo === 'especialidade' ? 'Especialidade' : 'Maestria'} · ${f.pericia}`}
          valor={linkLabel(f.alvo)}
          doc={refs.refDoc(f.alvo)}
          icon={f.tipo === 'especialidade' ? TIPO_EMOJI.especialidade : TIPO_EMOJI.maestria}
          expanded={expandidos.has(rid)}
          onToggle={toggleRow}
          right={removerX(`Remover ${linkLabel(f.alvo)}`, () => {
            aplicaEspecialidade(f.pericia, f.tipo === 'especialidade' ? 'Especializacao' : 'Maestria', '')
            desregistrar(f.tipo, f.alvo)
          })}
        />,
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
                  <div key={p.pid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    {p.fontes?.length ? (
                      // rastreabilidade discreta: a(s) nota(s) que CONCEDEM o slot
                      <span style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>
                        via {p.fontes.map((f) => linkLabel(f)).join(', ')}
                      </span>
                    ) : null}
                    <SlotButton
                      ativo={pickerAberto === p.pid}
                      onClick={
                        p.onOpen ?? (p.picker ? () => togglePicker(p.pid) : undefined) ?? (() => {})
                      }
                    >
                      {p.icon} {p.label}
                      {p.done ? (
                        <span style={{ color: 'var(--accent)', marginLeft: 6, opacity: 0.8 }}>✓</span>
                      ) : null}
                    </SlotButton>
                  </div>
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
            {(() => {
              const nGanhos =
                [...card.habilidades, ...card.tecnicasRegra, ...card.acoesRegra].filter(
                  (wl) => !String(card.fonteDe[wl] ?? '').startsWith('Escolha'),
                ).length +
                card.magiasRegra.length +
                card.escalares.length
              if (!nGanhos) return null
              const rid = `ganhos|${card.nivel}`
              const abertoG = expandidos.has(rid)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={() => toggleRow(rid)}
                    style={mono({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      background: 'transparent',
                      border: '1px dashed var(--line2)',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      clipPath: clip(6),
                    })}
                  >
                    <span>{abertoG ? '▾' : '▸'}</span>
                    GANHOS DO NÍVEL ({nGanhos})
                  </button>
                  {abertoG ? arvoreGanhos(card) : null}
                </div>
              )
            })()}
          </div>
        )
      })}
      {popup ? (
        <Modal
          titulo={`${popup.tipo === 'pericia' ? `${TIPO_EMOJI.pericia} INCREMENTOS DE PERÍCIA` : `${TIPO_EMOJI.magia} MAGIAS`} — NÍVEL ${popup.nivel}`}
          onClose={() => setPopup(null)}
        >
          <div style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
            Gastos feitos aqui são atribuídos ao nível {popup.nivel} do planejamento. O painel é o
            mesmo do wizard (orçamento total da ficha); os slots DESTE nível estão no card.
          </div>
          {popup.tipo === 'pericia' ? (
            <PericiasProfPanel doc={doc} forceEdit hideItemBonus />
          ) : (
            <>
              <MagiasHabPanel doc={doc} refs={refs} forceEdit semRecursos />
              {((fmPath(dfm, 'Magias', 'Secundaria', 'Lista') ?? []) as Row[]).some(
                (e) => String(e.Proficiencia ?? 'N') !== 'N',
              ) ? (
                <MagiasHabPanel doc={doc} refs={refs} sec forceEdit semRecursos />
              ) : null}
            </>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
