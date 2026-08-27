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
  pinsFaltantes,
  sanitizarRegistros,
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
  custoDigits,
  type HabChoice,
} from './HabilidadesTab'
import { ATTR_EMOJI, magiaEmoji, rankGroupLabel, tecnicaCustoEmoji, tokens, type RankLetter, type RankStateKey } from './registry'
import { AttrBadge, RankBtns } from './bits'
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
import { pushLog } from '../../data/debug-log'
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
type TipoPopup = 'pericia' | 'magia' | 'tecnica' | 'espec' | 'selecoes'
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

/** Pick REAL da escolha — 'default'/'none' é o app defaultando, não escolha
 *  do usuário: exibe VAZIO com a pendência acesa (espelho de #473 nas
 *  Competências; sem isso "limpar" nunca pegava — o default reaparecia). */
function pickRealDe(c: TimelineChoice): string | null {
  return c.source === 'default' || c.source === 'none' ? null : c.pick
}

/** Emoji do grupo de seleção pela LISTA-ALVO da regra (registro central):
 *  escolha que alimenta Tecnicas.Lista é técnica (📘), Magias é magia. */
function emojiDoAlvo(targetRaw?: string): string {
  const t = (targetRaw ?? '').toLowerCase()
  if (t.startsWith('tecnicas') || t.startsWith('técnicas')) return TIPO_EMOJI.tecnica
  if (t.startsWith('magias')) return TIPO_EMOJI.magia
  return TIPO_EMOJI.selecao
}

function toHabChoice(c: TimelineChoice): HabChoice {
  return {
    choiceKey: c.choiceKey,
    label: c.label,
    options: c.options,
    // pick REAL: default não conta como escolha — o writeChoicePick não pode
    // remover a linha de um "pick" que o usuário nunca fez (#500)
    pick: pickRealDe(c),
    kind: (c.kind ?? 'complementar-sel') as HabChoice['kind'],
    targetRaw: c.targetRaw,
    occ: c.occ,
    source: c.source,
    valorRaw: c.valorRaw,
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
 *  clickDetalhes — o ItemHover cuida) + ícone do registro. O doc vem do
 *  resolver do PLANO (docDe) — refs.refDoc não cobre itens de nível futuro
 *  (não estão nas listas do herói) e o clique não abria nada. */
function PlanChip({
  wl,
  doc,
  sufixo,
  fallbackIcon,
}: {
  wl: string
  doc?: VaultDoc | null
  sufixo?: string
  /** Emoji do REGISTRO quando o linkIcon não cobre a categoria (magias por
   *  elemento/escola, ações pelo custo, etc). */
  fallbackIcon?: string
}) {
  const icone = linkIconForEntry(doc ?? undefined) || fallbackIcon || ''
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
      {icone ? <span style={{ marginRight: 5 }}>{icone}</span> : null}
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
  // Popup por nível (Incrementos de Perícia / Magias) — editor ESCOPADO: só
  // os slots DAQUELE nível são editáveis; o passado aparece como contexto
  // travado (report 2026-08-25).
  const [popup, setPopup] = useState<{ nivel: number; tipo: TipoPopup; grupo?: string } | null>(null)
  const [confirmaLimpar, setConfirmaLimpar] = useState(false)
  const fmSig = useMemo(() => JSON.stringify(fm), [fm])
  const buildSeq = useRef(0)
  const cardsRef = useRef<LevelCard[] | null>(null)
  /** Toda escrita de FM desta aba passa aqui: o bump SÍNCRONO do seq invalida
   *  builds em voo ANTES do próximo effect rodar — sem isso um build iniciado
   *  antes da edição aterrissava depois, passava no guard e o auto-heal
   *  escrevia gastosSlots do FM velho por cima do registro recém-gravado
   *  (#494: o clique "não pegava" e o valor sumia). */
  const escreve = (path: string, value: unknown) => {
    buildSeq.current += 1
    model.set(path, value)
  }
  const commitCards = (c: LevelCard[]) => {
    cardsRef.current = c
    setCards(c)
  }

  useEffect(() => {
    const seq = ++buildSeq.current
    let vivo = true
    void buildLevelTimeline(fm, catalog, loadDoc).then((c) => {
      if (!vivo || buildSeq.current !== seq) return
      commitCards(c)
      // AUTO-HEAL: registros com nível deslocado (gravados pelas versões
      // antigas) são movidos pro primeiro nível com slot do rank — alvo/rank
      // preservados, nada se perde (pedido: sem "limpar plano" na mão).
      // Registros lidos do MESMO fm que gerou o build (o guard de seq garante
      // que nenhuma escrita aconteceu no meio — par consistente).
      const { mudou, registros: sane } = sanitizarRegistros(c, gastosRegistrados(fm))
      // AUTO-SEED: materializa o registro do que JÁ está gasto (atribuição
      // atual dos cards) — abrir a aba já grava o planejamento do herói até
      // o nível dele, sem exigir uma primeira edição (pedido 2026-08-25).
      const pins = pinsFaltantes(c, sane)
      if (mudou || pins.length) escreve('Planejamento.gastosSlots', [...sane, ...pins])
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
  // Elegíveis por classe/requisito/rank SEM excluir as já aprendidas — o
  // filtro do "conhecido" é RETROATIVO por nível (tecnicasConhecidasAte).
  const tecnicasElegiveisNivel = useMemo(() => {
    const byRank = new Map<RankAEM, string[]>()
    if (!tecnicaDocs) return byRank
    for (const d of tecnicaDocs.values()) {
      const classes = tecnicaClasses(d)
      if (classes.length > 0 && (!classeTarget || !classes.includes(classeTarget))) continue
      if (!tecnicaRequisitosCumpridos(reqModel, d)) continue
      const letter = TEC_GROUP_LETTER[docRankGroup(d)]
      if (!letter) continue
      byRank.set(letter, [...(byRank.get(letter) ?? []), `[[${d.basename}]]`].sort())
    }
    return byRank
  }, [tecnicaDocs, classeTarget, reqModel])

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

  // Resolver de docs do PLANO: refs.refDoc só cobre o que está nas listas do
  // herói — itens de nível futuro (planejados) precisam do catálogo.
  const planDocIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of cards ?? []) {
      const alvos = [
        ...c.gastos.tecnicas.map((g) => g.link),
        ...c.gastos.magias.map((g) => g.link),
        ...c.gastos.especialidades.map((g) => g.alvo),
        ...c.habilidades,
        ...c.tecnicasRegra,
        ...c.acoesRegra,
        ...c.magiasRegra.map((m) => m.link),
        ...c.escolhas.flatMap((e) => (e.pick ? [e.pick] : [])),
        ...c.escolhas.flatMap((e) => e.options),
        ...Object.values(planPicks(fm)),
        ...c.slotGrants.map((g) => g.link),
        ...Object.keys(c.periciasEntrando).map((n) => `[[${n}]]`),
      ]
      for (const wl of alvos) {
        const r = catalog.resolve(wikiTarget(wl))
        if (r.kind === 'doc') ids.add(r.id)
      }
    }
    // opções de especialidade/maestria da vault (o popup precisa do hover)
    for (const wl of [
      ...Object.values(espMaes.especializacoes).flat(),
      ...Object.values(espMaes.maestriasByEspecialidade).flat(),
    ]) {
      const r = catalog.resolve(wikiTarget(wl))
      if (r.kind === 'doc') ids.add(r.id)
    }
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, catalog, fmSig, espMaes])
  const planDocs = useDocs(planDocIds)
  const docDe = (wl: string): VaultDoc | undefined => {
    const viaRefs = refs.refDoc(wl)
    if (viaRefs) return viaRefs
    const r = catalog.resolve(wikiTarget(wl))
    return r.kind === 'doc' ? planDocs?.get(r.id) : undefined
  }

  // ── registros (nível explícito dos gastos) ────────────────────────────────
  const registros = gastosRegistrados(fm)
  // Ref sempre à frente do render: setRegistros grava aqui SÍNCRONO — um
  // clique em handler de render velho (celular com a thread ocupada pelas 10
  // projeções) lê o estado real, não a closure (#494: o segundo registro
  // reconstruía a lista sem o primeiro e clobberava o FM).
  const regsRef = useRef<GastoRegistrado[]>(registros)
  regsRef.current = registros
  const setRegistros = (next: GastoRegistrado[]) => {
    regsRef.current = next
    escreve('Planejamento.gastosSlots', next)
  }
  /** Perícia casa POR RANK (A/E/M são gastos independentes — registrar o M
   *  não pode engolir o E); os demais tipos têm uma instância por alvo. */
  const casaRegistro = (
    x: GastoRegistrado,
    tipo: GastoRegistrado['tipo'],
    alvo: string,
    rank?: GastoRegistrado['rank'],
  ) =>
    x.tipo === tipo &&
    wikiTarget(x.alvo) === wikiTarget(alvo) &&
    (tipo !== 'pericia' || x.rank === rank)
  /** PIN: antes de qualquer edição, congela a atribuição ATUAL de todos os
   *  gastos sem registro. Sem isso, remover uma magia do N2 fazia o
   *  earliest-fit puxar as de níveis superiores pro buraco ("suprindo o slot
   *  com magias de slots superiores" — report 2026-08-25). Com o pin, o slot
   *  liberado fica VAZIO e o resto não se move. */
  const pinBase = (): GastoRegistrado[] => [
    ...regsRef.current,
    ...pinsFaltantes(cardsRef.current ?? [], regsRef.current),
  ]
  const registrar = (r: GastoRegistrado) =>
    setRegistros([...pinBase().filter((x) => !casaRegistro(x, r.tipo, r.alvo, r.rank)), r])
  const desregistrar = (
    tipo: GastoRegistrado['tipo'],
    alvo: string,
    rank?: GastoRegistrado['rank'],
  ) => setRegistros(pinBase().filter((x) => !casaRegistro(x, tipo, alvo, rank)))

  // ── aplicadores (caminhos existentes) ─────────────────────────────────────
  const savedPericias = () => (fmPath(model.fm, 'Pericias', 'Lista') ?? []) as Row[]
  const derivedIncsDe = (nome: string): Row[] => {
    const row = ((fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]).find((r) => String(r.Nome) === nome)
    return (row?.Incrementos ?? []) as Row[]
  }
  const aplicaPericia = (nome: string, rank: RankAEM) =>
    escreve('Pericias.Lista', applyPericiaRankEdit(savedPericias(), derivedIncsDe(nome), nome, rank))
  const desfazPericia = (nome: string, rank: RankAEM) => {
    const abaixo: Record<RankAEM, 'N' | 'A' | 'E'> = { A: 'N', E: 'A', M: 'E' }
    escreve('Pericias.Lista', applyPericiaRankEdit(savedPericias(), derivedIncsDe(nome), nome, abaixo[rank]))
  }
  const aplicaTecnica = (alvo: string, rank: RankAEM) =>
    escreve('Tecnicas.Lista', addTecnicaToLista((fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Row[], alvo, rank))
  const desfazTecnica = (alvo: string) =>
    escreve('Tecnicas.Lista', removeTecnicaFromLista((fmPath(model.fm, 'Tecnicas', 'Lista') ?? []) as Row[], alvo))
  const aplicaMagia = (escola: string, alvo: string, rank: RankBAEM) =>
    escreve('Magias.Lista', addMagiaToEscola((fmPath(model.fm, 'Magias', 'Lista') ?? []) as Row[], escola, alvo, rank))
  const desfazMagia = (escola: string, alvo: string) =>
    escreve('Magias.Lista', removeMagiaFromEscola((fmPath(model.fm, 'Magias', 'Lista') ?? []) as Row[], escola, alvo))
  const aplicaEspecialidade = (pericia: string, campo: 'Especializacao' | 'Maestria', alvo: string) => {
    const rows = savedPericias().map((r) => ({ ...r }))
    let row = rows.find((r) => String(r.Nome) === pericia)
    if (!row) {
      row = { Nome: pericia, Atributo: '', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] }
      rows.push(row)
    }
    row[campo] = alvo
    escreve('Pericias.Lista', rows)
  }

  const abrePopup = (nivel: number, tipo: TipoPopup, grupo?: string) => {
    // Diagnóstico remoto: com o modo debug ligado, o bug report leva o estado
    // exato do nível (slots/gastos/entrando) — investigação do #493.
    const card = cards?.[nivel - 1]
    if (card) {
      const s = (d: Record<string, number>) =>
        (['B', 'A', 'E', 'M'] as const).filter((r) => d[r]).map((r) => `${r}${d[r]}`).join('') || '-'
      pushLog(
        'plan',
        `popup ${tipo} N${nivel} slots per=${s(card.slots.pericias as never)} tec=${s(card.slots.tecnicas as never)} mag=${s(card.slots.magias as never)}`,
      )
      pushLog(
        'plan',
        `N${nivel} gastosPer=` +
          card.gastos.pericias.map((g) => `${g.nome}:${g.rank}${g.planejado ? '*' : ''}`).join(','),
      )
      pushLog(
        'plan',
        `entrando≠N=` +
          Object.entries(card.periciasEntrando)
            .filter(([, rk]) => rk !== 'N')
            .map(([n, rk]) => `${n}:${rk}`)
            .join(','),
      )
      const regs = gastosRegistrados(model.fm)
      pushLog(
        'plan',
        `registros(${regs.length})=` +
          regs.map((r) => `${r.tipo}:${wikiTarget(r.alvo)}:${r.rank ?? ''}@${r.nivel}`).join(',').slice(0, 260),
      )
    }
    setPopup({ nivel, tipo, grupo })
  }

  // ── sync plano ⇄ real quando o nível muda (roadmap do Pathbuilder) ────────
  useEffect(() => {
    if (!cards) return
    const plano = planPicks(fm)
    let planoNovo: Record<string, string> | null = null
    for (const card of cards) {
      for (const c of card.escolhas) {
        if (c.isSubclass) continue
        // pick DO FM (persisted/inferred): 'transiente' veio do próprio plano
        // e ainda precisa materializar (#511)
        const pickFm = c.source === 'transiente' ? null : pickRealDe(c)
        if (c.gateLevel <= nivelAtual) {
          const planejado = plano[c.choiceKey]
          if (!pickFm && planejado && c.options.some((o) => wikiTarget(o) === wikiTarget(planejado))) {
            writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), planejado)
            buildSeq.current += 1
            planoNovo = planoNovo ?? { ...plano }
            delete planoNovo[c.choiceKey]
          }
        } else if (pickFm && plano[c.choiceKey] !== pickFm) {
          planoNovo = planoNovo ?? { ...plano }
          planoNovo[c.choiceKey] = pickFm
        }
      }
    }
    if (planoNovo) escreve('Planejamento.picks', planoNovo)

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
  /** Patch OTIMISTA dos cards: no celular as 10 projeções do rebuild levam
   *  segundos — sem isso o clique parecia morto (logs do Carlos N8: estado
   *  perfeito, cliques chegando, grade parada). O rebuild real confirma.
   *  Parte do cardsRef (não da closure): cliques encadeados em renders
   *  atrasados não desfazem o patch anterior (#494). */
  const otimista = (fn: (cs: LevelCard[]) => void) => {
    const prev = cardsRef.current
    if (!prev) return
    const clone = structuredClone(prev)
    fn(clone)
    commitCards(clone)
  }
  const otimistaRemove = (
    tipo: GastoRegistrado['tipo'],
    alvo: string,
    rank?: GastoRegistrado['rank'],
  ) =>
    otimista((cs) => {
      const base = wikiTarget(alvo)
      for (const c of cs) {
        if (tipo === 'pericia')
          c.gastos.pericias = c.gastos.pericias.filter((g) => !(g.nome === base && g.rank === rank))
        else if (tipo === 'tecnica') c.gastos.tecnicas = c.gastos.tecnicas.filter((g) => wikiTarget(g.link) !== base)
        else if (tipo === 'magia') c.gastos.magias = c.gastos.magias.filter((g) => wikiTarget(g.link) !== base)
        else c.gastos.especialidades = c.gastos.especialidades.filter((g) => wikiTarget(g.alvo) !== base)
      }
    })
  const registraEAplica = (r: GastoRegistrado, aplica: () => void) => {
    registrar(r)
    if (r.nivel <= nivelAtual) aplica()
    otimista((cs) => {
      const card = cs[Math.min(NIVEL_MAX_PLANEJAMENTO, Math.max(1, r.nivel)) - 1]!
      const planejado = r.nivel > nivelAtual
      const base = wikiTarget(r.alvo)
      if (r.tipo === 'pericia' && r.rank && r.rank !== 'B') {
        // dedup POR RANK: mover o M de nível não pode apagar o A/E da perícia
        for (const c of cs)
          c.gastos.pericias = c.gastos.pericias.filter((g) => !(g.nome === base && g.rank === r.rank))
        card.gastos.pericias.push({ nome: base, rank: r.rank, fonte: 'Slot', ...(planejado ? { planejado } : {}) })
      } else if (r.tipo === 'tecnica' && r.rank && r.rank !== 'B') {
        for (const c of cs) c.gastos.tecnicas = c.gastos.tecnicas.filter((g) => wikiTarget(g.link) !== base)
        card.gastos.tecnicas.push({ link: r.alvo, rank: r.rank, ...(planejado ? { planejado } : {}) })
      } else if (r.tipo === 'magia' && r.rank) {
        for (const c of cs) c.gastos.magias = c.gastos.magias.filter((g) => wikiTarget(g.link) !== base)
        card.gastos.magias.push({
          escola: r.contexto ?? '',
          link: r.alvo,
          rank: r.rank,
          secundaria: false,
          ...(planejado ? { planejado } : {}),
        })
      } else if (r.tipo === 'especialidade' || r.tipo === 'maestria') {
        // dedup como o registrar: uma instância por (tipo, alvo) — clique
        // repetido não empilha a linha (#495)
        for (const c of cs)
          c.gastos.especialidades = c.gastos.especialidades.filter(
            (g) => !(g.tipo === r.tipo && wikiTarget(g.alvo) === wikiTarget(r.alvo)),
          )
        card.gastos.especialidades.push({
          pericia: r.contexto ?? '',
          alvo: r.alvo,
          tipo: r.tipo,
          ...(planejado ? { planejado } : {}),
        })
      }
    })
  }
  // ── bloco-base (topo, estilo Ancestry/Background/Class do Pathbuilder) ────
  // TODAS as escolhas de subclasse (Druida tem duas: Círculo Druídico e
  // Tradição Druídica — o find() escondia a segunda, #498).
  const subclasseRows = cards[0]!.escolhas.filter((c) => c.isSubclass)
  const passadoPericia = (() => {
    for (const row of (fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]) {
      const incs = (row.Incrementos ?? []) as Row[]
      if (incs.some((i) => Object.values(i).some((v) => String(v).startsWith('Passado')))) return String(row.Nome)
    }
    return null
  })()
  const baseRows: Array<{ rid: string; kicker: string; valor: string; doc?: VaultDoc | null; icon?: string }> = [
    {
      rid: 'base|classe',
      kicker: 'Classe',
      valor: linkLabel(String(fm['Classe'] ?? '')),
      doc: docDe(String(fm['Classe'] ?? '')),
      icon: tokens.emojis.perfil.Classe,
    },
    ...subclasseRows.map((sub) => ({
      rid: `base|subclasse|${sub.choiceKey}`,
      kicker: `Subclasse · ${sub.sourceNote}`,
      valor: linkLabel(sub.pick ?? '') || '(não definida)',
      doc: sub.pick ? docDe(sub.pick) : null,
      icon: tokens.emojis.perfil.Subclasse,
    })),
    ...(fm['Sintonia']
      ? [
          {
            rid: 'base|sintonia',
            kicker: 'Sintonia',
            valor: linkLabel(String(fm['Sintonia'])),
            doc: docDe(String(fm['Sintonia'])),
            icon: tokens.emojis.perfil.Sintonia,
          },
        ]
      : []),
    ...(fm['Passado']
      ? [
          {
            rid: 'base|passado',
            kicker: `Passado${passadoPericia ? ` · perícia ${passadoPericia}` : ''}`,
            valor: linkLabel(String(fm['Passado'])),
            doc: docDe(String(fm['Passado'])),
            icon: tokens.emojis.perfil.Passado,
          },
        ]
      : []),
  ]

  // ── pendências/preenchidos por nível ──────────────────────────────────────
  interface SlotPend {
    pid: string
    label: string
    icon: string
    onOpen: () => void
    /** Tudo preenchido → botão persiste com ✓ sutil (report 2026-08-25). */
    done?: boolean
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

  /** Técnicas conhecidas ATÉ o nível (gastos + concedidas por regra) — a
   *  elegibilidade filtra só o PASSADO: uma técnica atribuída a nível futuro
   *  segue aparecendo (escolher aqui MOVE ela pra cá e esvazia lá). */
  const tecnicasConhecidasAte = (nivel: number): Set<string> => {
    const out = new Set<string>()
    for (const c of cards ?? []) {
      if (c.nivel > nivel) break
      for (const g of c.gastos.tecnicas) out.add(wikiTarget(g.link))
      for (const wl of c.tecnicasRegra) out.add(wikiTarget(wl))
    }
    return out
  }

  /** Editor de TÉCNICAS escopado — mesmas linhas das "Técnicas Não Aprendidas"
   *  das competências (➕ verde, custo, emoji da categoria, nome com hover). */
  const editorTecnicasNivel = (card: LevelCard) => {
    const livresDe = (r: 'A' | 'E' | 'M') =>
      card.slots.tecnicas[r] - card.gastos.tecnicas.filter((g) => g.rank === r).length
    const ranks = (['A', 'E', 'M'] as const).filter((r) => card.slots.tecnicas[r] > 0)
    const conhecidas = tecnicasConhecidasAte(card.nivel)
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
                    otimistaRemove('tecnica', g.link)
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
          const linhas = (tecnicasElegiveisNivel.get(rank) ?? [])
            .filter((wl) => !conhecidas.has(wikiTarget(wl)))
            .map((wl) => {
              const d = docDe(wl) ?? (tecnicaDocs ? [...tecnicaDocs.values()].find((x) => x.basename === wikiTarget(wl)) : undefined)
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
                otimistaRemove(f.tipo, f.alvo)
                // CASCATA (#507): maestria depende da especialidade da
                // perícia — tirar a espec derruba a maestria junto (real e
                // planejada), senão ela ficava "selecionada" pro futuro
                if (f.tipo === 'especialidade') {
                  const dependentes = (cards ?? []).flatMap((cc) =>
                    cc.gastos.especialidades.filter(
                      (m) => m.tipo === 'maestria' && m.pericia === f.pericia,
                    ),
                  )
                  for (const m of dependentes) {
                    if (!m.planejado) aplicaEspecialidade(f.pericia, 'Maestria', '')
                    desregistrar('maestria', m.alvo)
                    otimistaRemove('maestria', m.alvo)
                  }
                }
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
            <ItemHover doc={docDe(f.alvo)} fullBody>
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
                <ItemHover doc={docDe(wl)} fullBody>
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
    // ordem das COMPETÊNCIAS (FM Pericias.Lista), não alfabética; perícias
    // fora da lista (raras) vão pro fim — e cada linha leva o badge do
    // atributo como lá (report 2026-08-26)
    const rowsFm = (fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]
    const ordemFm = rowsFm.map((r) => String(r.Nome ?? ''))
    const atributoDe = (nome: string) => String(rowsFm.find((r) => String(r.Nome) === nome)?.Atributo ?? '')
    const nomes = Object.keys(card.periciasEntrando).sort((a, b) => {
      const ia = ordemFm.indexOf(a)
      const ib = ordemFm.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>
          {(['A', 'E', 'M'] as const)
            .filter((r) => card.slots.pericias[r] > 0)
            .map((r) => {
              const usados = card.gastos.pericias.filter((g) => g.rank === r && g.fonte === 'Slot')
              const quem = usados.length ? ` (${usados.map((g) => g.nome).join(', ')})` : ''
              return `${r}: ${Math.max(0, livresDe(r))}/${card.slots.pericias[r]} livres${quem}`
            })
            .join(' · ')}
        </div>
        {nomes.map((nome) => {
          const entrando = card.periciasEntrando[nome]!
          const gastoAqui = card.gastos.pericias.find((g) => g.nome === nome && g.fonte === 'Slot')
          const atual = gastoAqui ? gastoAqui.rank : entrando
          const proximo = LETRAS[RANK_N[atual]! + 1]
          const podeSubir =
            !gastoAqui && proximo && proximo !== 'N' && livresDe(proximo as 'A' | 'E' | 'M') > 0
          const pisoRegra = card.periciasPisoRegra[nome] ?? 'N'
          const states = {} as Record<RankLetter, RankStateKey>
          for (const l of LETRAS) {
            const i = RANK_N[l]!
            const deRegra = i <= RANK_N[pisoRegra]! && l !== 'N'
            if (i < RANK_N[atual]!) states[l] = l === 'N' ? 'passN' : deRegra ? 'ruleSlot' : 'selSlot'
            else if (i === RANK_N[atual]!)
              states[l] = l === 'N' ? 'selN' : gastoAqui ? 'sel' : deRegra ? 'selRule' : 'selSlot'
            else states[l] = 'off'
          }
          const clicaveis = new Set<RankLetter>()
          if (gastoAqui) clicaveis.add(gastoAqui.rank)
          if (podeSubir) clicaveis.add(proximo!)
          return (
            <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AttrBadge ic={ATTR_EMOJI[atributoDe(nome)] ?? ''} at={atributoDe(nome)} />
              <ItemHover doc={docDe(`[[${nome}]]`)} fullBody style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nome}
                  {gastoAqui?.planejado ? (
                    <span style={mono({ fontSize: 8.5, color: 'var(--muted)', marginLeft: 6 })}>plano</span>
                  ) : null}
                </span>
              </ItemHover>
              <RankBtns
                states={states}
                disabledRanks={LETRAS.filter((l) => !clicaveis.has(l))}
                onPick={(letter) => {
                  if (gastoAqui && letter === gastoAqui.rank) {
                    if (!gastoAqui.planejado) desfazPericia(nome, gastoAqui.rank)
                    desregistrar('pericia', nome, gastoAqui.rank)
                    otimistaRemove('pericia', nome, gastoAqui.rank)
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
                    doc={docDe(g.link)}
                    sufixo={`${g.rank} · ${g.escola}${g.planejado ? ' · plano' : ''}`}
                  />
                  <button
                    aria-label={`Remover ${linkLabel(g.link)}`}
                    onClick={() => {
                      if (!g.planejado) desfazMagia(g.escola, g.link)
                      desregistrar('magia', g.link)
                      otimistaRemove('magia', g.link)
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
              const podeAdd = livresDe(rank) > 0
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
                      podeAdd,
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

  const oportunidadesDe = (card: LevelCard): Array<{ nome: string; rank: 'E' | 'M'; opts: string[] }> => {
    const out: Array<{ nome: string; rank: 'E' | 'M'; opts: string[] }> = []
    for (const g of card.gastos.pericias) {
      if (g.rank !== 'E' && g.rank !== 'M') continue
      const row = ((fmPath(dfm, 'Pericias', 'Lista') ?? []) as Row[]).find((r) => String(r.Nome) === g.nome)
      const campo = g.rank === 'E' ? 'Especializacao' : 'Maestria'
      if (String(row?.[campo] ?? '').trim()) continue
      // espec/maestria PLANEJADA da perícia também fecha a oportunidade — sem
      // isso a oferta continuava embaixo da escolha e empilhava a cada clique
      // (#495 "ERRO REPETIÇÃO BASE FIRME")
      const tipoAlvo = g.rank === 'E' ? 'especialidade' : 'maestria'
      const jaAtribuida = (cards ?? []).some((c) =>
        c.gastos.especialidades.some((e) => e.tipo === tipoAlvo && e.pericia === g.nome),
      )
      if (jaAtribuida) continue
      const opts =
        g.rank === 'E'
          ? // mapa chaveado por SLUG (projection listEspecializacoesByPericia) —
            // consultar pelo display quebrava toda perícia acentuada (Enganação)
            (espMaes.especializacoes[slugify(g.nome)] ?? [])
          : (() => {
              // especialidade da perícia: linha do FM ou, se PLANEJADA, o
              // registro atribuído nos cards ≤ nível
              const esp =
                String(row?.Especializacao ?? '') ||
                ((cards ?? [])
                  .filter((c) => c.nivel <= card.nivel)
                  .flatMap((c) => c.gastos.especialidades)
                  .find((e) => e.tipo === 'especialidade' && e.pericia === g.nome)?.alvo ??
                  '')
              // maestrias por ESPECIALIDADE: chave = basename display (como as
              // competências, HabilidadesTab espBase)
              const espBase = esp ? (wikiTarget(esp).split('/').pop() ?? '') : ''
              return espBase ? (espMaes.maestriasByEspecialidade[espBase] ?? []) : []
            })()
      if (opts.length) out.push({ nome: g.nome, rank: g.rank, opts })
    }
    return out
  }

  const editorSelecoesNivel = (card: LevelCard, grupo?: string) => {
    const escolhasNormais = card.escolhas.filter(
      (c) => !c.isSubclass && (!grupo || (c.label || 'Seleção') === grupo),
    )
    // Elegibilidade RETROATIVA (mesma regra das perícias/técnicas): alvo
    // segurado por escolha de nível FUTURO é selecionável aqui — escolher
    // MOVE a linha (o writeChoicePick dedupa por alvo) e o futuro esvazia.
    // pick EFETIVO de uma escolha: real quando desbloqueada, senão o PLANO —
    // as duas fontes contam pra exclusão de irmãs e pra liberação (#504)
    const efetivoDe = (e: TimelineChoice): string | null =>
      e.gateLevel <= nivelAtual ? pickRealDe(e) : (plano[e.choiceKey] ?? null)
    const liberadas = new Set<string>()
    for (const cc of cards ?? []) {
      for (const e of cc.escolhas) {
        if (e.isSubclass || e.gateLevel <= card.nivel) continue
        if (e.pick) liberadas.add(wikiTarget(e.pick))
        const efet = efetivoDe(e)
        if (efet) liberadas.add(wikiTarget(efet))
      }
    }
    // Linha com tag Escolha de pai MORTO (formato antigo — ex.: a Espreitadora
    // do Leonel com Escolha.[[Forma Feral]], que não é pai de escolha viva):
    // ninguém a reivindica, então também fica selecionável; escolher MOVE e
    // retagueia a linha pro pai canônico (#501).
    const paisVivos = new Set<string>()
    for (const cc of cards ?? []) for (const e of cc.escolhas) paisVivos.add(baseDe(`[[${e.sourceNote}]]`))
    const alvosVistos = new Set<string>()
    for (const c of escolhasNormais) {
      const t = c.targetRaw ?? 'Habilidades.Lista'
      if (alvosVistos.has(t)) continue
      alvosVistos.add(t)
      for (const row of (fmPath(fm, ...t.split('.')) ?? []) as Row[]) {
        const ent = Object.entries(row)
        if (ent.length !== 1) continue
        const [alvo, fonte] = ent[0]!
        const m = typeof fonte === 'string' ? /^Escolha(?:\.\d+)?\.\[\[(.+?)\]\]$/.exec(fonte) : null
        if (m && !paisVivos.has(baseDe(`[[${m[1]}]]`))) liberadas.add(wikiTarget(alvo))
      }
    }
    const valorDe = (c: TimelineChoice) =>
      c.gateLevel <= nivelAtual ? pickRealDe(c) : (plano[c.choiceKey] ?? null)
    return (
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
                options={choiceOptionsSiblingAware(
                  toHabChoice(c),
                  // IRMÃS (mesmo pai) de TODA a timeline: essência escolhida
                  // no N1 não re-oferece no N3 (#502) — mesmo filtro das
                  // Competências; as de gate futuro seguem liberáveis (mover)
                  (cards ?? [])
                    .flatMap((cc) => cc.escolhas)
                    .filter((e) => !e.isSubclass && e.sourceNote === c.sourceNote && e.choiceKey !== c.choiceKey)
                    .map((e) => ({ ...toHabChoice(e), pick: efetivoDe(e) })),
                  fm,
                  c.sourceNote,
                  liberadas,
                )}
                onChange={(v) => {
                  // dedup do PLANO por alvo: escolher aqui um alvo planejado
                  // em outra irmã MOVE o plano (nunca duplica, #504)
                  const planoSem = (alvo: string) => {
                    const p = { ...planPicks(model.fm) }
                    for (const [k, val] of Object.entries(p)) {
                      if (k !== c.choiceKey && wikiTarget(val) === wikiTarget(alvo)) delete p[k]
                    }
                    return p
                  }
                  if (desbloqueada) {
                    // v vazio LIMPA (remove a linha do pick real; o display
                    // honra source e não re-preenche com default — #500)
                    writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
                    buildSeq.current += 1
                    if (v) {
                      const p = planoSem(v)
                      if (JSON.stringify(p) !== JSON.stringify(planPicks(model.fm)))
                        escreve('Planejamento.picks', p)
                    }
                  } else if (v) {
                    escreve('Planejamento.picks', { ...planoSem(v), [c.choiceKey]: v })
                  } else {
                    const p = { ...planPicks(model.fm) }
                    delete p[c.choiceKey]
                    escreve('Planejamento.picks', p)
                  }
                }}
                infoDocId={valorDe(c) ? (docDe(valorDe(c)!)?.id ?? null) : null}
              />
            </div>
          )
        })}
      </div>
    )
  }

  // Todos os botões abrem POPUP (report 2026-08-25 item 6) — passado e futuro
  // com a MESMA apresentação; o conteúdo escopado decide real × plano.
  const pendenciasDe = (card: LevelCard): SlotPend[] => {
    const out: SlotPend[] = []
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
        onOpen: () => abrePopup(card.nivel, 'pericia'),
      })
    }
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
        onOpen: () => abrePopup(card.nivel, 'tecnica'),
      })
    }
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
        onOpen: () => abrePopup(card.nivel, 'magia'),
      })
    }
    const oportunidades = oportunidadesDe(card)
    if (oportunidades.length || card.gastos.especialidades.length) {
      out.push({
        pid: `${card.nivel}|esp`,
        label: `ESPEC/MAESTRIAS (${card.gastos.especialidades.length + oportunidades.length})`,
        icon: TIPO_EMOJI.especialidade,
        done: oportunidades.length === 0,
        onOpen: () => abrePopup(card.nivel, 'espec'),
      })
    }
    // Um botão POR TIPO de seleção (label da própria regra): TÉCNICA, FORMA,
    // ESSÊNCIA ELEMENTAL ADEPTA… — o "SELEÇÕES" único misturava tudo e ficava
    // ruim de ver (Leonel, report 2026-08-25).
    const valorDe = (c: TimelineChoice) =>
      c.gateLevel <= nivelAtual ? pickRealDe(c) : (plano[c.choiceKey] ?? null)
    for (const [grupo, lista] of gruposEscolhasDe(card)) {
      const pendentesSel = lista.filter((c) => !valorDe(c))
      out.push({
        pid: `${card.nivel}|sel|${grupo}`,
        label: `${grupo.toUpperCase()} (${lista.length})`,
        icon: emojiDoAlvo(lista[0]?.targetRaw),
        done: pendentesSel.length === 0,
        onOpen: () => abrePopup(card.nivel, 'selecoes', grupo),
      })
    }
    return out
  }

  /** Escolhas normais do card agrupadas pelo LABEL da regra (Essência
   *  Elemental Adepta / Técnica / Forma…) — vocabulário da fonte, nada
   *  inventado. */
  const gruposEscolhasDe = (card: LevelCard): Map<string, TimelineChoice[]> => {
    const grupos = new Map<string, TimelineChoice[]>()
    for (const c of card.escolhas) {
      if (c.isSubclass) continue
      const g = c.label || 'Seleção'
      grupos.set(g, [...(grupos.get(g) ?? []), c])
    }
    return grupos
  }

  /** Basename do alvo do wikilink (comparação estável path/alias). */
  const baseDe = (wl: string): string => wikiTarget(wl).split('/').pop() ?? ''
  /** Nota-fonte de um tag `Regra.[[X]]`/`Escolha(.NN).[[X]]` → basename. */
  const fonteBaseDe = (fonte?: string): string | null => {
    const m = fonte ? /\[\[(.+?)\]\]/.exec(fonte) : null
    return m ? baseDe(`[[${m[1]}]]`) : null
  }
  /** Magias do card concedidas por um PICK de seleção do próprio card — elas
   *  rendem IDENTADAS sob a essência na strip, não como row de "magia
   *  concedida" no topo (report 2026-08-25). */
  const magiasAninhadasDe = (card: LevelCard): Set<string> => {
    const picks = new Set(escolhasPreenchidasDe(card).map((s) => baseDe(s.valor)))
    const out = new Set<string>()
    for (const m of card.magiasRegra) {
      const f = fonteBaseDe(m.fonte)
      if (f && picks.has(f)) out.add(`${m.escola}|${m.link}`)
    }
    return out
  }

  // ESCOLHAS preenchidas viram CHIPS na strip do card (mesma apresentação dos
  // gastos de slot — Leonel: 4 rows gigantes de essência/forma incoerentes com
  // o resto); a edição é pelo botão SELEÇÕES, como os demais tipos.
  const escolhasPreenchidasDe = (
    card: LevelCard,
  ): Array<{ choiceKey: string; valor: string; label: string; plano: boolean }> => {
    const out: Array<{ choiceKey: string; valor: string; label: string; plano: boolean }> = []
    for (const c of card.escolhas) {
      if (c.isSubclass) continue
      const desbloqueada = c.gateLevel <= nivelAtual
      const valor = desbloqueada ? pickRealDe(c) : (plano[c.choiceKey] ?? null)
      if (!valor) continue
      out.push({ choiceKey: c.choiceKey, valor, label: c.label || 'Seleção', plano: !desbloqueada })
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
            doc={docDe(wl)}
            icon={(() => {
              const d = docDe(wl)
              const viaRegistro = linkIconForEntry(d)
              if (viaRegistro) return viaRegistro
              // Ações não têm categoria no mapa — usam o badge de CUSTO,
              // como as Ações de Habilidade da ficha
              const custo = d ? custoDigits((d.frontmatter as Record<string, unknown>)['custo']) : ''
              return custo || undefined
            })()}
            depth={depth}
            expanded={expandidos.has(rid)}
            onToggle={toggleRow}
          />
          {filhosDe(wl).map((f) => linha(f, depth + 1))}
        </div>
      )
    }
    const raizes = todos.filter((wl) => !nomes.has(paiDe(wl) ?? ''))
    const aninhadas = magiasAninhadasDe(card)
    return (
      <>
        {raizes.map((wl) => linha(wl, 0))}
        {card.magiasRegra.filter((m) => !aninhadas.has(`${m.escola}|${m.link}`)).map((m) => {
          const rid = `ganho|${card.nivel}|${m.escola}|${m.link}`
          return (
            <PbRow
              key={rid}
              rid={rid}
              kickerTxt={`Magia concedida · ${m.escola}${m.secundaria ? ' (2ª)' : ''}`}
              valor={linkLabel(m.link)}
              doc={docDe(m.link)}
              icon={(() => {
                const d = docDe(m.link)
                return (
                  linkIconForEntry(d) ||
                  (d ? magiaEmoji(d.frontmatter as Record<string, unknown>) : TIPO_EMOJI.magia)
                )
              })()}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={mono({ fontSize: 10, color: 'var(--muted)', flex: 1, minWidth: 200 })}>
          Roadmap até o nível {NIVEL_MAX_PLANEJAMENTO} — nível atual{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{nivelAtual}</span>. Slots e escolhas
          de níveis futuros ficam no plano e entram sozinhos quando o nível subir.
        </div>
        {/* Reset do PLANO (picks + registros de nível) — a ficha real fica
            intocada; a atribuição volta pro earliest-fit limpo. Two-step. */}
        <button
          onClick={() => {
            if (!confirmaLimpar) {
              setConfirmaLimpar(true)
              return
            }
            escreve('Planejamento', {})
            setConfirmaLimpar(false)
          }}
          onBlur={() => setConfirmaLimpar(false)}
          style={mono({
            fontSize: 9,
            fontWeight: 700,
            padding: '4px 10px',
            cursor: 'pointer',
            background: confirmaLimpar ? 'color-mix(in srgb,var(--red) 18%,transparent)' : 'transparent',
            border: `1px solid ${confirmaLimpar ? 'var(--red)' : 'var(--line2)'}`,
            color: confirmaLimpar ? 'var(--red)' : 'var(--muted)',
            clipPath: clip(5),
          })}
        >
          {confirmaLimpar ? 'CONFIRMAR LIMPEZA DO PLANO?' : 'LIMPAR PLANO'}
        </button>
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
            icon={linkIconForEntry(r.doc ?? undefined) || r.icon}
            expanded={expandidos.has(r.rid)}
            onToggle={toggleRow}
          />
        ))}
      </div>

      {cards.map((card) => {
        const atual = card.nivel === nivelAtual
        const futuro = card.nivel > nivelAtual
        const pendencias = pendenciasDe(card)
        const selecoes = escolhasPreenchidasDe(card)
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
                  <SlotButton key={p.pid} ativo={popup?.nivel === card.nivel} onClick={p.onOpen}>
                    {p.icon} {p.label}
                    {p.done ? (
                      <span style={{ color: 'var(--accent)', marginLeft: 6, opacity: 0.8 }}>✓</span>
                    ) : null}
                  </SlotButton>
                ))}
              </div>
            ) : null}
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
                    <PlanChip wl={link} doc={docDe(link)} />
                    <span style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>{adds.join(' · ')}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {arvoreGanhos(card)}
            {(() => {
              // ESCOLHAS agrupadas por TIPO, uma linha cada (report 2026-08-25):
              // PERÍCIAS / TÉCNICAS / MAGIAS / ESPEC/MAESTRIAS + um grupo por
              // label de seleção (essências com as magias concedidas identadas).
              const linhas: ReactNode[] = []
              const linha = (chave: string, kickerTxt: string, chips: ReactNode[], sub?: ReactNode) => {
                if (!chips.length) return
                linhas.push(
                  <div key={chave} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={kicker}>{kickerTxt}</span>
                      {chips}
                    </div>
                    {sub}
                  </div>,
                )
              }
              linha(
                'per',
                'PERÍCIAS',
                card.gastos.pericias.map((g) => (
                  <PlanChip
                    key={`p|${g.nome}|${g.rank}`}
                    wl={`[[${g.nome}]]`}
                    doc={docDe(`[[${g.nome}]]`)}
                    fallbackIcon={TIPO_EMOJI.pericia}
                    sufixo={`${g.rank}${g.fonte === 'Passado' ? ' · Passado' : ''}${g.planejado ? ' · plano' : ''}`}
                  />
                )),
              )
              linha(
                'tec',
                'TÉCNICAS',
                card.gastos.tecnicas.map((g) => (
                  <PlanChip
                    key={`t|${g.link}`}
                    wl={g.link}
                    doc={docDe(g.link)}
                    fallbackIcon={TIPO_EMOJI.tecnica}
                    sufixo={`${g.rank}${g.planejado ? ' · plano' : ''}`}
                  />
                )),
              )
              linha(
                'mag',
                'MAGIAS',
                card.gastos.magias.map((g) => (
                  <PlanChip
                    key={`m|${g.escola}|${g.link}`}
                    wl={g.link}
                    doc={docDe(g.link)}
                    fallbackIcon={(() => {
                      const d = docDe(g.link)
                      return d ? magiaEmoji(d.frontmatter as Record<string, unknown>) : TIPO_EMOJI.magia
                    })()}
                    sufixo={`${g.rank}${g.secundaria ? ' (2ª)' : ''}${g.planejado ? ' · plano' : ''}`}
                  />
                )),
              )
              linha(
                'esp',
                'ESPEC/MAESTRIAS',
                card.gastos.especialidades.map((f) => (
                  <PlanChip
                    key={`e|${f.pericia}|${f.alvo}`}
                    wl={f.alvo}
                    doc={docDe(f.alvo)}
                    fallbackIcon={f.tipo === 'especialidade' ? TIPO_EMOJI.especialidade : TIPO_EMOJI.maestria}
                    sufixo={f.pericia}
                  />
                ))
              )
              for (const [grupo] of gruposEscolhasDe(card)) {
                const picks = selecoes.filter((s) => s.label === grupo)
                const comMagias = picks
                  .map((s) => ({
                    s,
                    magias: card.magiasRegra.filter((m) => fonteBaseDe(m.fonte) === baseDe(s.valor)),
                  }))
                  .filter((x) => x.magias.length)
                linha(
                  `sel|${grupo}`,
                  grupo.toUpperCase(),
                  picks.map((s) => (
                    <PlanChip
                      key={`s|${s.choiceKey}`}
                      wl={s.valor}
                      doc={docDe(s.valor)}
                      fallbackIcon={TIPO_EMOJI.selecao}
                      sufixo={s.plano ? 'plano' : undefined}
                    />
                  )),
                  comMagias.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {comMagias.map(({ s, magias }) => (
                        <div
                          key={`sub|${s.choiceKey}`}
                          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 18 }}
                        >
                          <span style={mono({ fontSize: 8.5, color: 'var(--muted)' })}>↳ {linkLabel(s.valor)}</span>
                          {magias.map((m) => (
                            <PlanChip
                              key={`sm|${m.escola}|${m.link}`}
                              wl={m.link}
                              doc={docDe(m.link)}
                              fallbackIcon={(() => {
                                const d = docDe(m.link)
                                return d ? magiaEmoji(d.frontmatter as Record<string, unknown>) : TIPO_EMOJI.magia
                              })()}
                              sufixo={m.escola}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : undefined,
                )
              }
              return linhas.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{linhas}</div>
              ) : null
            })()}
          </div>
        )
      })}
      {popup ? (
        <Modal
          titulo={`${
            popup.tipo === 'pericia'
              ? `${TIPO_EMOJI.pericia} INCREMENTOS DE PERÍCIA`
              : popup.tipo === 'magia'
                ? `${TIPO_EMOJI.magia} MAGIAS`
                : popup.tipo === 'tecnica'
                  ? `${TIPO_EMOJI.tecnica} TÉCNICAS`
                  : popup.tipo === 'espec'
                    ? `${TIPO_EMOJI.especialidade} ESPEC/MAESTRIAS`
                    : `${TIPO_EMOJI.selecao} ${(popup.grupo ?? 'Seleções').toUpperCase()}`
          } — NÍVEL ${popup.nivel}`}
          onClose={() => setPopup(null)}
        >
          {(() => {
            const grants = (cards?.[popup.nivel - 1]?.slotGrants ?? []).filter((g) =>
              popup.tipo === 'pericia'
                ? g.ns === 'Perícia'
                : popup.tipo === 'magia'
                  ? g.ns === 'Magia'
                  : popup.tipo === 'tecnica'
                    ? g.ns === 'Técnica'
                    : false,
            )
            return grants.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>SLOTS DESTE NÍVEL VÊM DE</span>
                {grants.map((g) => (
                  <span key={`${g.link}|${g.rank}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <PlanChip wl={g.link} doc={docDe(g.link)} sufixo={`+${g.rank}`} />
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
            // sem linha de "contexto travado" — a própria grade mostra os
            // ranks passados travados; a FONTE dos slots do nível está no
            // cabeçalho "SLOTS DESTE NÍVEL VÊM DE" acima
            if (popup.tipo === 'pericia') return editorPericiasNivel(cardPopup)
            if (popup.tipo === 'magia') {
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
            }
            if (popup.tipo === 'tecnica') return editorTecnicasNivel(cardPopup)
            if (popup.tipo === 'espec') return editorEspecNivel(cardPopup, oportunidadesDe(cardPopup))
            return editorSelecoesNivel(cardPopup, popup.grupo)
          })()}
        </Modal>
      ) : null}
    </div>
  )
}
