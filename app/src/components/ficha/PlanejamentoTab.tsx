// Aba PLANEJAMENTO da Biografia (docs/plano-planejamento-por-nivel.md) —
// timeline vertical nível 1..10 estilo Pathbuilder: cada card mostra os
// GANHOS do nível (habilidades/técnicas/magias por regra, slots, escalares),
// os GASTOS atribuídos (earliest-fit, level-timeline.ts) e as ESCOLHAS cujo
// gate abre ali. Escolhas de nível ≤ atual editam pelo caminho EXISTENTE
// (writeChoicePick); nível > atual grava no bloco FM `Planejamento` (inerte
// pra engine — nenhum leitor de regras toca a chave; plugin preserva via
// rawKept). Ao subir o nível, escolhas recém-desbloqueadas puxam o pick do
// plano automaticamente (se ainda válido).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import {
  buildLevelTimeline,
  NIVEL_MAX_PLANEJAMENTO,
  type LevelCard,
  type TimelineChoice,
} from '../../rules/level-timeline'
import { SelectBox, writeChoicePick, type HabChoice } from './HabilidadesTab'
import { choiceOptionsSiblingAware } from './HabilidadesTab'
import type { HeroRefs } from './useHeroRefs'
import { fmPath, wikiTarget } from './hero-model'
import { linkLabel } from '../../markdown/dataview-value'

const mono = (extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: 'var(--mono)',
  letterSpacing: '.08em',
  ...extra,
})
const clip = (n: number) =>
  `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, ${n}px 100%, 0 calc(100% - ${n}px))`

const kicker: CSSProperties = mono({ fontSize: 9.5, color: 'var(--muted)', fontWeight: 700 })

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Pick planejado (nível futuro) salvo em `Planejamento.picks[choiceKey]`. */
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

function SlotChips({ label, d }: { label: string; d: { B: number; A: number; E: number; M: number } }) {
  const parts = (['B', 'A', 'E', 'M'] as const).filter((r) => d[r] > 0).map((r) => `+${d[r]} ${r}`)
  if (!parts.length) return null
  return (
    <span style={mono({ fontSize: 10, color: 'var(--accent)', fontWeight: 700 })}>
      {label} {parts.join(' · ')}
    </span>
  )
}

function LinkChip({ wl }: { wl: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--blue)',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        padding: '1px 8px',
        clipPath: clip(4),
      }}
    >
      {linkLabel(wl) || wl}
    </span>
  )
}

export function PlanejamentoPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'planejamento')
  const fm = model.fm
  const nivelAtual = Math.max(1, Math.min(NIVEL_MAX_PLANEJAMENTO, num(fm['Nível'] ?? fm['Nivel']) || 1))
  const [cards, setCards] = useState<LevelCard[] | null>(null)
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

  // Sync do plano ⇄ picks ao (re)abrir com nível novo:
  //  • gate ≤ nível, choice SEM pick, plano tem pick ainda válido → aplica
  //    pelo caminho existente e tira do plano;
  //  • gate > nível, choice COM pick salvo → fotografa no plano (restauração
  //    fiel quando o nível voltar a subir). Idempotente.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, nivelAtual])

  if (!cards) {
    return <div style={mono({ fontSize: 11, color: 'var(--muted)', padding: '18px 4px' })}>Projetando níveis…</div>
  }

  const plano = planPicks(fm)

  const renderEscolha = (c: TimelineChoice) => {
    const desbloqueada = c.gateLevel <= nivelAtual
    const pickPlanejado = plano[c.choiceKey] ?? null
    const valor = desbloqueada ? (c.pick ?? '') : (pickPlanejado ?? '')
    const onChange = (v: string) => {
      if (!v) return
      if (desbloqueada) {
        writeChoicePick(model, catalog, refs, c.sourceNote, toHabChoice(c), v)
      } else {
        model.set('Planejamento.picks', { ...planPicks(model.fm), [c.choiceKey]: v })
      }
    }
    return (
      <div key={c.choiceKey} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={kicker}>
          {c.isSubclass ? 'SUBCLASSE' : (c.label || 'ESCOLHA').toUpperCase()} · {c.sourceNote}
          {!desbloqueada ? ' · PLANO' : ''}
        </span>
        {c.isSubclass ? (
          // Subclasse edita no cartão do Perfil (caminho próprio) — aqui exibe.
          <span style={{ fontSize: 13, fontWeight: 600, color: valor ? 'var(--blue)' : 'var(--muted)' }}>
            {linkLabel(valor) || '(não definido)'}
          </span>
        ) : (
          <SelectBox
            ariaLabel={`${c.label || 'Escolha'} (nível ${c.gateLevel})`}
            value={valor}
            options={choiceOptionsSiblingAware(toHabChoice(c), [], fm, c.sourceNote)}
            onChange={onChange}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={mono({ fontSize: 10, color: 'var(--muted)' })}>
        Planejamento até o nível {NIVEL_MAX_PLANEJAMENTO} — nível atual{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{nivelAtual}</span>. Escolhas de
        níveis futuros ficam guardadas no plano e entram sozinhas quando o nível subir.
      </div>
      {cards.map((card) => {
        const atual = card.nivel === nivelAtual
        const futuro = card.nivel > nivelAtual
        const temAlgo =
          card.habilidades.length ||
          card.tecnicasRegra.length ||
          card.acoesRegra.length ||
          card.magiasRegra.length ||
          card.escolhas.length ||
          card.escalares.length ||
          card.gastos.tecnicas.length ||
          card.gastos.pericias.length ||
          card.gastos.magias.length ||
          Object.values(card.slots).some((s) => s.B + s.A + s.E + s.M > 0)
        return (
          <div
            key={card.nivel}
            data-nivel={card.nivel}
            style={{
              border: `1px solid ${atual ? 'color-mix(in srgb,var(--accent) 55%,var(--line))' : 'var(--line)'}`,
              background: atual ? 'color-mix(in srgb,var(--accent) 6%,var(--panel))' : 'var(--panel)',
              opacity: futuro ? 0.72 : 1,
              clipPath: clip(10),
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={mono({ fontSize: 12, fontWeight: 700, color: atual ? 'var(--accent)' : 'var(--text)' })}>
                NÍVEL {card.nivel}
              </span>
              {atual ? <span style={mono({ fontSize: 9, color: 'var(--accent)' })}>← ATUAL</span> : null}
              {futuro ? <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>PLANO</span> : null}
              <span style={{ flex: 1 }} />
              <SlotChips label="PERÍCIAS" d={card.slots.pericias} />
              <SlotChips label="TÉCNICAS" d={card.slots.tecnicas} />
              <SlotChips label="MAGIAS" d={card.slots.magias} />
            </div>
            {!temAlgo ? (
              <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>— sem mudanças neste nível —</span>
            ) : null}
            {card.habilidades.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>HABILIDADES</span>
                {card.habilidades.map((l) => (
                  <LinkChip key={l} wl={l} />
                ))}
              </div>
            ) : null}
            {card.tecnicasRegra.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>TÉCNICAS (REGRA)</span>
                {card.tecnicasRegra.map((l) => (
                  <LinkChip key={l} wl={l} />
                ))}
              </div>
            ) : null}
            {card.acoesRegra.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>AÇÕES</span>
                {card.acoesRegra.map((l) => (
                  <LinkChip key={l} wl={l} />
                ))}
              </div>
            ) : null}
            {card.magiasRegra.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>MAGIAS</span>
                {card.magiasRegra.map((m) => (
                  <span key={`${m.escola}|${m.link}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <LinkChip wl={m.link} />
                    <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>
                      {m.escola}
                      {m.secundaria ? ' (2ª)' : ''}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {card.gastos.tecnicas.length || card.gastos.pericias.length || card.gastos.magias.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={kicker}>GASTOS DO NÍVEL</span>
                {card.gastos.tecnicas.map((g) => (
                  <span key={`t|${g.link}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <LinkChip wl={g.link} />
                    <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>Técnica {g.rank}</span>
                  </span>
                ))}
                {card.gastos.pericias.map((g) => (
                  <span key={`p|${g.nome}|${g.rank}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <LinkChip wl={g.nome} />
                    <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>
                      Perícia {g.rank}
                      {g.fonte === 'Passado' ? ' (Passado)' : ''}
                    </span>
                  </span>
                ))}
                {card.gastos.magias.map((g) => (
                  <span key={`m|${g.escola}|${g.link}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <LinkChip wl={g.link} />
                    <span style={mono({ fontSize: 9, color: 'var(--muted)' })}>
                      Magia {g.rank} · {g.escola}
                      {g.secundaria ? ' (2ª)' : ''}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {card.escalares.length ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {card.escalares.map((e) => (
                  <span key={e.label} style={mono({ fontSize: 10, color: 'var(--muted)' })}>
                    {e.label} {e.de} → <span style={{ color: 'var(--text)', fontWeight: 700 }}>{e.para}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {card.escolhas.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{card.escolhas.map(renderEscolha)}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
