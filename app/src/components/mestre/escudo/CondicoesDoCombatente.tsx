// ESCUDO DO MESTRE — CONDIÇÕES do combatente, na linha (pedido 2026-10-02):
// as ativas sempre visíveis em chips (carta da condição no hover) e, abrindo
// "todas", a lista completa das condições do SISTEMA (positivas/negativas,
// mesma fonte/visual do popover CONDIÇÕES da aba Combate: chipDefsSplit +
// COND_GRUPOS) pra ligar/desligar com um toque. Quem edita é o dono da linha
// — NPC é do mestre; herói é do jogador (chips só leitura). O toggle grava
// Condicoes_Ativas inteiro no state da sessão ({value:1} ao ligar, remove ao
// desligar — o default do plugin pra condição sem seletor). Efeitos de
// habilidade/magia (Efeitos_Ativos) aparecem entre os ativos, sem toggle aqui.
import { useMemo, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../../data/types'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { reskinName } from '../../../data/reskin'
import { isCondicaoOn, isEfeitoOn, parseStateKey } from '../../../interativa/state'
import { chipDefsSplit, type CondChipDef } from '../../../interativa/useInterativaCtx'
import { COND_GRUPOS, tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { ItemHover } from '../../item-card'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function corDe(grupo: CondChipDef['grupo'] | undefined): string {
  return (COND_GRUPOS.find((g) => g.id === grupo) ?? COND_GRUPOS[0]!).cor
}

export function CondicoesDoCombatente({ vm, docs }: { vm: CombatenteVM; docs: readonly VaultDoc[] }) {
  const repo = useSessionRepo()
  const [aberto, setAberto] = useState(false)
  const defs = useMemo(
    () =>
      chipDefsSplit(docs, [], {
        condIcon: tokens.emojis.subcategoria.Condicao,
        efeitoIcon: tokens.emojis.subcategoria.EfeitoInterativo,
      }).condicoes,
    [docs],
  )
  const defByNome = new Map(defs.map((d) => [d.nome, d]))
  const condicoes = vm.c.state.condicoesAtivas ?? {}
  const efeitos = vm.c.state.efeitosAtivos ?? {}
  // ativos: condições (com ou sem def — legado/composta) + efeitos de habilidade
  const ativos: { key: string; label: string; cor: string; ic: string; tipo: 'condicao' | 'efeito' }[] = []
  for (const [k, v] of Object.entries(condicoes)) {
    if (!isCondicaoOn(v)) continue
    const label = parseStateKey(k).label
    const d = defByNome.get(label)
    ativos.push({ key: `c:${k}`, label, cor: corDe(d?.grupo), ic: d?.ic ?? tokens.emojis.subcategoria.Condicao, tipo: 'condicao' })
  }
  for (const [k, v] of Object.entries(efeitos)) {
    const label = parseStateKey(k).label
    if (isEfeitoOn(v) && !ativos.some((a) => a.label === label))
      ativos.push({ key: `e:${k}`, label, cor: 'var(--gold)', ic: tokens.emojis.subcategoria.EfeitoInterativo, tipo: 'efeito' })
  }
  const edita = vm.c.kind === 'npc' && !!repo
  const toggle = (nome: string) => {
    if (!edita || !repo) return
    const next = { ...condicoes }
    if (isCondicaoOn(next[nome])) delete next[nome]
    else next[nome] = { value: 1 }
    void repo.updateCharacterState(vm.c.id, { condicoesAtivas: next })
  }
  const docDe = (label: string) => docs.find((d) => d.basename === label)
  const chipEstilo = (cor: string, on: boolean, clicavel: boolean): CSSProperties =>
    mono({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      background: `color-mix(in srgb,${cor} ${on ? 18 : 6}%,var(--panel))`,
      border: `1px solid color-mix(in srgb,${cor} ${on ? 70 : 30}%,var(--line2))`,
      color: on ? cor : 'var(--muted)',
      fontSize: 10,
      fontWeight: 700,
      cursor: clicavel ? 'pointer' : 'default',
      clipPath: clip(4),
    })
  if (!edita && ativos.length === 0) return null
  return (
    <div data-escudo-condicoes={vm.c.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 39 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--muted)' })}>
          {tokens.emojis.subcategoria.Condicao} CONDIÇÕES
        </span>
        {ativos.length === 0 ? <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>nenhuma</span> : null}
        {ativos.map((a) => (
          <span key={a.key} data-escudo-condicao={a.label} data-escudo-condicao-tipo={a.tipo}>
            <ItemHover doc={docDe(a.label)} fullBody>
              <button
                type="button"
                disabled={!edita || a.tipo !== 'condicao'}
                onClick={() => toggle(a.label)}
                title={edita && a.tipo === 'condicao' ? 'Desligar' : undefined}
                style={chipEstilo(a.cor, true, edita && a.tipo === 'condicao')}
              >
                <span>{a.ic}</span>
                {reskinName(a.label)}
              </button>
            </ItemHover>
          </span>
        ))}
        {edita ? (
          <button
            type="button"
            data-escudo-condicoes-toggle=""
            aria-pressed={aberto}
            onClick={() => setAberto((v) => !v)}
            title={aberto ? 'Fechar a lista' : 'Ligar/desligar condições'}
            style={mono({
              padding: '2px 7px',
              background: aberto ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
              border: `1px solid ${aberto ? 'var(--accent)' : 'var(--line2)'}`,
              color: aberto ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: 9.5,
              letterSpacing: '.1em',
              clipPath: clip(4),
            })}
          >
            {aberto ? '▾ TODAS' : '▸ TODAS'}
          </button>
        ) : null}
      </div>
      {aberto && edita ? (
        <div data-escudo-condicoes-todas="" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {COND_GRUPOS.map((g) => {
            const doGrupo = defs.filter((d) => d.grupo === g.id)
            if (!doGrupo.length) return null
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={mono({ fontSize: 9, letterSpacing: '.12em', color: g.cor, flex: 'none' })}>{g.titulo}</span>
                {doGrupo.map((d) => {
                  const on = isCondicaoOn(condicoes[d.nome])
                  return (
                    <ItemHover key={d.nome} doc={docDe(d.nome)} fullBody>
                      <button
                        type="button"
                        data-escudo-condicao-chip={d.nome}
                        aria-pressed={on}
                        onClick={() => toggle(d.nome)}
                        title={d.resumo}
                        style={chipEstilo(g.cor, on, true)}
                      >
                        <span>{d.ic}</span>
                        {reskinName(d.rotulo ?? d.nome)}
                      </button>
                    </ItemHover>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
