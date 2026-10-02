// ESCUDO DO MESTRE — CONDIÇÕES do combatente, na linha (pedido 2026-10-02):
// as ativas sempre visíveis em chips e, abrindo "▸ TODAS", a lista completa
// das condições do SISTEMA (positivas/negativas — chipDefsSplit + COND_GRUPOS,
// a mesma fonte do popover CONDIÇÕES da aba Combate) MAIS os estados de
// combate da engine que não são nota de condição (COMB_CHIPS: Acerto
// Decisivo — o mesmo chip da aba Combate, grupo COMBATE) pra ligar/desligar
// com um toque. Feito pra MEXER RÁPIDO: nada abre nos DETALHES (o resumo é
// o `title` do chip), o toque reflete NA HORA (overlay otimista por
// combatente, base da próxima escrita — toques em rajada não se perdem no
// refetch) e os writes saem serializados. Quem edita é o dono da linha — NPC
// é do mestre; herói é do jogador (chips só leitura).
//
// Destino do toggle = o mesmo do toggleChip da aba Combate: condição do
// catálogo → Condicoes_Ativas {value:1}; estado fora dele (Acerto Decisivo)
// → Efeitos_Ativos {on:true}; desligar remove dos dois (dual-delete).
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import type { VaultDoc } from '../../../data/types'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { reskinName } from '../../../data/reskin'
import { isCondicaoOn, isEfeitoOn, parseStateKey } from '../../../interativa/state'
import { chipDefsSplit, type CondChipDef } from '../../../interativa/useInterativaCtx'
import { COMB_CHIPS, COND_GRUPOS, tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { escreverVolatilNaSessao } from './volatil-sessao'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function corDe(grupo: CondChipDef['grupo'] | undefined): string {
  return (COND_GRUPOS.find((g) => g.id === grupo) ?? COND_GRUPOS[0]!).cor
}

type Container = 'cond' | 'efeito'
interface Pendencia {
  on: boolean
  container: Container
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
  // estados de combate da engine sem nota de condição (Acerto Decisivo)
  const extras = useMemo(() => COMB_CHIPS.filter((c) => !defByNome.has(c.n)), [defByNome])
  const extraByNome = useMemo(() => new Map(extras.map((c) => [c.n, c])), [extras])
  const liveCond = vm.c.state.condicoesAtivas ?? {}
  const liveEf = vm.c.state.efeitosAtivos ?? {}

  // Overlay OTIMISTA por nome: solta quando o live alcança; base da próxima escrita.
  const pendente = useRef(new Map<string, Pendencia>())
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const [, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    let mudou = false
    for (const [nome, p] of pendente.current) {
      const liveOn = p.container === 'cond' ? isCondicaoOn(liveCond[nome]) : isEfeitoOn(liveEf[nome])
      if (liveOn === p.on) {
        pendente.current.delete(nome)
        mudou = true
      }
    }
    if (mudou) bump()
  }, [liveCond, liveEf])
  const { condicoes, efeitos } = useMemo(() => {
    const c: Record<string, unknown> = { ...liveCond }
    const e: Record<string, unknown> = { ...liveEf }
    for (const [nome, p] of pendente.current) {
      if (p.container === 'cond') {
        if (p.on) c[nome] = { value: 1 }
        else delete c[nome]
      } else if (p.on) e[nome] = { on: true }
      else delete e[nome]
    }
    return { condicoes: c, efeitos: e }
    // pendente é ref — o bump re-renderiza quando ele muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCond, liveEf, pendente.current.size])

  const edita = vm.c.kind === 'npc' && !!repo
  const containerDe = (nome: string): Container => (defByNome.has(nome) ? 'cond' : 'efeito')
  const ligada = (nome: string) => isCondicaoOn(condicoes[nome]) || isEfeitoOn(efeitos[nome])
  const toggle = (nome: string) => {
    if (!edita || !repo) return
    const ligar = !ligada(nome)
    const container = containerDe(nome)
    pendente.current.set(nome, { on: ligar, container })
    bump()
    const nextC = { ...condicoes }
    const nextE = { ...efeitos }
    if (ligar) {
      if (container === 'cond') nextC[nome] = { value: 1 }
      else nextE[nome] = { on: true }
    } else {
      delete nextC[nome]
      delete nextE[nome]
    }
    const r = repo
    chain.current = chain.current.then(async () => {
      try {
        if (container === 'cond' || !ligar) escreverVolatilNaSessao(r, vm.c.id, 'Interativa.Condicoes_Ativas', nextC)
        if (container === 'efeito' || !ligar) escreverVolatilNaSessao(r, vm.c.id, 'Interativa.Efeitos_Ativos', nextE)
      } catch {
        pendente.current.delete(nome)
        bump()
      }
    })
  }

  // ativos: condições (com ou sem def — legado/composta) + efeitos (Acerto
  // Decisivo e efeitos de habilidade/magia)
  const ativos: { key: string; label: string; cor: string; ic: string; tipo: 'condicao' | 'efeito'; resumo?: string }[] = []
  for (const [k, v] of Object.entries(condicoes)) {
    if (!isCondicaoOn(v)) continue
    const label = parseStateKey(k).label
    const d = defByNome.get(label)
    ativos.push({ key: `c:${k}`, label, cor: corDe(d?.grupo), ic: d?.ic ?? tokens.emojis.subcategoria.Condicao, tipo: 'condicao', resumo: d?.resumo })
  }
  for (const [k, v] of Object.entries(efeitos)) {
    const label = parseStateKey(k).label
    if (!isEfeitoOn(v) || ativos.some((a) => a.label === label)) continue
    const x = extraByNome.get(label)
    ativos.push({ key: `e:${k}`, label, cor: x?.cor ?? 'var(--gold)', ic: x?.ic ?? tokens.emojis.subcategoria.EfeitoInterativo, tipo: 'efeito' })
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
  const grupos: { id: string; titulo: string; cor: string; itens: { nome: string; rotulo: string; ic: string; resumo?: string }[] }[] = [
    ...COND_GRUPOS.map((g) => ({
      id: g.id,
      titulo: g.titulo,
      cor: g.cor,
      itens: defs.filter((d) => d.grupo === g.id).map((d) => ({ nome: d.nome, rotulo: d.rotulo ?? d.nome, ic: d.ic, resumo: d.resumo })),
    })),
    // estados de combate (Acerto Decisivo) — cor do próprio chip da aba Combate
    ...extras.map((c) => ({ id: `comb:${c.id}`, titulo: 'COMBATE', cor: c.cor, itens: [{ nome: c.n, rotulo: c.n, ic: c.ic }] })),
  ]
  return (
    <div data-escudo-condicoes={vm.c.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 39 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--muted)' })}>
          {tokens.emojis.subcategoria.Condicao} CONDIÇÕES
        </span>
        {ativos.length === 0 ? <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>nenhuma</span> : null}
        {ativos.map((a) => (
          <button
            key={a.key}
            type="button"
            data-escudo-condicao={a.label}
            data-escudo-condicao-tipo={a.tipo}
            disabled={!edita}
            onClick={() => toggle(a.label)}
            // resumo da condição no hover/tap (title nativo), como no popover da ficha —
            // nada abre nos DETALHES (feedback 2026-10-02)
            title={[a.resumo, edita ? 'toque pra desligar' : null].filter(Boolean).join(' — ') || undefined}
            style={chipEstilo(a.cor, true, edita)}
          >
            <span>{a.ic}</span>
            {reskinName(a.label)}
          </button>
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
          {grupos
            .filter((g) => g.itens.length)
            .map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={mono({ fontSize: 9, letterSpacing: '.12em', color: g.cor, flex: 'none', marginRight: 2 })}>{g.titulo}</span>
                {g.itens.map((d) => {
                  const on = ligada(d.nome)
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
                      {reskinName(d.rotulo)}
                    </button>
                  )
                })}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}
