// ESCUDO DO MESTRE — conteúdo das vistas por combatente (ATAQUES/MAGIAS/
// PERÍCIAS/HABILIDADES/PERTENCES). Tudo reusa as peças do RESUMO (ResumoDetail): mesmos chips, breakdowns e cartas
// no hover; nada de modelo novo. Lê o FM publicado (doc sintético), SEM
// useHeroRules/useInterativaCtx (custo por combatente — perícias/defesas
// sem os deltas de condição, aceito no plano).
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { habilidadeOcultaNoEscudo } from './disponibilidade'
import { fmPath, heroAtributos } from '../../ficha/hero-model'
import { useHeroRefs } from '../../ficha/useHeroRefs'
import { useNamedDocs } from '../../ficha/useNamedDocs'
import { AtaquesPanel } from '../../ficha/CombateTab'
import { useInterativaCtx } from '../../../interativa/useInterativaCtx'
import { useSessionRepo } from '../../../data/session-repo/provider'
import { escreverVolatilNaSessao } from './volatil-sessao'
import {
  AcoesResumo,
  HabilidadesResumo,
  HoverList,
  MagiasResumo,
  PericiasResumo,
  Section,
  TecnicasResumo,
  inventarioItens,
  type Fm,
} from '../../detail/ResumoDetail'
import type { CombatenteVM } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

function Vazio({ texto }: { texto: string }) {
  return <div style={mono({ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' })}>{texto}</div>
}

/* ── ATAQUES ─────────────────────────────────────────────────────────── */

/** ATAQUES = o MESMO painel da aba Combate (feedback 2026-10-02: "dano tem
 *  que considerar Vantagem de Combate e calcular como na tela de combate"):
 *  acerto/dano/AdO com o contexto da Interativa do combatente (condições do
 *  state da sessão → Interativa.Condicoes_Ativas do doc sintético). Só monta
 *  quando a vista está aberta — é a única vista que roda a engine por
 *  combatente. NPC: os toggles do painel (Vantagem de Combate, Acerto
 *  Decisivo, ações locais, cargas) escrevem no state da sessão; herói: o
 *  jogador é o dono — painel só leitura. */
export function SubAtaques({ vm }: { vm: CombatenteVM }) {
  const refs = useHeroRefs(vm.doc)
  const inter = useInterativaCtx(vm.doc, refs)
  const repo = useSessionRepo()
  if (vm.semFicha) return <Vazio texto="sem ficha — ataques indisponíveis" />
  if (!inter.loaded) return <div className="loading">Carregando ataques…</div>
  const edita = vm.c.kind === 'npc' && !!repo
  return (
    <div data-escudo-ataques={edita ? 'edita' : 'leitura'}>
      <AtaquesPanel
        doc={vm.doc}
        refs={refs}
        inter={inter}
        ordem="desc"
        somenteLeitura={!edita}
        escrever={edita ? (path, value) => void escreverVolatilNaSessao(repo!, vm.c.id, path, value) : undefined}
      />
    </div>
  )
}

/* ── MAGIAS / TECNOLOGIAS ────────────────────────────────────────────── */

export function SubTecnologias({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const namedDoc = useNamedDocs(['Potência Mágica', 'Energia Mágica', 'Magia Arcana', 'Magia Anima'])
  if (vm.semFicha) return <Vazio texto="sem ficha — magias indisponíveis" />
  return (
    <div data-escudo-magias="">
      <MagiasResumo fm={fm} refs={refs} namedDoc={namedDoc} />
    </div>
  )
}

/* ── PERÍCIAS ────────────────────────────────────────────────────────── */

export function SubPericias({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const { values: attrs } = useMemo(() => heroAtributos(fm), [fm])
  if (vm.semFicha) return <Vazio texto="sem ficha — perícias indisponíveis" />
  return (
    <div data-escudo-pericias="">
      <PericiasResumo fm={fm} attrs={attrs} ordem="desc" />
    </div>
  )
}

/* ── HABILIDADES ─────────────────────────────────────────────────────── */

export function SubHabilidades({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  const catalog = useCatalog()
  // Pedido 2026-10-02: modificadores de bestiário (Competente/Solo/Elite/
  // Evolução Básica de Monstro) e ESSÊNCIAS ficam fora — os primeiros são a
  // estrutura do monstro, as segundas aparecem em MAGIAS. Corte pela PASTA.
  const ocultar = (target: string) => habilidadeOcultaNoEscudo(catalog, target)
  if (vm.semFicha) return <Vazio texto="sem ficha — habilidades indisponíveis" />
  return (
    <div data-escudo-habilidades="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <HabilidadesResumo fm={fm} refs={refs} ocultar={ocultar} />
      <TecnicasResumo fm={fm} refs={refs} />
      <AcoesResumo fm={fm} refs={refs} />
    </div>
  )
}

/* ── PERTENCES ───────────────────────────────────────────────────────── */

export function SubPertences({ vm }: { vm: CombatenteVM }) {
  const fm = vm.doc.frontmatter as Fm
  const refs = useHeroRefs(vm.doc)
  // armas, escudo e armadura NÃO entram (pedido 2026-10-02): armas estão em
  // ATAQUES, o escudo no bloco da linha, a armadura já conta nas defesas —
  // aqui só tesouros e consumíveis
  const tesouros = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Tesouros'), { dedup: true, comQtd: false }), [fm])
  const consumiveis = useMemo(() => inventarioItens(fmPath(fm, 'Inventario', 'Consumiveis'), { dedup: false, comQtd: true }), [fm])
  if (vm.semFicha) return <Vazio texto="sem ficha — pertences indisponíveis" />
  if (!tesouros.length && !consumiveis.length) return <Vazio texto="nada no inventário" />
  return (
    <div data-escudo-pertences="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tesouros.length ? (
        <Section label="// TESOUROS">
          <HoverList items={tesouros} refs={refs} />
        </Section>
      ) : null}
      {consumiveis.length ? (
        <Section label="// CONSUMÍVEIS">
          <HoverList items={consumiveis} refs={refs} />
        </Section>
      ) : null}
    </div>
  )
}
