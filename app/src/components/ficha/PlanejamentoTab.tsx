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
    picker: ReactNode
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
    // Perícias: slots do nível menos gastos atribuídos aqui.
    for (const rank of ['A', 'E', 'M'] as const) {
      const usados = card.gastos.pericias.filter((g) => g.rank === rank && g.fonte === 'Slot').length
      for (let i = usados; i < card.slots.pericias[rank]; i++) {
        const pid = `${card.nivel}|per|${rank}|${i}`
        out.push({
          pid,
          label: `PERÍCIA ${GROUP_OF[rank]}`,
          picker: pickerSelect(
            `Perícia ${GROUP_OF[rank]} (nível ${card.nivel})`,
            card.periciasElegiveis[rank].map((n) => ({ value: n, label: n })),
            (nome) =>
              registraEAplica({ nivel: card.nivel, tipo: 'pericia', rank, alvo: nome }, () =>
                aplicaPericia(nome, rank),
              ),
          ),
        })
      }
    }
    // Técnicas.
    for (const rank of ['A', 'E', 'M'] as const) {
      const usados = card.gastos.tecnicas.filter((g) => g.rank === rank).length
      for (let i = usados; i < card.slots.tecnicas[rank]; i++) {
        const pid = `${card.nivel}|tec|${rank}|${i}`
        out.push({
          pid,
          label: `TÉCNICA ${GROUP_OF[rank]}`,
          picker: pickerSelect(
            `Técnica ${GROUP_OF[rank]} (nível ${card.nivel})`,
            (tecnicasElegiveis.get(rank) ?? []).map((wl) => ({ value: wl, label: linkLabel(wl) })),
            (wl) =>
              registraEAplica({ nivel: card.nivel, tipo: 'tecnica', rank, alvo: wl }, () => aplicaTecnica(wl, rank)),
          ),
        })
      }
    }
    // Magias.
    for (const rank of ['B', 'A', 'E', 'M'] as const) {
      const usados = card.gastos.magias.filter((g) => g.rank === rank && !g.secundaria).length
      const grupo = GROUP_OF[rank]!
      for (let i = usados; i < card.slots.magias[rank]; i++) {
        const pid = `${card.nivel}|mag|${rank}|${i}`
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
        out.push({
          pid,
          label: `MAGIA ${grupo}`,
          picker: pickerSelect(
            `Magia ${grupo} (nível ${card.nivel})`,
            opcoes.sort((a, b) => a.label.localeCompare(b.label)),
            (v) => {
              const [escola, wl] = v.split('|') as [string, string]
              registraEAplica({ nivel: card.nivel, tipo: 'magia', rank, alvo: wl, contexto: escola }, () =>
                aplicaMagia(escola, wl, rank),
              )
            },
          ),
        })
      }
    }
    // Especialidades/Maestrias destravadas pelos ranks E/M atribuídos aqui.
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
      if (!opts.length) continue
      const tipo = g.rank === 'E' ? 'especialidade' : 'maestria'
      out.push({
        pid: `${card.nivel}|esp|${g.nome}|${g.rank}`,
        label: `${g.rank === 'E' ? 'ESPECIALIDADE' : 'MAESTRIA'} · ${g.nome}`,
        picker: pickerSelect(
          `${g.rank === 'E' ? 'Especialidade' : 'Maestria'} de ${g.nome} (nível ${card.nivel})`,
          opts.map((wl) => ({ value: wl, label: linkLabel(wl) })),
          (wl) =>
            registraEAplica({ nivel: card.nivel, tipo, alvo: wl, contexto: g.nome }, () =>
              aplicaEspecialidade(g.nome, g.rank === 'E' ? 'Especializacao' : 'Maestria', wl),
            ),
        ),
      })
    }
    // Seleções de habilidade sem pick (gate deste nível).
    for (const c of card.escolhas) {
      if (c.isSubclass) continue
      const desbloqueada = c.gateLevel <= nivelAtual
      const valor = desbloqueada ? c.pick : (plano[c.choiceKey] ?? null)
      if (valor) continue
      out.push({
        pid: `${card.nivel}|sel|${c.choiceKey}`,
        label: `${(c.label || 'SELEÇÃO').toUpperCase()} · ${c.sourceNote}`,
        picker: (
          <SelectBox
            ariaLabel={`${c.label || 'Escolha'} (nível ${c.gateLevel})`}
            value=""
            options={choiceOptionsSiblingAware(toHabChoice(c), [], fm, c.sourceNote)}
            onChange={(v) => {
              if (!v) return
              if (desbloqueada) writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
              else model.set('Planejamento.picks', { ...planPicks(model.fm), [c.choiceKey]: v })
              setPickerAberto(null)
            }}
          />
        ),
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
          kickerTxt={`Perícia ${GROUP_OF[g.rank]}`}
          valor={g.nome}
          doc={refs.refDoc(`[[${g.nome}]]`)}
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
          kickerTxt={`Técnica ${GROUP_OF[g.rank]}`}
          valor={linkLabel(g.link)}
          doc={refs.refDoc(g.link)}
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
          kickerTxt={`Magia ${GROUP_OF[g.rank]} · ${g.escola}${g.secundaria ? ' (2ª)' : ''}`}
          valor={linkLabel(g.link)}
          doc={refs.refDoc(g.link)}
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

  // Tree view dos GANHOS automáticos (↳ sob quem concedeu).
  const arvoreGanhos = (card: LevelCard): ReactNode => {
    const todos = [...card.habilidades, ...card.tecnicasRegra, ...card.acoesRegra]
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', padding: '2px 0' }}>
                {pendencias.map((p) => (
                  <SlotButton key={p.pid} ativo={pickerAberto === p.pid} onClick={() => togglePicker(p.pid)}>
                    ⚙ {p.label}
                  </SlotButton>
                ))}
              </div>
            ) : null}
            {pendencias.map((p) =>
              pickerAberto === p.pid ? (
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
            {arvoreGanhos(card)}
          </div>
        )
      })}
    </div>
  )
}
