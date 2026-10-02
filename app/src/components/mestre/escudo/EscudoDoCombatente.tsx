// ESCUDO DO MESTRE — o ESCUDO (equipamento) do combatente, embaixo das
// defesas: nome, DUREZA e INTEGRIDADE (losangos, como na aba Combate do
// herói) + 💢 Danificar / 🔧 Reparar. O dano é volátil e viaja no state da
// sessão (recursosRestantes.escudoDano, espelho de Interativa.Recursos_
// Restantes.Escudo_Dano): o mestre edita o de NPC (dono da linha); o de herói
// é do jogador — só leitura aqui. Dureza/integridade seguem a MESMA regra da
// aba Combate: obra-prima substitui a dureza base; integridade máx = danos::
// do doc do escudo.
import type { CSSProperties } from 'react'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { novoRev } from '../../../data/session-repo/vida-sync'
import { reskinName } from '../../../data/reskin'
import { linkLabel } from '../../../markdown/dataview-value'
import { docField, fmPath, num, str, tierLetter } from '../../ficha/hero-model'
import { useHeroRefs } from '../../ficha/useHeroRefs'
import { tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { ItemHover } from '../../item-card'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

/** Dureza efetiva do escudo: a obra-prima SUBSTITUI a base (regra "Categoria
 *  <tier> Definir Inventario.Escudo.Dureza N" do doc da propriedade). */
export function durezaDoEscudo(escudo: Record<string, unknown>, propDoc: { ruleElements?: unknown } | undefined): number {
  const tierWord = ({ A: 'Adepto', E: 'Experiente', M: 'Mestre' } as Record<string, string>)[tierLetter(escudo['Categoria']) || '']
  let obra = 0
  for (const re of ((propDoc?.ruleElements ?? []) as { raw?: string }[])) {
    const m = String(re.raw ?? '').match(/Categoria (\S+) Definir Inventario\.Escudo\.Dureza (\d+)/)
    if (m && m[1] === tierWord) obra = Number(m[2])
  }
  return obra || num(escudo['Dureza'])
}

export function EscudoDoCombatente({ vm }: { vm: CombatenteVM }) {
  const repo = useSessionRepo()
  const refs = useHeroRefs(vm.doc)
  const fm = vm.doc.frontmatter as Record<string, unknown>
  const escudo = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>
  const nome = str(escudo['Nome'])
  if (!nome) return null
  const escudoDoc = refs.refDoc(escudo['Nome'])
  const propDoc = refs.refDoc(escudo['Propriedade'])
  const intMax = num(docField(escudoDoc, 'danos'))
  const rr = vm.c.state.recursosRestantes
  const dano = rr?.escudoDano ?? num(escudo['Dano'])
  const intCur = Math.max(0, intMax - dano)
  const dureza = durezaDoEscudo(escudo, propDoc)
  // só o dono da linha escreve: NPC é do mestre; herói/companheiro é do jogador
  const edita = vm.c.kind === 'npc' && !!repo
  const setDano = (next: number) => {
    if (!edita || !repo) return
    const alvo = Math.max(0, Math.min(intMax || next, next))
    void repo.updateCharacterState(vm.c.id, {
      recursosRestantes: { ...(rr ?? { vitalidade: 0, moral: 0, em: 0, moralTemp: 0 }), escudoDano: alvo, rev: novoRev() },
    })
  }
  const btn = (tone: string, disabled: boolean): CSSProperties =>
    mono({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      padding: '1px 5px',
      background: disabled ? 'transparent' : `color-mix(in srgb,${tone} 16%,var(--panel))`,
      border: `1px solid ${disabled ? 'var(--line2)' : `color-mix(in srgb,${tone} 45%,var(--line2))`}`,
      color: disabled ? 'var(--muted)' : 'var(--text)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontSize: 10,
      fontWeight: 700,
      clipPath: clip(4),
    })
  return (
    <div
      data-escudo-escudo={vm.c.id}
      data-escudo-dano={dano}
      style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', paddingLeft: 39 }}
    >
      <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--muted)' })}>ESCUDO</span>
      <ItemHover doc={escudoDoc} propDoc={propDoc} tier={tierLetter(escudo['Categoria']) || undefined}>
        <span data-escudo-nome="" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text)' }}>{reskinName(linkLabel(nome))}</span>
      </ItemHover>
      <span title="Dureza" style={mono({ fontSize: 10, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 })}>
        <span style={{ fontSize: 11 }}>{tokens.emojis.inv.Dureza}</span>
        DUREZA <span data-escudo-dureza="" style={{ color: 'var(--text)', fontWeight: 700 }}>{dureza}</span>
      </span>
      <span title={`Integridade ${intCur} / ${intMax}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={mono({ fontSize: 9, letterSpacing: '.08em', color: 'var(--muted)' })}>INTEGRIDADE</span>
        <span data-escudo-integridade={`${intCur}/${intMax}`} style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: intMax }, (_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                transform: 'rotate(45deg)',
                background: i < intCur ? '#9a8f5a' : 'transparent',
                border: `1px solid ${i < intCur ? '#c9b56a' : 'var(--line2)'}`,
              }}
            />
          ))}
        </span>
        {intMax === 0 ? <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>—</span> : null}
        {/* −1/+1 colados na integridade: emoji + número, sem texto (pedido 2026-10-02) */}
        <button
          type="button"
          aria-label="Danificar escudo"
          title={edita ? 'Danificar: −1 de integridade' : 'Só o dono da ficha ajusta o escudo'}
          disabled={!edita || intCur <= 0}
          onClick={() => setDano(dano + 1)}
          style={btn('var(--red)', !edita || intCur <= 0)}
        >
          💢<span>−1</span>
        </button>
        <button
          type="button"
          aria-label="Reparar escudo"
          title={edita ? 'Reparar: +1 de integridade' : 'Só o dono da ficha ajusta o escudo'}
          disabled={!edita || dano <= 0}
          onClick={() => setDano(dano - 1)}
          style={btn('#43a06a', !edita || dano <= 0)}
        >
          🔧<span>+1</span>
        </button>
      </span>
    </div>
  )
}
