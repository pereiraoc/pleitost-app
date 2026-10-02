// ESCUDO DO MESTRE (2026-10-02) — a aba COMBATE da ficha de herói em MODO
// MESTRE. Em vez de abrir uma nota por inimigo, o mestre vê o combate da sala
// (vida, steppers, turno, velocidades) com TODOS os combatentes do encontro
// ativo (filtro padrão INIMIGOS; chip TODOS inclui a mesa) e, POR COMBATENTE,
// escolhe o que ver embaixo da linha: DEFESAS, ATAQUES (do maior pro menor),
// MAGIAS (com a linha de execução do mundo), PERÍCIAS (do maior pro menor),
// HABILIDADES (sem os modificadores de bestiário) e PERTENCES — a vista é
// individual (pedido 2026-10-02; a sub-aba global "ficou ruim"). CENA (a cena
// atual da aventura em curso) abre por um botão do cabeçalho. Kit visual atual.
import { useState, type CSSProperties } from 'react'
import { useSessions } from '../../../data/session-store'
import { clip } from '../../ficha/bits'
import { TipProvider } from '../../ficha/tooltips'
import { ITEM_CARD_CSS } from '../../item-card'
import { EscudoHeader } from './EscudoHeader'
import { SubVida } from './SubVida'
import { SubCena } from './SubCena'
import { FichaDaLinha } from './FichaDaLinha'
import { useCombatentes, type FiltroEscudo } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

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

const chip = (on: boolean): CSSProperties =>
  mono({
    padding: '5px 10px',
    background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
    color: on ? 'var(--accent)' : 'var(--muted)',
    cursor: 'pointer',
    fontSize: 10,
    letterSpacing: '.1em',
    clipPath: clip(5),
  })

export function EscudoDoMestreTab() {
  const [filtro, setFiltro] = useState<FiltroEscudo>('inimigos')
  // vista aberta POR combatente (id → chip); ausente = só a linha de vida
  const [vistas, setVistas] = useState<Record<string, string | null>>({})
  const [cenaAberta, setCenaAberta] = useState(false)
  const { active } = useSessions()
  const { live, ativo, todos, vezDe } = useCombatentes('todos')
  const vmById = new Map(todos.map((vm) => [vm.c.id, vm]))
  const inimigos = todos.filter((vm) => vm.lado === 'inimigo')

  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
      <div
        data-escudo-mestre=""
        style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <EscudoHeader ativo={ativo} todos={todos} vezDe={vezDe} />
        <div data-escudo-controles="" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={mono({ fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' })}>MOSTRAR</span>
          <button type="button" data-escudo-filtro="inimigos" aria-pressed={filtro === 'inimigos'} onClick={() => setFiltro('inimigos')} style={chip(filtro === 'inimigos')}>
            INIMIGOS
          </button>
          <button type="button" data-escudo-filtro="todos" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')} style={chip(filtro === 'todos')}>
            TODOS
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-escudo-cena-toggle=""
            aria-pressed={cenaAberta}
            onClick={() => setCenaAberta((v) => !v)}
            title={cenaAberta ? 'Fechar a cena atual' : 'Ver a cena atual da aventura em curso'}
            style={chip(cenaAberta)}
          >
            {cenaAberta ? '▾ CENA' : '▸ CENA'}
          </button>
        </div>
        {!live || !active?.remoteId ? (
          <Aviso>{'// SEM MESA — entre numa sessão como mestre (painel SESSÃO) e o escudo monta aqui'}</Aviso>
        ) : (
          <>
            {cenaAberta ? <SubCena /> : null}
            <SubVida
              sess={active}
              filtro={filtro}
              porCombatente={(c) => {
                const vm = vmById.get(c.id)
                if (!vm) return null
                return (
                  <FichaDaLinha
                    vm={vm}
                    vista={vistas[c.id] ?? null}
                    onVista={(v) => setVistas((m) => ({ ...m, [c.id]: v }))}
                  />
                )
              }}
            />
            {ativo && filtro === 'inimigos' && inimigos.length === 0 ? (
              <div data-escudo-dica="" style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic', padding: '0 4px' })}>
                nenhum inimigo no combate — troque pra TODOS ou adicione um monstro pelo bestiário
              </div>
            ) : null}
          </>
        )}
      </div>
    </TipProvider>
  )
}
