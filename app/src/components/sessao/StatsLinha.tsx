// Linha compacta de DEFESAS/SENTIDOS/MOVIMENTO do combatente (#324): grupos
// (Defesa, Movimento) · (Vigor, Reflexo, Ímpeto) · (Percepção, Intuição), cada
// grupo nowrap, quebra ENTRE grupos. Fonte única: o toggle 🛡️ da linha do
// combate da sala e o Escudo do Mestre (sempre visível embaixo da vida).
import type { CSSProperties } from 'react'
import type { CharacterStats } from '../../data/session-repo/contract'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export function StatsLinha({ stats }: { stats: CharacterStats | undefined }) {
  return (
    <span data-escudo-stats="" style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' })}>
      <span style={{ display: 'flex', gap: 7, whiteSpace: 'nowrap' }}>
        <span>🛡️{stats?.defesa ?? 0}</span>
        <span>👣{stats?.movimento ?? 0}</span>
      </span>
      <span style={{ display: 'flex', gap: 7, whiteSpace: 'nowrap' }}>
        <span>❤️{stats?.vigor ?? 0}</span>
        <span>⚡{stats?.evasao ?? 0}</span>
        <span>🔥{stats?.impeto ?? 0}</span>
      </span>
      <span style={{ display: 'flex', gap: 7, whiteSpace: 'nowrap' }}>
        <span>👁️{stats?.percepcao ?? 0}</span>
        <span>💡{stats?.intuicao ?? 0}</span>
      </span>
    </span>
  )
}
