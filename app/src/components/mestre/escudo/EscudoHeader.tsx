// ESCUDO DO MESTRE — cabeçalho: turno (mesma palavra da iniciativa), de quem
// é a vez e a dificuldade AO VIVO do encontro (badge do tracker do plugin,
// tooltip com o breakdown da mesa real). Kit atual: kickers mono, var(--…),
// clip de canto cortado. Sem combate ativo, orienta.
import type { CSSProperties } from 'react'
import type { Encounter } from '../../../data/session-repo/contract'
import { nomeDeIniciativa } from '../../../data/session-repo/group-name'
import { liveEncounterDifficulty } from '../../../mestre/encounter-live-difficulty'
import { partyDifficultyTipHtml } from '../../../mestre/difficulty-tip'
import { DifficultyBadge } from '../ui'
import { TipHover } from '../../ficha/tooltips'
import { clip } from '../../ficha/bits'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export function EscudoHeader({
  ativo,
  todos,
  vezDe,
}: {
  ativo: Encounter | null
  todos: readonly CombatenteVM[]
  vezDe: CombatenteVM | null
}) {
  const dif = ativo ? liveEncounterDifficulty(todos.map((v) => ({ c: v.c, fm: v.doc.frontmatter }))) : null
  // fallback: rótulo salvo no preparo do combate (formato de aventura), quando
  // nenhum NPC pontua ao vivo (jsonb aberto → só aceita string).
  const labelSalvo = typeof ativo?.difficulty?.['label'] === 'string' ? (ativo.difficulty['label'] as string) : null
  return (
    <div
      data-escudo-header=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '12px 18px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
      }}
    >
      {ativo ? (
        <>
          <span data-escudo-turno="" style={mono({ fontSize: 11, letterSpacing: '.14em', color: 'var(--red)', fontWeight: 700 })}>
            {`TURNO ${Math.max(1, ativo.turnState?.round ?? 1)}`}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={mono({ fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' })}>VEZ DE</span>
            <span
              data-escudo-vez=""
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: vezDe ? (vezDe.lado === 'jogador' ? 'var(--blue)' : 'var(--red)') : 'var(--muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {vezDe ? nomeDeIniciativa(vezDe.c.summary.nome, vezDe.c.fmBlob) : '—'}
            </span>
          </span>
          <span style={{ flex: 1 }} />
          {dif ? (
            <span data-escudo-dificuldade={dif.result.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TipHover html={partyDifficultyTipHtml(dif.result, dif.monstros, dif.heroLevels)}>
                <DifficultyBadge meta={dif.result} ratio={dif.result.ratio} />
              </TipHover>
              {dif.npcsSemFicha > 0 ? (
                <span style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
                  {`${dif.npcsSemFicha} sem ficha`}
                </span>
              ) : null}
            </span>
          ) : labelSalvo ? (
            <span data-escudo-dificuldade={labelSalvo} style={mono({ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' })}>
              {labelSalvo}
            </span>
          ) : null}
        </>
      ) : (
        <span style={mono({ fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' })}>
          {'// SEM COMBATE ATIVO — inicie um combate abaixo ou adicione um monstro pelo bestiário'}
        </span>
      )}
    </div>
  )
}
