// ESCUDO DO MESTRE — vista CONDIÇÕES do combatente (botão no fim da fila,
// pedido 2026-10-02): a lista inteira, com as LIGADAS em destaque, pra ligar/
// desligar com um toque. Grupos: COMBATE primeiro (Vantagem de Combate +
// Acerto Decisivo juntos — os COMB_CHIPS da aba Combate), depois POSITIVAS e
// NEGATIVAS do sistema (chipDefsSplit + COND_GRUPOS, a mesma fonte do popover
// CONDIÇÕES da ficha). Efeitos de habilidade/magia ligados aparecem num grupo
// EFEITOS, só pra desligar.
//
// Feito pra MEXER RÁPIDO: nada abre nos DETALHES (o resumo é o `title` do
// chip), o toque reflete NA HORA (overlay otimista por combatente, base da
// próxima escrita — toques em rajada não se perdem no refetch) e os writes
// saem serializados. Quem edita é o dono da linha — NPC é do mestre; herói é
// do jogador (só as ligadas, só leitura).
//
// Destino do toggle = o do toggleChip da aba Combate: condição do catálogo →
// Condicoes_Ativas {value:1}; estado fora dele (Acerto Decisivo) →
// Efeitos_Ativos {on:true}; DESLIGAR remove dos DOIS mapas (dual-delete — a
// ficha grava estados nos dois e a engine lê o OR; apagar de um só deixava a
// Vantagem presa e o Apunhalante no dano, report 2026-10-02).
import { useEffect, useMemo, useReducer, useRef, type CSSProperties } from 'react'
import type { VaultDoc } from '../../../data/types'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { reskinName } from '../../../data/reskin'
import { isCondicaoOn, isEfeitoOn, parseStateKey } from '../../../interativa/state'
import { chipDefsSplit } from '../../../interativa/useInterativaCtx'
import { COMB_CHIPS, COND_GRUPOS, tokens } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

type Container = 'cond' | 'efeito'
interface Pendencia {
  on: boolean
  container: Container
}
interface Item {
  nome: string
  rotulo: string
  ic: string
  resumo?: string
}
interface Grupo {
  id: string
  titulo: string
  cor: string
  itens: Item[]
}

export function CondicoesDoCombatente({ vm, docs }: { vm: CombatenteVM; docs: readonly VaultDoc[] }) {
  const repo = useSessionRepo()
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
  const liveEf = vm.c.state.efeitosAtivos ?? {}

  // Overlay OTIMISTA por nome: solta quando o live alcança; base da próxima escrita.
  const pendente = useRef(new Map<string, Pendencia>())
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  // versão do overlay: qualquer mudança (inclusive trocar a MESMA chave) re-deriva os mapas
  const [versao, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    let mudou = false
    for (const [nome, p] of pendente.current) {
      // desligar vale pros dois mapas (dual-delete) — solta quando ambos baixaram
      const liveOn = p.container === 'cond' ? isCondicaoOn(liveCond[nome]) : isEfeitoOn(liveEf[nome])
      const liveQualquer = isCondicaoOn(liveCond[nome]) || isEfeitoOn(liveEf[nome])
      if ((p.on && liveOn) || (!p.on && !liveQualquer)) {
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
      if (p.on) {
        if (p.container === 'cond') c[nome] = { value: 1 }
        else e[nome] = { on: true }
      } else {
        delete c[nome]
        delete e[nome]
      }
    }
    return { condicoes: c, efeitos: e }
    // pendente é ref — `versao` sobe a cada mudança nele
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCond, liveEf, versao])

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
    // UM write com os dois mapas (merge por chave de topo no repo): metade das
    // idas ao servidor e nunca um estado meio-aplicado entre dois writes.
    chain.current = chain.current.then(() =>
      r.updateCharacterState(vm.c.id, { condicoesAtivas: nextC, efeitosAtivos: nextE }).catch(() => {
        pendente.current.delete(nome)
        bump()
      }),
    )
  }

  // ── grupos ──────────────────────────────────────────────────────────
  // COMBATE primeiro: os COMB_CHIPS da aba Combate (Vantagem de Combate vem com
  // ícone/resumo da nota de condição; Acerto Decisivo é estado da engine).
  const combNomes = new Set(COMB_CHIPS.map((c) => c.n))
  const combate: Grupo = {
    id: 'combate',
    titulo: 'COMBATE',
    cor: COMB_CHIPS[0]!.cor,
    itens: COMB_CHIPS.map((c) => {
      const d = defByNome.get(c.n)
      return { nome: c.n, rotulo: c.n, ic: d?.ic ?? c.ic, resumo: d?.resumo }
    }),
  }
  const sistema: Grupo[] = COND_GRUPOS.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    cor: g.cor,
    itens: defs.filter((d) => d.grupo === g.id && !combNomes.has(d.nome)).map((d) => ({ nome: d.nome, rotulo: d.rotulo ?? d.nome, ic: d.ic, resumo: d.resumo })),
  }))
  // ligadas sem lugar nos grupos acima (efeitos de habilidade/magia, legado/composta)
  const conhecidas = new Set([...combate.itens, ...sistema.flatMap((g) => g.itens)].map((i) => i.nome))
  const outrosItens: Item[] = []
  for (const [k, v] of Object.entries(condicoes)) {
    const label = parseStateKey(k).label
    if (isCondicaoOn(v) && !conhecidas.has(label) && !outrosItens.some((i) => i.nome === label))
      outrosItens.push({ nome: label, rotulo: label, ic: tokens.emojis.subcategoria.Condicao })
  }
  for (const [k, v] of Object.entries(efeitos)) {
    const label = parseStateKey(k).label
    if (isEfeitoOn(v) && !conhecidas.has(label) && !outrosItens.some((i) => i.nome === label))
      outrosItens.push({ nome: label, rotulo: label, ic: tokens.emojis.subcategoria.EfeitoInterativo })
  }
  const outros: Grupo = { id: 'efeitos', titulo: 'EFEITOS', cor: 'var(--gold)', itens: outrosItens }
  const grupos = [combate, ...sistema, outros]
    .map((g) => (edita ? g : { ...g, itens: g.itens.filter((i) => ligada(i.nome)) })) // herói: só as ligadas
    .filter((g) => g.itens.length)

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
  if (grupos.length === 0) {
    return <div style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>nenhuma condição ligada</div>
  }
  return (
    <div data-escudo-condicoes={vm.c.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {grupos.map((g) => (
        <div key={g.id} data-escudo-condicoes-grupo={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={mono({ fontSize: 9, letterSpacing: '.12em', color: g.cor, flex: 'none', marginRight: 2 })}>{g.titulo}</span>
          {g.itens.map((d) => {
            const on = ligada(d.nome)
            return (
              <button
                key={d.nome}
                type="button"
                data-escudo-condicao-chip={d.nome}
                aria-pressed={on}
                disabled={!edita}
                onClick={() => toggle(d.nome)}
                // resumo da condição no hover/tap (title nativo), como no popover
                // da ficha — nada abre nos DETALHES
                title={[d.resumo, edita ? (on ? 'toque pra desligar' : 'toque pra ligar') : null].filter(Boolean).join(' — ') || undefined}
                style={chipEstilo(g.cor, on, edita)}
              >
                <span>{d.ic}</span>
                {reskinName(d.rotulo)}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
