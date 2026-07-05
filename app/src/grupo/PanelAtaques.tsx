// Painel "ATAQUES DO GRUPO" (aba ATAQUES) — markup/estilos VERBATIM do
// design (Companion App.dc.html, linhas 1258-1276). Dados espelham o
// plugin: buildAtaquesSectionEl (section-ataques.ts, top 4 por membro) e
// ordenação orderMembersMaxAttackDesc (render-party-sheet.ts). Ícone da
// arma via registro EMOJI.grupoArma (mapa de equipamentos-section.ts);
// cor da letra de proficiência via tokens.colors.rank.
// Tooltips (build recuperado): contador af sequencial — cada chip de arma
// consome 'atq:f<af++>' na ordem membro→armas.
import type { IndexDocEntry, VaultDoc } from '../data/types'
import type { GrupoTip } from './gtip'
import { useCatalog } from '../data/CatalogContext'
import { tokens } from '../generated/tokens'
import { groupAttacks } from './ataques'
import { orderByMaxAttackDesc } from './order'
import { fmtSigned } from './stats'
import { sectionTitleStyle } from './panel-ui'

const CHIP_CLIP = 'polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))'

const rankColor = (prof: string): string =>
  (tokens.colors.rank as Record<string, string>)[prof] ?? tokens.colors.rank.N

export function PanelAtaques({
  members,
  docs,
  tip,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
  tip?: GrupoTip
}) {
  const catalog = useCatalog()
  const groups = groupAttacks(catalog, orderByMaxAttackDesc(members, docs), docs)

  // Contador af do build recuperado ('atq:f1', 'atq:f2', ... na ordem).
  let af = 1
  const tipKeys = groups.map((g) => g.list.map(() => `atq:f${af++}`))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={sectionTitleStyle}>{'// ATAQUES DO GRUPO'}</div>
      {groups.map((g, gIdx) => (
        <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12 }}>👤</span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue)' }}>{g.who}</span>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {g.list.map((w, i) => {
              const txt = w.prop ? `${w.label} · ${w.prop}` : w.label
              return (
                <span
                  key={`${w.label}-${i}`}
                  onMouseEnter={tip?.tipE(tipKeys[gIdx][i])}
                  onMouseMove={tip?.move}
                  onMouseLeave={tip?.hide}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 13px',
                    cursor: 'help',
                    background: 'var(--panel)',
                    border: '1px solid var(--line2)',
                    clipPath: CHIP_CLIP,
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>
                    {fmtSigned(w.total)}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>·</span>
                  <span style={{ fontSize: 13 }}>{w.icon ? `${w.icon} ${txt}` : txt}</span>
                  {w.prof ? (
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: rankColor(w.prof),
                      }}
                    >
                      ({w.prof})
                    </span>
                  ) : null}
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
