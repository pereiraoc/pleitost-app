// ESCUDO DO MESTRE — a FICHA de um combatente DENTRO da linha dele no combate
// da sala. Embaixo da vida (e das defesas, que a linha já mostra sempre):
// o ESCUDO do combatente (dureza/integridade/danificar/reparar) e uma fila de
// chips (ATAQUES · MAGIAS · PERÍCIAS · HABILIDADES · PERTENCES) que escolhe,
// POR COMBATENTE, o que o mestre quer ver (pedido 2026-10-02: a vista é
// individual). Chip de vista VAZIA vem desabilitado (claramente não clicável).
// Clicar o chip ativo fecha. Rótulos canônicos passam pelo reskin.
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { reskinUpper } from '../../../data/reskin'
import { clip, type TabDef } from '../../ficha/bits'
import { SubAtaques, SubHabilidades, SubPericias, SubPertences, SubTecnologias } from './secoes'
import { EscudoDoCombatente } from './EscudoDoCombatente'
import { vistasDisponiveis, type VistaId } from './disponibilidade'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export const VISTAS: (TabDef & { id: VistaId })[] = [
  { id: 'ataques', label: 'ATAQUES' },
  { id: 'magias', label: 'MAGIAS' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'habilidades', label: 'HABILIDADES' },
  { id: 'pertences', label: 'PERTENCES' },
]

const RENDER: Record<VistaId, (vm: CombatenteVM) => React.ReactNode> = {
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
  const catalog = useCatalog()
  const fm = vm.doc.frontmatter as Record<string, unknown>
  const disponiveis = useMemo(() => vistasDisponiveis(fm, catalog), [fm, catalog])
  const ativa = (VISTAS.find((v) => v.id === vista && disponiveis[v.id])?.id ?? null) as VistaId | null
  return (
    <div data-escudo-ficha={vm.c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <EscudoDoCombatente vm={vm} />
      <div data-escudo-vistas="" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 39 }}>
        {VISTAS.map((v) => {
          const on = ativa === v.id
          const vazia = vm.semFicha || !disponiveis[v.id]
          return (
            <button
              key={v.id}
              type="button"
              data-escudo-vista-chip={v.id}
              aria-pressed={on}
              disabled={vazia}
              onClick={() => onVista(on ? null : v.id)}
              title={vazia ? `Sem ${reskinUpper(v.label).toLowerCase()} neste combatente` : on ? 'Fechar' : `Ver ${reskinUpper(v.label).toLowerCase()} deste combatente`}
              style={mono({
                padding: '3px 8px',
                background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
                border: `1px ${vazia ? 'dashed' : 'solid'} ${on ? 'var(--accent)' : vazia ? 'var(--line)' : 'var(--line2)'}`,
                color: on ? 'var(--accent)' : vazia ? 'color-mix(in srgb,var(--muted) 55%,transparent)' : 'var(--muted)',
                cursor: vazia ? 'default' : 'pointer',
                textDecoration: vazia ? 'line-through' : 'none',
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
      {ativa ? (
        <div data-escudo-vista={ativa} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 39 }}>
          {RENDER[ativa](vm)}
        </div>
      ) : null}
    </div>
  )
}
