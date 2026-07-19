// BLOCO DE COMBAT-MARKER (#249, F5 do épico #243) — renderiza o roster de um
// fence ```combat-marker```/```combat-marker-small``` (o mesmo bloco que o
// pleitost-autosheet usa nas notas de combate) + a dificuldade computada, na
// linguagem visual do app. É a UI compartilhada entre:
//   - o FENCE (CombatMarkerFence em markdown/fence-registry) que substitui o
//     <pre> cru quando o body embute o bloco;
//   - a CombateView (página de um doc `type: Combate` no compêndio).
//
// REUSO (nada reimplementado): parseCombatMarkerBlocks/splitBlockSource +
// parseRosterLine de src/mestre/combat-marker.ts (port do pleitost-sync/autosheet)
// pra parsear o roster, e computeEncounterDifficulty/…ByLevel de
// src/mestre/encounter-compute.ts (port verbatim do compute do autosheet) pra a
// dificuldade — os MESMOS módulos que o CriadorAventura/CriadorCombate usam. Os
// wikilinks de monstro são resolvidos contra o catálogo pra ler Tier/Modificador
// da ficha (resolveRosterEntries em src/mestre/roster.ts, fonte única).
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import { parseCombatMarkerBlocks, splitBlockSource } from './combat-marker'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  DIFFICULTY_TONE_COLORS,
  TONE_EMOJI_KEY,
} from './encounter-compute'
import { combatantsFrom, resolveRosterEntries, rosterMonsterIds } from './roster'
import type { EncounterRoster } from '../data/session-repo/contract'
import { EncounterLevelBar } from '../components/mestre/ui'
import { TipProvider, TipHover } from '../components/ficha/tooltips'
import { partyDifficultyTipHtml } from './difficulty-tip'
import type { SessionCharacter } from '../data/session-repo/contract'
import { useDetail } from '../data/detail-context'
import { useSettings } from '../settings'
import { useAssetIndex } from '../data/assets'
import { creatureImageUrl } from '../data/creature-image'
import { fmPath, num } from '../components/ficha/hero-model'
import { tokens } from '../components/ficha/registry'
import {
  SPEED_EMOJI,
  SPEED_LABEL,
  STATE_EMOJI,
  tiersFor,
  type SpeedTier,
} from '../data/initiative-blocks'
import {
  getMonsterPrep,
  setMonsterPrep,
  useEncounterSpeedsVersion,
} from '../data/encounter-speeds'
import { useSessionRepo, useSessionUser } from '../data/session-repo/provider'
import { useLiveSession } from '../data/session-repo/live-session'
import { addRosterToInitiative } from '../data/session-repo/encounter-actions'

/** Parseia o roster de um fence combat-marker cru (só o conteúdo entre as
 *  cercas). Reusa splitBlockSource + parseRosterLine (combat-marker.ts): o
 *  state @estado/linhas de iniciativa são ignorados, como no sync. */
function parseFenceRoster(code: string): EncounterRoster {
  // parseCombatMarkerBlocks espera markdown com as cercas; aqui já temos só o
  // corpo do fence, então split direto (o markdown renderer entrega sem cercas).
  const { rosterLines } = splitBlockSource(code)
  // reusa o pipeline do parser embrulhando de volta num bloco pra 1 caminho só
  const wrapped = ['```combat-marker', ...rosterLines, '```'].join('\n')
  const parsed = parseCombatMarkerBlocks(wrapped)
  return parsed.ok ? parsed.roster : { entries: [] }
}

/** Níveis dos HERÓIS da mesa atual (sem companheiro animal nem NPC) — pra a
 *  badge de dificuldade "da sua mesa" (pedido do GM ao escolher combates). */
function partyHeroLevels(chars: readonly SessionCharacter[]): number[] {
  return chars
    .filter((c) => c.summary?.family === 'Heroi')
    .map((c) => c.summary?.nivel)
    .filter((n): n is number => typeof n === 'number' && n > 0)
}

/** Roster + dificuldade de um combate. `code` = corpo cru de um fence
 *  combat-marker; `roster` = roster já parseado (a CombateView passa o do doc). */
export function CombatMarkerBlock({
  code,
  roster: rosterProp,
  encounterPath,
}: {
  code?: string
  roster?: EncounterRoster
  /** Caminho do doc do encontro (doc.id) — chave do prep de velocidade/estado
   *  por monstro. Só a página de Combate passa; no fence cru fica undefined
   *  (aí a atribuição do GM não aparece). */
  encounterPath?: string
}) {
  const catalog = useCatalog()
  const detail = useDetail()
  const assets = useAssetIndex()
  const { mestre, mostrarDificuldade } = useSettings()
  useEncounterSpeedsVersion() // re-render quando o GM muda velocidade/estado
  const repo = useSessionRepo()
  const user = useSessionUser()
  const live = useLiveSession()
  const roster = useMemo<EncounterRoster>(
    () => rosterProp ?? parseFenceRoster(code ?? ''),
    [rosterProp, code],
  )

  const monsterIds = useMemo(() => rosterMonsterIds(roster, catalog), [roster, catalog])
  const monsterDocs = useDocs(monsterIds)
  const resolvidas = useMemo(
    () => resolveRosterEntries(roster, catalog, monsterDocs),
    [roster, catalog, monsterDocs],
  )

  const combatants = useMemo(
    () => combatantsFrom(resolvidas.flatMap((r) => (r.item ? [r.item] : [])), []),
    [resolvidas],
  )
  const byLevel = useMemo(() => computeEncounterDifficultyByLevel(combatants), [combatants])

  // Badge de dificuldade "da SUA MESA" (só GM): dificuldade contra os heróis
  // REAIS da mesa ativa (sem companheiro animal). Nula sem mesa/heróis.
  const partyDif = useMemo(() => {
    if (!mestre || !mostrarDificuldade) return null
    const heroLevels = partyHeroLevels(live?.characters ?? [])
    if (heroLevels.length === 0) return null
    const items = resolvidas.flatMap((r) => (r.item ? [r.item] : []))
    return { result: computeEncounterDifficulty(combatantsFrom(items, heroLevels)), heroLevels }
  }, [mestre, mostrarDificuldade, live, resolvidas])

  // Instâncias INDIVIDUAIS de monstro (qty → N banners), com a chave estável do
  // prep (encounter-speeds) e vida/imagem lidas do doc do bestiário.
  const instances = useMemo(
    () =>
      resolvidas.flatMap((r) => {
        const item = r.item
        const doc = item?.sourceId ? monsterDocs?.get(item.sourceId) : undefined
        const base = item?.sourcePath ?? r.entry.label
        const qty = Math.max(1, r.entry.qty)
        return Array.from({ length: qty }, (_, i) => ({
          key: `${base}#${i + 1}`,
          label: r.entry.label,
          n: i + 1,
          qty,
          tier: item?.tier ?? null,
          modificador: item?.modificador ?? null,
          docId: item?.sourceId ?? null,
          img: doc ? creatureImageUrl(doc, assets, true) : null,
          vit: doc ? num(fmPath(doc.frontmatter, 'Vida', 'Vitalidade')) : 0,
        }))
      }),
    [resolvidas, monsterDocs, assets],
  )

  // #266: pré-seleção de máscara dos NPCs ao adicionar à sessão. "disfarçado"
  // é o DEFAULT do combat-tracker (NPC nasce mascarado), então o toggle começa
  // marcado; "invisível" começa desmarcado (NPC visível na lista).
  const [invisivel, setInvisivel] = useState(false)
  const [disfarcado, setDisfarcado] = useState(true)
  const [status, setStatus] = useState('')

  // Gate do "Adicionar à sessão": Modo Mestre + servidor + sala ativa (mesmo
  // gate do Criador de Combate / #229). Sem isso, o bloco fica só de leitura.
  const podeAdicionar = mestre && !!repo && !!user && !!live

  if (roster.entries.length === 0) return null

  const adicionar = async () => {
    if (!repo || !user || !live) return
    await addRosterToInitiative({
      repo,
      catalog,
      live,
      memberId: user.id,
      name: 'Combate',
      entries: roster.entries,
      mask: { invisivel, disfarcado },
    })
    const total = roster.entries.reduce((n, e) => n + Math.max(1, e.qty), 0)
    setStatus(`${total} combatente${total === 1 ? '' : 's'} adicionado${total === 1 ? '' : 's'} à iniciativa.`)
  }

  return (
    <TipProvider>
      <div className="combat-marker">
        {/* ── barrinhas de dificuldade no TOPO com tooltip explicativo (de onde
            vem a classificação: limiares + pontos). Ocultável no CONFIG. ── */}
        {mostrarDificuldade ? (
          <div className="combat-difficulty-bars" data-combat-difficulty-bars="">
            <span className="combat-difficulty-bars-label">{'// DIFICULDADE'}</span>
            <EncounterLevelBar byLevel={byLevel} combatants={combatants} />
          </div>
        ) : null}
        {/* Badge da SUA MESA (só GM): dificuldade contra os heróis reais da mesa
            ativa. Tooltip explica com a composição real do grupo. */}
        {partyDif ? (
          <div className="combat-party-dif" data-combat-party-dif="">
            <span className="combat-difficulty-bars-label">{'// SUA MESA'}</span>
            <TipHover html={partyDifficultyTipHtml(partyDif.result, combatants, partyDif.heroLevels)}>
              <span
                className="combat-party-badge"
                style={{
                  color: DIFFICULTY_TONE_COLORS[partyDif.result.toneClass],
                  borderColor: DIFFICULTY_TONE_COLORS[partyDif.result.toneClass],
                  background: `color-mix(in srgb,${DIFFICULTY_TONE_COLORS[partyDif.result.toneClass]} 14%,transparent)`,
                }}
              >
                {tokens.emojis.dificuldade[TONE_EMOJI_KEY[partyDif.result.toneClass]]} {partyDif.result.label}
              </span>
            </TipHover>
          </div>
        ) : null}

      {/* ── BANNERS por monstro (um por instância): imagem + tier/vida/
          modificador/velocidade/estado (emoji). No Modo Mestre, o GM define a
          velocidade de iniciativa e o estado inicial por monstro. ── */}
      <div className="combat-roster">
        <div className="kicker">{'// MONSTROS'}</div>
        <div className="combate-monstros">
          {instances.map((m) => {
            const prep = getMonsterPrep(encounterPath ?? '', m.key)
            const docId = m.docId
            const abrir = docId && detail ? () => detail.open({ kind: 'resumo', id: docId }) : null
            const podeEditar = mestre && !!encounterPath
            return (
              <div key={m.key} className="combate-monstro-banner" data-monstro-banner="">
                <span
                  className="combate-monstro-img"
                  aria-hidden
                  style={m.img ? { backgroundImage: `url("${m.img}")` } : undefined}
                >
                  {m.img ? null : tokens.emojis.subcategoria.Monstro}
                </span>
                <div className="combate-monstro-info">
                  <span
                    className={`combate-monstro-nome${abrir ? ' is-clickable' : ''}`}
                    {...(abrir
                      ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          onClick: abrir,
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              abrir()
                            }
                          },
                          title: `Ver ficha-resumo de ${m.label}`,
                        }
                      : {})}
                  >
                    {m.label}
                    {m.qty > 1 ? ` #${m.n}` : ''}
                  </span>
                  <span className="combate-monstro-stats">
                    {m.tier != null ? (
                      <span className="combate-monstro-stat" title="Tier">
                        T{m.tier}
                      </span>
                    ) : null}
                    {m.vit > 0 ? (
                      <span className="combate-monstro-stat" title="Vitalidade">
                        ❤️ {m.vit}
                      </span>
                    ) : null}
                    {m.modificador ? (
                      <span className="combate-monstro-stat" title="Modificador">
                        {m.modificador}
                      </span>
                    ) : null}
                    <span className="combate-monstro-stat" title="Iniciativa">
                      {prep.tier ? `${SPEED_EMOJI[prep.tier]} ${SPEED_LABEL[prep.tier]}` : '⏱️ a definir'}
                    </span>
                    {prep.escondido ? (
                      <span className="combate-monstro-stat" title="Escondido">
                        {STATE_EMOJI.escondido}
                      </span>
                    ) : null}
                    {prep.disfarcado ? (
                      <span className="combate-monstro-stat" title="Disfarçado">
                        {STATE_EMOJI.disfarcado}
                      </span>
                    ) : null}
                  </span>
                </div>
                {podeEditar ? (
                  <div className="combate-monstro-gm">
                    {/* monstros são inimigos → sem Super Lento (só herói tem). */}
                    {tiersFor('inimigo').map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`combate-vel-btn${prep.tier === t ? ' is-on' : ''}`}
                        title={SPEED_LABEL[t]}
                        onClick={() =>
                          setMonsterPrep(encounterPath!, m.key, { tier: prep.tier === t ? null : (t as SpeedTier) })
                        }
                      >
                        {SPEED_EMOJI[t]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`combate-vel-btn${prep.escondido ? ' is-on' : ''}`}
                      title="Escondido"
                      onClick={() => setMonsterPrep(encounterPath!, m.key, { escondido: !prep.escondido })}
                    >
                      {STATE_EMOJI.escondido}
                    </button>
                    <button
                      type="button"
                      className={`combate-vel-btn${prep.disfarcado ? ' is-on' : ''}`}
                      title="Disfarçado"
                      onClick={() => setMonsterPrep(encounterPath!, m.key, { disfarcado: !prep.disfarcado })}
                    >
                      {STATE_EMOJI.disfarcado}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* ── controles do Mestre (#266): adicionar o roster à iniciativa da
            sessão + toggles invisível/disfarçado. Só aparece no gate GM. ── */}
        {podeAdicionar ? (
          <div className="combat-roster-actions" data-combat-roster-actions="">
            <div className="combat-roster-toggles">
              <label className="combat-roster-toggle">
                <input
                  type="checkbox"
                  checked={invisivel}
                  onChange={(e) => setInvisivel(e.target.checked)}
                  aria-label="Iniciar invisível"
                />
                <span>Iniciar invisível</span>
              </label>
              <label className="combat-roster-toggle">
                <input
                  type="checkbox"
                  checked={disfarcado}
                  onChange={(e) => setDisfarcado(e.target.checked)}
                  aria-label="Iniciar disfarçado"
                />
                <span>Iniciar disfarçado</span>
              </label>
            </div>
            <button
              type="button"
              className="combat-roster-add"
              onClick={() => void adicionar()}
            >
              + Adicionar à sessão
            </button>
          </div>
        ) : null}
        {status ? (
          <div role="status" className="combat-roster-status">
            {status}
          </div>
        ) : null}
      </div>
      </div>
    </TipProvider>
  )
}
