// ESCUDO DO MESTRE — a FICHA de um combatente DENTRO da linha dele no combate
// da sala: uma fila de chips (DEFESAS · ATAQUES · MAGIAS · PERÍCIAS ·
// HABILIDADES · PERTENCES) escolhe, POR COMBATENTE, o que o mestre quer ver
// embaixo da vida (pedido 2026-10-02: a vista é individual — um inimigo com os
// ataques abertos, outro com as perícias, o herói fechado). Clicar o chip
// ativo fecha. Rótulos canônicos passam pelo reskin (MAGIAS → TECNOLOGIAS).
import type { CSSProperties } from 'react'
import { reskinUpper } from '../../../data/reskin'
import { clip, type TabDef } from '../../ficha/bits'
import { SubAtaques, SubDefesas, SubHabilidades, SubPericias, SubPertences, SubTecnologias } from './secoes'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export const VISTAS: TabDef[] = [
  { id: 'defesas', label: 'DEFESAS' },
  { id: 'ataques', label: 'ATAQUES' },
  { id: 'magias', label: 'MAGIAS' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'habilidades', label: 'HABILIDADES' },
  { id: 'pertences', label: 'PERTENCES' },
]

const RENDER: Record<string, (vm: CombatenteVM) => React.ReactNode> = {
  defesas: (vm) => <SubDefesas vm={vm} />,
  ataques: (vm) => <SubAtaques vm={vm} />,
  magias: (vm) => <SubTecnologias vm={vm} />,
  pericias: (vm) => <SubPericias vm={vm} />,
  habilidades: (vm) => <SubHabilidades vm={vm} />,
  pertences: (vm) => <SubPertences vm={vm} />,
}

export function FichaDaLinha({
  vm,
  vista,
  onVista,
}: {
  vm: CombatenteVM
  vista: string | null
  onVista: (vista: string | null) => void
}) {
  const render = vista ? RENDER[vista] : undefined
  return (
    <div data-escudo-ficha={vm.c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 39 }}>
      <div data-escudo-vistas="" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {VISTAS.map((v) => {
          const on = vista === v.id
          return (
            <button
              key={v.id}
              type="button"
              data-escudo-vista-chip={v.id}
              aria-pressed={on}
              onClick={() => onVista(on ? null : v.id)}
              title={on ? 'Fechar' : `Ver ${reskinUpper(v.label).toLowerCase()} deste combatente`}
              style={mono({
                padding: '3px 8px',
                background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                color: on ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: 9.5,
                letterSpacing: '.1em',
                clipPath: clip(4),
              })}
            >
              {reskinUpper(v.label)}
            </button>
          )
        })}
      </div>
      {vista && render ? (
        <div data-escudo-vista={vista} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vm.semFicha ? (
            <div data-escudo-sem-ficha="" style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>
              Sem ficha neste aparelho — o segredo do disfarce vive no aparelho que adicionou o combatente;
              re-adicione pelo bestiário pra ver a ficha aqui.
            </div>
          ) : null}
          {render(vm)}
        </div>
      ) : null}
    </div>
  )
}
