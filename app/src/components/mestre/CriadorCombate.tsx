// CRIADOR DE COMBATE do Modo Mestre (#195) — monta um roster com monstros
// reais do bestiário (FM Tier/Modificador do vault-data) + genéricos, mostra
// a dificuldade AO VIVO (port verbatim do compute do autosheet em
// src/mestre/encounter-compute.ts) contra os níveis dos heróis do grupo, e
// envia pra sessão remota ativa via repo.insertEncounter (contrato F1 —
// data/session-repo é só importado, nunca modificado).
// A tela mora numa aba mestre-gated da página CRIATURAS (vide CreaturesPages).
import { useMemo, useState } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import { localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
import { useSessionRepo } from '../../data/session-repo/provider'
import { useLiveSession } from '../../data/session-repo/live-session'
import { useSettings } from '../../settings'
import {
  computeEncounterDifficulty,
  formatDifficultyValue,
  type MonsterModifier,
} from '../../mestre/encounter-compute'
import {
  combatantsFrom,
  parseHeroLevels,
  rosterItemFromDoc,
  toContractRoster,
  type RosterItem,
} from '../../mestre/roster'
import { accentBtnStyle, clip, DifficultyBadge, fieldInputStyle, fieldLabelStyle, sectionStyle } from './ui'

// mesma pasta que a aba BESTIÁRIO da página CRIATURAS lista
const BESTIARIO_FOLDER = 'Sistema/Criaturas/Bestiário'

// Vocabulário do plugin (contributions.ts): sem modificador = Normal/null.
const MODIFICADORES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Normal' },
  { value: 'Competente', label: 'Competente' },
  { value: 'Elite', label: 'Elite' },
  { value: 'Solo', label: 'Solo' },
]

/** Sufixo mono de um item do roster: tier + modificador (dados da ficha,
 *  nada inventado — modificador null não imprime nada). */
function itemMeta(item: RosterItem): string {
  return `T${item.tier}${item.modificador ? ` · ${item.modificador}` : ''}`
}

export function CriadorCombate() {
  const { mestre } = useSettings()
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  const repo = useSessionRepo()
  const live = useLiveSession()

  // bestiário da vault + monstros locais criados pelo GM (mesma fonte da aba
  // BESTIÁRIO — issues #42/#47)
  const bestiario = useMemo(() => {
    const node = catalog.folderByPath.get(BESTIARIO_FOLDER)
    const vault = node ? node.docs.filter((d) => d.basename !== node.name) : []
    return [...vault, ...localEntriesOfKind('Monstro')]
  }, [catalog, version])
  const docs = useDocs(useMemo(() => bestiario.map((e) => e.id), [bestiario]))

  const [items, setItems] = useState<RosterItem[]>([])
  const [selId, setSelId] = useState('')
  const [qty, setQty] = useState('1')
  const [genNome, setGenNome] = useState('')
  const [genTier, setGenTier] = useState('1')
  const [genMod, setGenMod] = useState('')
  const [genQty, setGenQty] = useState('1')
  const [nome, setNome] = useState('Novo Combate')
  const [niveisText, setNiveisText] = useState('1, 1, 1, 1')
  const [status, setStatus] = useState('')

  // gate defensivo — a página CRIATURAS já desabilita a aba sem Modo Mestre
  if (!mestre) return null

  const efetivoSelId = selId || bestiario[0]?.id || ''

  const addMonstro = () => {
    const doc = docs?.get(efetivoSelId)
    if (!doc) return
    const item = rosterItemFromDoc(doc, Number(qty))
    if (!item) return
    setItems((cur) => {
      // mesmo monstro de novo → soma no qty (1 linha por source, como o
      // roster do bloco combat-marker: "- 3 [[Goblin]]")
      const i = cur.findIndex((x) => x.sourceId === item.sourceId)
      if (i >= 0) {
        const next = [...cur]
        const prev = next[i]!
        next[i] = { ...prev, qty: prev.qty + item.qty }
        return next
      }
      return [...cur, item]
    })
  }

  const addGenerico = () => {
    const label = genNome.trim()
    if (!label) return
    const item: RosterItem = {
      sourceId: null,
      sourcePath: null,
      label,
      qty: Math.max(1, Math.floor(Number(genQty)) || 1),
      tier: Number(genTier),
      modificador: (genMod || null) as MonsterModifier,
    }
    setItems((cur) => [...cur, item])
    setGenNome('')
  }

  const niveis = parseHeroLevels(niveisText)
  const result = computeEncounterDifficulty(combatantsFrom(items, niveis))

  // heróis da sessão remota ativa (companheiros excluídos, regra do sync)
  const sessionHeroes = (live?.characters ?? []).filter((c) => c.kind === 'heroi')

  const podeEnviar = !!repo && !!live && items.length > 0 && !!nome.trim()
  const enviar = async () => {
    if (!repo || !live) return
    // snapshot congelado dos heróis no momento do insert (nome + nível) —
    // mesma semântica do SyncEncounterDifficulty do sync (core/encounter.ts:56)
    const heroSnapshot = sessionHeroes.map((h) => ({ nome: h.summary.nome, nivel: h.summary.nivel }))
    await repo.insertEncounter({
      sessionId: live.sessionId,
      // combate montado no app não nasce de nota da vault — sem source path
      sourceNotePath: '',
      name: nome.trim(),
      roster: toContractRoster(items),
      difficulty: { ...result, ...(heroSnapshot.length ? { heroSnapshot } : {}) },
    })
    setStatus(`Combate "${nome.trim()}" adicionado à sessão.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="kicker">{'// CRIADOR DE COMBATE'}</div>

      {/* ── heróis do grupo ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// HERÓIS DO GRUPO'}</div>
        <label>
          <span style={fieldLabelStyle}>NÍVEIS DOS HERÓIS (separados por vírgula)</span>
          <input
            aria-label="Níveis dos heróis"
            value={niveisText}
            onChange={(e) => setNiveisText(e.target.value)}
            style={{ ...fieldInputStyle, width: 220 }}
          />
        </label>
        {sessionHeroes.length ? (
          <button
            type="button"
            onClick={() => setNiveisText(sessionHeroes.map((h) => h.summary.nivel).join(', '))}
            style={accentBtnStyle(true)}
          >
            Usar heróis da sessão ({sessionHeroes.length})
          </button>
        ) : null}
      </div>

      {/* ── montar roster ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// ADICIONAR MONSTROS'}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            <span style={fieldLabelStyle}>MONSTRO DO BESTIÁRIO</span>
            <select
              aria-label="Monstro do bestiário"
              value={efetivoSelId}
              onChange={(e) => setSelId(e.target.value)}
              style={{ ...fieldInputStyle, cursor: 'pointer', minWidth: 220 }}
            >
              {/* #362: monstros AGRUPADOS por Tier 0-3 (fm.Tier), como a aba
                  BESTIÁRIO agrupa a lista — locais/sem tier ficam no fim. */}
              {(() => {
                const tierDe = (id: string): number | null => {
                  const t = Number(docs?.get(id)?.frontmatter['Tier'])
                  return Number.isFinite(t) ? t : null
                }
                const grupos = new Map<number | null, typeof bestiario>()
                for (const e of bestiario) {
                  const t = tierDe(e.id)
                  const arr = grupos.get(t) ?? []
                  arr.push(e)
                  grupos.set(t, arr)
                }
                const tiers = [...grupos.keys()].sort((a, b) =>
                  a === null ? 1 : b === null ? -1 : a - b,
                )
                return tiers.map((t) => (
                  <optgroup key={String(t)} label={t === null ? 'SEM TIER' : `TIER ${t}`}>
                    {grupos
                      .get(t)!
                      .slice()
                      .sort((a, b) => (a.basename ?? a.id).localeCompare(b.basename ?? b.id, 'pt'))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.basename ?? e.id}
                        </option>
                      ))}
                  </optgroup>
                ))
              })()}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>QTD</span>
            <input
              aria-label="Quantidade"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              style={{ ...fieldInputStyle, width: 72 }}
            />
          </label>
          <button
            type="button"
            onClick={addMonstro}
            disabled={!docs || !bestiario.length}
            style={accentBtnStyle(!!docs && bestiario.length > 0)}
          >
            + Adicionar
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            <span style={fieldLabelStyle}>GENÉRICO (SEM FICHA)</span>
            <input
              aria-label="Nome do genérico"
              placeholder="Ex.: Goblin Líder"
              value={genNome}
              onChange={(e) => setGenNome(e.target.value)}
              style={{ ...fieldInputStyle, minWidth: 180 }}
            />
          </label>
          <label>
            <span style={fieldLabelStyle}>TIER</span>
            <select
              aria-label="Tier do genérico"
              value={genTier}
              onChange={(e) => setGenTier(e.target.value)}
              style={{ ...fieldInputStyle, cursor: 'pointer' }}
            >
              {[0, 1, 2, 3].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>MODIFICADOR</span>
            <select
              aria-label="Modificador do genérico"
              value={genMod}
              onChange={(e) => setGenMod(e.target.value)}
              style={{ ...fieldInputStyle, cursor: 'pointer' }}
            >
              {MODIFICADORES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>QTD</span>
            <input
              aria-label="Quantidade do genérico"
              type="number"
              min={1}
              value={genQty}
              onChange={(e) => setGenQty(e.target.value)}
              style={{ ...fieldInputStyle, width: 72 }}
            />
          </label>
          <button type="button" onClick={addGenerico} disabled={!genNome.trim()} style={accentBtnStyle(!!genNome.trim())}>
            + Adicionar genérico
          </button>
        </div>
      </div>

      {/* ── roster montado ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// ROSTER'}</div>
        {items.length === 0 ? (
          <div className="npc-empty">// NENHUM MONSTRO NO ROSTER</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item, i) => (
              <li
                key={`${item.sourceId ?? item.label}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(7),
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {item.qty}× {item.label}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
                  {itemMeta(item)}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${item.label}`}
                  onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: '1px solid var(--line2)',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    clipPath: clip(5),
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── dificuldade ao vivo ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// DIFICULDADE'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <DifficultyBadge meta={result} ratio={result.ratio} big />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
            Monstros {formatDifficultyValue(result.monsterTotal)} · Heróis{' '}
            {formatDifficultyValue(result.playerTotal)} ({niveis.length} herói{niveis.length === 1 ? '' : 's'})
          </span>
        </div>
      </div>

      {/* ── enviar pra sessão ── */}
      <div style={sectionStyle}>
        <div className="kicker">{'// SESSÃO'}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            <span style={fieldLabelStyle}>NOME DO COMBATE</span>
            <input
              aria-label="Nome do combate"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{ ...fieldInputStyle, minWidth: 220 }}
            />
          </label>
          <button type="button" onClick={enviar} disabled={!podeEnviar} style={accentBtnStyle(podeEnviar)}>
            Adicionar à sessão
          </button>
        </div>
        {!repo || !live ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
            // SEM SESSÃO REMOTA ATIVA — crie ou entre numa sessão na aba SESSÃO pra enviar este
            combate pra mesa.
          </div>
        ) : null}
        {status ? (
          <div role="status" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
            {status}
          </div>
        ) : null}
      </div>
    </div>
  )
}
