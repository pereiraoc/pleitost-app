// ESCUDO DO MESTRE (2026-10-02) — a aba COMBATE da ficha em MODO MESTRE. Em
// vez de abrir uma nota por inimigo, o mestre vê TODOS os combatentes do
// encontro ativo da sala (filtro padrão INIMIGOS; chip TODOS inclui a mesa)
// em sub-abas: VIDA (o combate da sala + condições/efeitos), DEFESAS,
// ATAQUES (do maior pro menor), MAGIAS (com a linha de execução do mundo),
// PERÍCIAS (do maior pro menor), HABILIDADES, PERTENCES e CENA (a cena atual
// da aventura em curso, fase 2). Kit visual atual
// (TabStrip, cards, chips, tooltips) — nenhum design novo. Só a sub-aba
// ativa monta (custo por combatente).
import { useState, type CSSProperties } from 'react'
import { useSessions } from '../../../data/session-store'
import { TabStrip, clip, type TabDef } from '../../ficha/bits'
import { TipProvider } from '../../ficha/tooltips'
import { ITEM_CARD_CSS } from '../../item-card'
import { EscudoHeader } from './EscudoHeader'
import { CombatenteCard } from './CombatenteCard'
import { SubVida } from './SubVida'
import { SubCena } from './SubCena'
import { SubAtaques, SubDefesas, SubHabilidades, SubPericias, SubPertences, SubTecnologias } from './secoes'
import { useCombatentes, type CombatenteVM, type FiltroEscudo } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

/** Sub-abas: ids internos; rótulos canônicos passam pelo reskin do TabStrip
 *  ('MAGIAS' → TECNOLOGIAS na POA). */
export const ESCUDO_SUBS: TabDef[] = [
  { id: 'vida', label: 'VIDA' },
  { id: 'defesas', label: 'DEFESAS' },
  { id: 'ataques', label: 'ATAQUES' },
  { id: 'magias', label: 'MAGIAS' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'habilidades', label: 'HABILIDADES' },
  { id: 'pertences', label: 'PERTENCES' },
  // fase 2: a cena atual da aventura em curso (ler pra mesa sem sair do escudo)
  { id: 'cena', label: 'CENA' },
]

const POR_COMBATENTE: Record<string, (vm: CombatenteVM) => React.ReactNode> = {
  defesas: (vm) => <SubDefesas vm={vm} />,
  ataques: (vm) => <SubAtaques vm={vm} />,
  magias: (vm) => <SubTecnologias vm={vm} />,
  pericias: (vm) => <SubPericias vm={vm} />,
  habilidades: (vm) => <SubHabilidades vm={vm} />,
  pertences: (vm) => <SubPertences vm={vm} />,
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--line2)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.12em',
        color: 'var(--muted)',
        clipPath: clip(12),
      }}
    >
      {children}
    </div>
  )
}

export function EscudoDoMestreTab() {
  const [sub, setSub] = useState('vida')
  const [filtro, setFiltro] = useState<FiltroEscudo>('inimigos')
  const { active } = useSessions()
  const { live, ativo, lista, todos, vezDe } = useCombatentes(filtro)

  const chipFiltro = (id: FiltroEscudo, label: string) => {
    const on = filtro === id
    return (
      <button
        key={id}
        data-escudo-filtro={id}
        aria-pressed={on}
        onClick={() => setFiltro(id)}
        style={mono({
          padding: '5px 10px',
          background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
          border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
          color: on ? 'var(--accent)' : 'var(--muted)',
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: '.1em',
          clipPath: clip(5),
        })}
      >
        {label}
      </button>
    )
  }

  const render = POR_COMBATENTE[sub]
  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div
        data-escudo-mestre=""
        style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <EscudoHeader ativo={ativo} todos={todos} vezDe={vezDe} />
        <TabStrip
          tabs={ESCUDO_SUBS}
          active={sub}
          onSelect={setSub}
          right={
            <span style={{ display: 'flex', gap: 4, paddingRight: 6 }}>
              {chipFiltro('inimigos', 'INIMIGOS')}
              {chipFiltro('todos', 'TODOS')}
            </span>
          }
        />
        {!live || !active?.remoteId ? (
          <Aviso>{'// SEM MESA — entre numa sessão como mestre (painel SESSÃO) e o escudo monta aqui'}</Aviso>
        ) : sub === 'vida' ? (
          <SubVida sess={active} filtro={filtro} />
        ) : sub === 'cena' ? (
          <SubCena />
        ) : !ativo ? (
          <Aviso>{'// SEM COMBATE ATIVO'}</Aviso>
        ) : lista.length === 0 ? (
          <Aviso>
            {filtro === 'inimigos'
              ? '// NENHUM INIMIGO NO COMBATE — troque pra TODOS ou adicione um monstro pelo bestiário'
              : '// NENHUM COMBATENTE'}
          </Aviso>
        ) : (
          <div data-escudo-sub={sub} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lista.map((vm) => (
              <CombatenteCard key={vm.c.id} vm={vm}>
                {render ? render(vm) : null}
              </CombatenteCard>
            ))}
          </div>
        )}
      </div>
    </TipProvider>
  )
}
