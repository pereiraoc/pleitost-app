// ESCUDO DO MESTRE — CONDIÇÕES do combatente, na linha (pedido 2026-10-02):
// as ativas sempre visíveis em chips e, abrindo "▸ TODAS", a lista completa
// das condições do SISTEMA (positivas/negativas — chipDefsSplit + COND_GRUPOS,
// a mesma fonte do popover CONDIÇÕES da aba Combate) pra ligar/desligar com
// um toque. Feito pra MEXER RÁPIDO (feedback 2026-10-02): nada abre nos
// DETALHES (o resumo da condição é o `title` do chip, como no popover da
// ficha), o toque reflete NA HORA (overlay otimista por combatente, a base da
// próxima escrita — toques em rajada não se perdem no refetch) e os writes
// saem serializados. Quem edita é o dono da linha — NPC é do mestre; herói é
// do jogador (chips só leitura). Efeitos de habilidade/magia (Efeitos_Ativos)
// aparecem entre os ativos, sem toggle aqui.
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../../data/types'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { reskinName } from '../../../data/reskin'
import { isCondicaoOn, isEfeitoOn, parseStateKey } from '../../../interativa/state'
import { chipDefsSplit, type CondChipDef } from '../../../interativa/useInterativaCtx'
import { COND_GRUPOS, tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
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
  const defByNome = useMemo(() => new Map(defs.map((d) => [d.nome, d])), [defs])
  const liveCond = vm.c.state.condicoesAtivas ?? {}
  const efeitos = vm.c.state.efeitosAtivos ?? {}
  // Overlay OTIMISTA: nome → ligada? Solta quando o live alcança; é a base da
  // próxima escrita (toques em rajada sobre um live stale não se perdem).
  const pendente = useRef(new Map<string, boolean>())
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const [, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    let mudou = false
    for (const [nome, on] of pendente.current) {
      if (isCondicaoOn(liveCond[nome]) === on) {
        pendente.current.delete(nome)
        mudou = true
      }
    }
    if (mudou) bump()
  }, [liveCond])
  const condicoes = useMemo(() => {
    const out: Record<string, unknown> = { ...liveCond }
    for (const [nome, on] of pendente.current) {
      if (on) out[nome] = { value: 1 }
      else delete out[nome]
    }
    return out
    // pendente é ref — o bump re-renderiza quando ele muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCond, pendente.current.size])

  const edita = vm.c.kind === 'npc' && !!repo
  const toggle = (nome: string) => {
    if (!edita || !repo) return
    const ligar = !isCondicaoOn(condicoes[nome])
    pendente.current.set(nome, ligar)
    bump()
    const next = { ...condicoes }
    if (ligar) next[nome] = { value: 1 }
    else delete next[nome]
    chain.current = chain.current.then(() =>
      repo.updateCharacterState(vm.c.id, { condicoesAtivas: next }).catch(() => {
        pendente.current.delete(nome)
        bump()
      }),
    )
  }

  // ativos: condições (com ou sem def — legado/composta) + efeitos de habilidade
  const ativos: { key: string; label: string; cor: string; ic: string; tipo: 'condicao' | 'efeito'; resumo?: string }[] = []
  for (const [k, v] of Object.entries(condicoes)) {
    if (!isCondicaoOn(v)) continue
    const label = parseStateKey(k).label
    const d = defByNome.get(label)
    ativos.push({ key: `c:${k}`, label, cor: corDe(d?.grupo), ic: d?.ic ?? tokens.emojis.subcategoria.Condicao, tipo: 'condicao', resumo: d?.resumo })
  }
  for (const [k, v] of Object.entries(efeitos)) {
    const label = parseStateKey(k).label
    if (isEfeitoOn(v) && !ativos.some((a) => a.label === label))
      ativos.push({ key: `e:${k}`, label, cor: 'var(--gold)', ic: tokens.emojis.subcategoria.EfeitoInterativo, tipo: 'efeito' })
  }
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
        {ativos.map((a) => {
          const clicavel = edita && a.tipo === 'condicao'
          return (
            <button
              key={a.key}
              type="button"
              data-escudo-condicao={a.label}
              data-escudo-condicao-tipo={a.tipo}
              disabled={!clicavel}
              onClick={() => toggle(a.label)}
              // resumo da condição no hover/tap (title nativo), como no popover da ficha —
              // nada abre nos DETALHES (feedback 2026-10-02)
              title={[a.resumo, clicavel ? 'toque pra desligar' : null].filter(Boolean).join(' — ') || undefined}
              style={chipEstilo(a.cor, true, clicavel)}
            >
              <span>{a.ic}</span>
              {reskinName(a.label)}
            </button>
          )
        })}
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
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={mono({ fontSize: 9, letterSpacing: '.12em', color: g.cor, flex: 'none', marginRight: 2 })}>{g.titulo}</span>
                {doGrupo.map((d) => {
                  const on = isCondicaoOn(condicoes[d.nome])
                  return (
                    <button
                      key={d.nome}
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
