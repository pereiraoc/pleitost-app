// PASSO 2 — CLASSE e SUBCLASSE (#452 §1, #454; feedback r2 #461).
//
// Barras AUTOCONTIDAS (#461 item 2): cada classe é uma barra com IMAGEM
// (creatureImageUrl — FM `Imagem` da nota), nome e as POSSIBILIDADES de papéis
// (união máxima do bloco ```class-roles``` do início da nota — RoleToken, o
// mesmo token do render do compêndio). Clicar seleciona + abre os Detalhes e
// EXPANDE ali embaixo, indentado, as escolhas de subclasse — cada opção com as
// estrelas da variante correspondente (class-roles-preview). Classe SEM
// subclasse (Monge/Mago) mostra as estrelas na própria barra considerando a
// SINTONIA (escolhida de propósito no passo anterior).
//
// TROCAR de classe dispara resetOnClasseChange (reset.ts — classChangeResets
// central + equipamento; preserva a Sintonia por decisão da nova ordem).
import { startTransition, useMemo, useState } from 'react'
import { reskinName, reskinText } from '../../../data/reskin'
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { useDocs } from '../../../data/useDoc'
import { useAssetIndex } from '../../../data/assets'
import { creatureImageUrl } from '../../../data/creature-image'
import { sintoniaDisplay, str, wikiTarget } from '../../ficha/hero-model'
import { PAPEIS, papelValuesFromFm, sintoniaEmojiDe } from '../../../grupo/party'
import { StarCell } from '../../../grupo/panel-ui'
import { ROLE_META, type RoleName } from '../../../markdown/class-roles/role-meta'
import { slugify } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { TIER_STYLE } from '../../item-card'
import { pairsOnClasseChange } from '../reset'
import {
  aliasesDeCompose,
  buildsDoCorpo,
  complementaresNivel1,
  entradasPorPapel,
  escolhasSemPapel,
  indicesDoBuildAtual,
  niveisDeCombo,
  opcoesSelecionar,
  sintoniasDoNivel,
  somaPapeis,
  somaPapeisPorSintonia,
  variantesDePapel,
  type ComboPapel,
  type EntradaPapel,
  type EscolhaPapel,
} from '../class-roles-preview'
import { linhasComPicks, linhasHabilidades, picksAtuais, type Pick } from '../picks'
import { docIdOf, WizChamada, WizSecao, WizThumb, wizTitulo } from '../bits'
import { chamadaDe, chamadaSintoniaDe } from '../chamada'
import { shortSintoniaName, shortSubclassName } from '../../../rules/projection'
import type { WizardCtx } from '../steps'
import type { Build } from '../../../markdown/class-roles/parse'
import type { VaultDoc } from '../../../data/types'

/** Ordem de exibição dos GRUPOS de classe (pedido do usuário: Conjuradores →
 *  Marcialistas → Híbridos) — o valor é a `subcategoria` REAL dos docs de
 *  classe da vault; grupos desconhecidos caem no fim. */
const ORDEM_GRUPOS_CLASSE = ['Conjurador', 'Marcialista', 'Híbrido']

/** Gate do passo: classe escolhida + todo choice de subclasse com pick.
 *  Enquanto a projeção resolve (rules undefined OU re-extração no ar após
 *  trocar a classe — `stale`) o avanço fica barrado — melhor segurar meio
 *  segundo do que deixar passar com as escolhas da classe anterior. */
export function classeCompleta(ctx: WizardCtx): boolean {
  if (str(ctx.fm['Classe']).trim() === '') return false
  if (!ctx.rules || ctx.rules.stale) return false
  return ctx.rules.subclassChoices.every((c) => !!c.pick)
}

/** UMA possibilidade de combinação como ESTRELAS PURAS (sem nome de papel):
 *  ★×peso na cor de cada papel (ROLE_META), pesos em ordem decrescente —
 *  sempre 3 estrelas no total (os builds somam 3). O tooltip nativo explica de
 *  onde vêm ("Monge (Água): Vanguarda ★★ · Controlador ★"). `on` destaca a
 *  possibilidade MAPEADA pelas escolhas atuais (#452 r4). */
function EstrelasPossibilidade({
  nome,
  roles,
  on,
}: {
  nome: string
  roles: Partial<Record<RoleName, number>>
  on?: boolean
}) {
  const entries = (Object.entries(roles) as [RoleName, number][]).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  const tooltip = `${reskinName(nome)}: ${entries.map(([r, v]) => `${r} ${'★'.repeat(v)}`).join(' · ')}`
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      data-possibilidade-atual={on ? '' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        letterSpacing: '1px',
        cursor: 'help',
        fontSize: 13,
        padding: '1px 5px',
        borderRadius: 5,
        background: on ? 'color-mix(in srgb,var(--accent) 22%,transparent)' : 'transparent',
        boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb,var(--accent) 65%,transparent)' : 'none',
      }}
    >
      {entries.map(([role, value]) => (
        <span key={role} style={{ color: ROLE_META[role].color }}>
          {'★'.repeat(value)}
        </span>
      ))}
    </span>
  )
}

/** O que uma nota ADICIONA de papéis: "+" + estrelinhas coloridas (Somar
 *  Papel.X dos elementos de regra). Tooltip explica a soma. */
function MaisEstrelas({ nome, roles }: { nome: string; roles: Partial<Record<RoleName, number>> }) {
  const entries = (Object.entries(roles) as [RoleName, number][]).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  const tooltip = `${reskinName(nome)} adiciona: ${entries.map(([r, v]) => `${r} ${'★'.repeat(v)}`).join(' · ')}`
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'help', fontSize: 13, letterSpacing: '1px' }}
    >
      <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 12 }}>+</span>
      {entries.map(([role, value]) => (
        <span key={role} style={{ color: ROLE_META[role].color }}>
          {'★'.repeat(value)}
        </span>
      ))}
    </span>
  )
}

/** As POSSIBILIDADES da classe num containerzinho, separadas por divisórias —
 *  uma por build do class-roles, com HIGHLIGHT nas compatíveis com as escolhas
 *  atuais (`atuais`). */
function Possibilidades({ builds, atuais }: { builds: Build[]; atuais: number[] }) {
  if (!builds.length) return null
  const marcadas = new Set(atuais.length < builds.length ? atuais : [])
  return (
    <span
      data-testid="possibilidades"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'flex-end',
        padding: '3px 7px',
        border: '1px solid var(--line2)',
        borderRadius: 7,
        background: 'var(--panel2)',
      }}
    >
      {builds.map(([nome, roles], i) => (
        <span key={nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 ? (
            <span
              aria-hidden
              style={{
                width: 0,
                alignSelf: 'stretch',
                borderLeft: '1px solid color-mix(in srgb,var(--muted) 45%,transparent)',
              }}
            />
          ) : null}
          <EstrelasPossibilidade nome={nome} roles={roles} on={marcadas.has(i)} />
        </span>
      ))}
    </span>
  )
}

function Barra({
  on,
  indent,
  onClick,
  ariaLabel,
  children,
}: {
  on: boolean
  /** Níveis de indentação (26px cada) — subclasse = 1, escolha aninhada = 2. */
  indent?: number
  /** Sem onClick a barra é INFORMATIVA (sintonia sob a classe, #452 r11):
   *  mesmo visual, mas não clicável nem focável. */
  onClick?: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  // Barra INFORMATIVA (#452 r13): o idioma de "não clicável" do app é o do
  // EmptySlot — borda TRACEJADA + tinta esmaecida, sem o card sólido, pra não
  // parecer uma opção selecionável. A marcada mantém o tom de accent suave.
  const informativa = !onClick
  return (
    <button
      role="option"
      aria-selected={on}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={informativa}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        marginLeft: (indent ?? 0) * 26,
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 14,
        color: 'var(--text)',
        background: informativa
          ? on
            ? 'color-mix(in srgb,var(--accent) 8%,transparent)'
            : 'color-mix(in srgb,var(--muted) 7%,transparent)'
          : on
            ? 'color-mix(in srgb,var(--accent) 13%,var(--card))'
            : 'var(--card)',
        border: informativa
          ? `1px dashed ${on ? 'color-mix(in srgb,var(--accent) 55%,transparent)' : 'color-mix(in srgb,var(--muted) 55%,transparent)'}`
          : `1px solid ${on ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
        cursor: informativa ? 'default' : 'pointer',
        clipPath: clip(8),
      }}
    >
      {children}
    </button>
  )
}

export function PassoClasse({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const catalog = useCatalog()
  const detail = useDetail()
  const assets = useAssetIndex()
  const classeAtual = wikiTarget(str(fm['Classe']))
  const sintoniaCurta = sintoniaDisplay(str(fm['Sintonia']))
  // Picks de subclasse GRAVADOS (Habilidades.Lista) — lidos do FM na hora, sem
  // esperar a re-projeção das regras (responsividade, 2026-09-24).
  const picks = picksAtuais(fm)

  // Classes da projeção agrupadas pela SUBCATEGORIA do doc (fonte: catálogo).
  const grupos = useMemo(() => {
    const out = new Map<string, { value: string; label: string; id: string | null }[]>()
    for (const o of rules?.classes ?? []) {
      const id = docIdOf(catalog, o.value)
      const sub = (id ? catalog.entryById.get(id)?.subtype : null) ?? 'Outras'
      if (!out.has(sub)) out.set(sub, [])
      out.get(sub)!.push({ value: o.value, label: o.label, id })
    }
    const pos = (sub: string) => {
      const i = ORDEM_GRUPOS_CLASSE.indexOf(sub)
      return i === -1 ? ORDEM_GRUPOS_CLASSE.length : i
    }
    return [...out.entries()].sort((a, b) => pos(a[0]) - pos(b[0]))
  }, [rules?.classes, catalog])

  // Docs das classes (imagem + bloco class-roles do corpo).
  const classIds = useMemo(
    () => grupos.flatMap(([, itens]) => itens.map((i) => i.id)).filter((x): x is string => !!x),
    [grupos],
  )
  const classDocs = useDocs(classIds)
  const buildsDe = (id: string | null): Build[] =>
    id ? buildsDoCorpo(classDocs?.get(id)?.body ?? '') : []
  const regrasDe = (doc: VaultDoc | undefined): unknown =>
    (doc?.frontmatter as Record<string, unknown> | undefined)?.['Elementos_de_Regra']

  // ESCOLHAS de nível 1 de TODAS as classes, em dois saltos de docs: classe →
  // notas de escolha (Selecionar) → notas de opção (Somar Papel/Chamada). É a
  // fonte das barras de subclasse (sem esperar a projeção — ela só volta
  // depois do BFS das regras, e era isso que "demorava" ao clicar) e do
  // FILTRO POR PAPEL (variantesDePapel: os totais vêm das regras).
  const idDe = (alvo: string) => docIdOf(catalog, `[[${alvo}]]`)
  const escolhaIds = useMemo(
    () =>
      classIds
        .flatMap((id) => complementaresNivel1(regrasDe(classDocs?.get(id))).map(idDe))
        .filter((x): x is string => !!x),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classIds, classDocs, catalog],
  )
  const escolhaDocs = useDocs(escolhaIds)
  const opcaoIds = useMemo(
    () =>
      escolhaIds
        .flatMap((id) => opcoesSelecionar(regrasDe(escolhaDocs?.get(id))).map(idDe))
        .filter((x): x is string => !!x),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escolhaIds, escolhaDocs, catalog],
  )
  const opcaoDocs = useDocs(opcaoIds)
  const docOpcao = (alvo: string): VaultDoc | undefined => {
    const id = idDe(alvo)
    return id ? opcaoDocs?.get(id) : undefined
  }
  /** Escolhas de nível 1 da classe com o que cada opção SOMA de papel. */
  const escolhasDaClasse = (doc: VaultDoc | undefined): EscolhaPapel[] =>
    complementaresNivel1(regrasDe(doc))
      .map((alvo) => {
        const id = idDe(alvo)
        const d = id ? escolhaDocs?.get(id) : undefined
        const alvos = opcoesSelecionar(regrasDe(d))
        if (!alvos.length) return null
        return {
          parent: d?.basename ?? alvo,
          opcoes: alvos.map((a) => ({ alvo: a, soma: somaPapeis(regrasDe(docOpcao(a))) })),
        }
      })
      .filter((e): e is EscolhaPapel => e !== null)
  const sintoniaTargets = (rules?.sintonias ?? []).map((o) => wikiTarget(o.value))
  /** Aliases de Compor da opção (highlight da possibilidade atual). */
  const textosDe = (alvo: string): string[] => [
    shortSubclassName(alvo),
    ...aliasesDeCompose(regrasDe(docOpcao(alvo))),
  ]

  type Item = { value: string; label: string; id: string | null }

  /** ESCOLHER: classe (+ picks de subclasse) numa escrita só. Classe nova →
   *  resets centrais + Classe + linhas frescas dos picks; mesma classe → só
   *  troca as linhas das escolhas tocadas. Abrir os DETALHES fica em
   *  transição pra marcação da barra pintar antes (2026-09-24). */
  const escolher = (item: Item, novos: Pick[], abrir?: string) => {
    if (wikiTarget(item.value) !== classeAtual) {
      const pares: Array<[string, unknown]> = [...pairsOnClasseChange(), ['Classe', item.value]]
      if (novos.length) pares.push(['Habilidades.Lista', linhasComPicks([], novos)])
      model.setMany(pares)
    } else if (novos.length) {
      model.set('Habilidades.Lista', linhasComPicks(linhasHabilidades(fm), novos))
    }
    const id = abrir ? idDe(abrir) : docIdOf(catalog, item.value)
    if (id) startTransition(() => detail?.open({ kind: 'doc', id }))
  }

  // FILTRO POR PAPEL (2026-09-23): tocar num card de PAPEL NO GRUPO lista só
  // as classes que podem ter ≥★ daquele papel, agrupadas por quantidade de
  // estrelas e mostrando com QUAL combinação de subclasse/sintonia chegam lá.
  const [filtroPapel, setFiltroPapel] = useState<RoleName | null>(null)
  /** Grupos do filtro: estrelas (desc) → [classe + a entrada dela]. */
  const gruposFiltro = useMemo((): [number, { item: Item; entrada: EntradaPapel }[]][] | null => {
    if (!filtroPapel) return null
    const porEstrelas = new Map<number, { item: Item; entrada: EntradaPapel }[]>()
    for (const item of grupos.flatMap(([, itens]) => itens)) {
      const doc = item.id ? classDocs?.get(item.id) : undefined
      const regras = regrasDe(doc)
      const variantes = variantesDePapel({
        somaClasse: somaPapeis(regras),
        somaSintonia: somaPapeisPorSintonia(regras),
        escolhas: escolhasDaClasse(doc),
        sintonias: sintoniaTargets,
      })
      for (const entrada of entradasPorPapel(variantes, filtroPapel)) {
        if (!porEstrelas.has(entrada.estrelas)) porEstrelas.set(entrada.estrelas, [])
        porEstrelas.get(entrada.estrelas)!.push({ item, entrada })
      }
    }
    return [...porEstrelas.entries()].sort((a, b) => b[0] - a[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroPapel, grupos, classDocs, escolhaDocs, opcaoDocs, rules?.sintonias])

  const pendente = !classeCompleta(ctx)

  const linhaNome: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 4,
  }
  const check = <span style={{ flex: 'none', color: 'var(--accent)', fontWeight: 800 }}>✓</span>
  const cabecalho = (texto: string, nivel: number) => (
    <span style={{ ...wizTitulo, fontSize: 9.5, marginLeft: 26 * nivel }}>{reskinName(texto).toUpperCase()}</span>
  )

  /** Barra de UMA OPÇÃO de subclasse: clicável em qualquer classe — escolhe a
   *  classe junto (com os picks do caminho até aqui). ✓ quando é o pick
   *  gravado da classe selecionada. */
  const barraOpcao = (item: Item, on: boolean, caminho: Pick[], nivel: number) => {
    const pick = caminho[caminho.length - 1]!
    const d = docOpcao(pick.alvo)
    const rotulo = reskinName(shortSubclassName(pick.alvo))
    const optOn = on && picks.get(pick.parent) === pick.alvo
    const c = chamadaDe(d)
    return (
      <Barra
        key={pick.alvo}
        on={optOn}
        indent={nivel}
        ariaLabel={rotulo}
        onClick={() => escolher(item, caminho, pick.alvo)}
      >
        <span style={linhaNome}>
          <span style={{ fontWeight: 600, marginRight: 'auto' }}>{rotulo}</span>
          <MaisEstrelas nome={pick.alvo} roles={somaPapeis(regrasDe(d))} />
          {c ? <WizChamada>{c}</WizChamada> : null}
        </span>
        {optOn ? check : null}
      </Barra>
    )
  }

  /** Barras INFORMATIVAS de sintonia sob a classe (#452 r9/r11): trocar é lá
   *  no passo 1; a escolhida já marcada, com o "+★" que cada uma adiciona PRA
   *  ESTA classe e a chamada por elemento (FM `Chamada_Sintonia`). */
  const barrasSintonia = (doc: VaultDoc | undefined, alvos: string[], nivel: number) => {
    const somaSintonia = somaPapeisPorSintonia(regrasDe(doc))
    const opts = (rules?.sintonias ?? []).filter((opt) => alvos.includes(wikiTarget(opt.value)))
    if (!opts.length || rules?.sintoniaRuleLocked) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cabecalho(reskinText('Sintonia'), nivel)}
        {opts.map((opt) => {
          const alvo = wikiTarget(opt.value)
          const optOn = alvo === wikiTarget(str(fm['Sintonia']))
          const ic = sintoniaEmojiDe(opt.value)
          const c = chamadaSintoniaDe(doc, shortSintoniaName(alvo))
          return (
            <Barra key={opt.value} on={optOn} indent={nivel} ariaLabel={reskinName(opt.label)}>
              <span style={linhaNome}>
                <span style={{ fontWeight: 600, marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {ic ? <span style={{ fontSize: 15 }}>{ic}</span> : null}
                  {sintoniaDisplay(opt.value)}
                </span>
                <MaisEstrelas nome={opt.label} roles={somaSintonia.get(alvo) ?? {}} />
                {c ? <WizChamada>{c}</WizChamada> : null}
              </span>
              {optOn ? check : null}
            </Barra>
          )
        })}
      </div>
    )
  }

  /** ÁRVORE das combinações de uma entrada do filtro: as opções do nível
   *  `depth` (cabeçalho da escolha uma vez), cada uma com a próxima escolha
   *  ANINHADA embaixo (Bardo: Inspirador → Luta Artística) — só as
   *  combinações que chegam à quantidade do grupo. As sintonias entram no
   *  nível em que a combinação termina. */
  const renderArvore = (
    item: Item,
    on: boolean,
    doc: VaultDoc | undefined,
    combos: ComboPapel[],
    depth: number,
    caminho: Pick[],
  ): React.ReactNode => {
    const niveis = niveisDeCombo(combos, depth)
    const sint = sintoniasDoNivel(combos, depth)
    return (
      <>
        {niveis.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cabecalho(niveis[0]!.parent, depth + 1)}
            {niveis.map((n) => {
              const pick = { parent: n.parent, alvo: n.alvo }
              return (
                <div key={n.alvo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {barraOpcao(item, on, [...caminho, pick], depth + 1)}
                  {renderArvore(item, on, doc, n.filhos, depth + 1, [...caminho, pick])}
                </div>
              )
            })}
          </div>
        ) : null}
        {sint.length ? barrasSintonia(doc, sint, depth + 1) : null}
      </>
    )
  }

  /** Uma CLASSE da lista (barra + o que fica indentado embaixo). No modo
   *  filtro a mesma classe pode aparecer em mais de um grupo — `chave` é
   *  única por grupo, `entrada` traz as combinações daquele grupo e a faixa
   *  de possibilidades aparece em TODAS as barras. */
  const renderClasse = (o: Item, chave: string, entrada: EntradaPapel | null) => {
    const on = wikiTarget(o.value) === classeAtual
    const doc = o.id ? classDocs?.get(o.id) : undefined
    const builds = buildsDe(o.id)
    const img = creatureImageUrl(doc, assets, true)
    const somaClasse = somaPapeis(regrasDe(doc))
    const somaSintonia = somaPapeisPorSintonia(regrasDe(doc))
    const escolhas = escolhasDaClasse(doc)
    // HIGHLIGHT da possibilidade mapeada pelos picks atuais (com aliases de
    // Compor) — ou pela SINTONIA nas classes sem escolha (Monge). Só na
    // classe selecionada.
    const gruposHl: string[][] = on
      ? escolhas.length
        ? escolhas
            .map((e) => picks.get(e.parent))
            .filter((alvo): alvo is string => !!alvo)
            .map(textosDe)
        : sintoniaCurta
          ? [[sintoniaCurta]]
          : []
      : []
    const atuais = gruposHl.length ? indicesDoBuildAtual(builds, gruposHl) : []
    const chamada = chamadaDe(doc)

    // Embaixo da classe. Sem filtro: só na selecionada — cada escolha com
    // TODAS as opções (clicáveis) e, nas classes sem escolha que variam por
    // sintonia, as barras de sintonia. Com filtro: em toda classe listada, a
    // ÁRVORE das combinações do grupo + as escolhas que não somam papel
    // (Círculo Druídico) com todas as opções.
    const embaixo = entrada ? (
      <>
        {renderArvore(o, on, doc, entrada.combos, 0, [])}
        {escolhasSemPapel(escolhas).map((e) => (
          <div key={e.parent} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cabecalho(e.parent, 1)}
            {e.opcoes.map((op) => barraOpcao(o, on, [{ parent: e.parent, alvo: op.alvo }], 1))}
          </div>
        ))}
      </>
    ) : on ? (
      <>
        {escolhas.map((e) => (
          <div key={e.parent} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cabecalho(e.parent, 1)}
            {e.opcoes.map((op) => barraOpcao(o, on, [{ parent: e.parent, alvo: op.alvo }], 1))}
          </div>
        ))}
        {!escolhas.length && somaSintonia.size > 0 ? barrasSintonia(doc, sintoniaTargets, 1) : null}
      </>
    ) : null

    return (
      <div key={chave} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Barra on={on} onClick={() => escolher(o, [])} ariaLabel={reskinName(o.label)}>
          {img ? (
            <WizThumb img={img} imgFull={creatureImageUrl(doc, assets, false)} size={44} cover />
          ) : null}
          <span style={linhaNome}>
            <span style={{ fontWeight: 700, marginRight: 'auto' }}>{reskinName(o.label)}</span>
            {/* #452 r12: papéis (possibilidades + "+★") só na classe
                SELECIONADA — com o FILTRO ligado, em todas (é o que se
                compara). */}
            {on || entrada ? (
              <>
                <Possibilidades builds={builds} atuais={atuais} />
                <MaisEstrelas nome={o.label} roles={somaClasse} />
              </>
            ) : null}
            {/* CHAMADA (2026-09-23): o resumo curto da classe, discreto,
                só na classe SELECIONADA — FM `Chamada` da nota (ou o
                override do mundo), ver wizard/chamada.ts. */}
            {on && chamada ? <WizChamada>{chamada}</WizChamada> : null}
          </span>
          {on ? check : null}
        </Barra>
        {embaixo}
      </div>
    )
  }

  return (
    <div>
      {/* #452 r3: os PAPÉIS ficam NO TOPO e aparecem SEMPRE (zerados antes da
          classe) — o jogador acompanha as estrelas enchendo conforme escolhe. */}
      <PapeisPreview
        ctx={ctx}
        filtro={filtroPapel}
        onToggle={(p) => setFiltroPapel((atual) => (atual === p ? null : p))}
      />

      <WizSecao
        titulo="Escolha sua Classe"
        pendente={pendente}
        nota="A classe é a espinha do personagem: define o que você sabe usar, suas habilidades e as escolhas dos próximos passos. Cada barra mostra os papéis que a classe pode assumir — toque pra ler os detalhes e abrir as subclasses."
      >
        {gruposFiltro
          ? gruposFiltro.length ? (
              gruposFiltro.map(([estrelas, entradas]) => (
                <div
                  key={estrelas}
                  data-testid="filtro-grupo"
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <span
                    style={{ ...wizTitulo, fontSize: 10, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>{ROLE_META[filtroPapel!].plural.toUpperCase()}</span>
                    <span
                      data-testid="filtro-estrelas"
                      style={{ color: ROLE_META[filtroPapel!].color, letterSpacing: '1px', fontSize: 12 }}
                    >
                      {'★'.repeat(estrelas)}
                    </span>
                  </span>
                  {entradas.map(({ item, entrada }) => renderClasse(item, `${item.value}#${estrelas}`, entrada))}
                </div>
              ))
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {classDocs ? 'Nenhuma classe chega a ★ nesse papel.' : 'Carregando classes…'}
              </span>
            )
          : grupos.map(([sub, itens]) => (
              <div key={sub} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ ...wizTitulo, fontSize: 10, marginTop: 4 }}>{reskinText(sub).toUpperCase()}</span>
                {itens.map((o) => renderClasse(o, o.value, null))}
              </div>
            ))}
        {!rules ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando classes…</span> : null}
      </WizSecao>
    </div>
  )
}

// Nome ACENTUADO de cada papel: as chaves do ROLE_META são a fonte de verdade
// ("Líder"...); o id do FM.Papel é o slug ASCII ("Lider") — casa por slugify.
const ROLE_NAME_BY_ID = new Map<string, RoleName>(
  (Object.keys(ROLE_META) as RoleName[]).map((n) => [slugify(n), n]),
)

/** Estrelas de PAPÉIS da escolha atual — a MESMA lógica da aba PAPÉIS do grupo
 *  (`Somar Papel.X` dos elementos de regra cascateado no FM derivado →
 *  papelValuesFromFm; StarCell do design; ROLE_META cor/descrição). Atualiza AO
 *  VIVO ao trocar a subclasse. Direto ao ponto, sem nota (#461 item 4).
 *  #452 r10: cards ORDENADOS pelo valor atual (maior primeiro; empate mantém a
 *  ordem do registro — sort estável) e MOLDURA discreta do TIER_STYLE das
 *  imbuições por estrelas: 1★ aço (Adepto), 2★ prata (Experiente), 3★ ouro
 *  (Mestre); 0★ segue no card neutro.
 *  2026-09-23: os cards são BOTÕES — tocar liga o FILTRO por aquele papel na
 *  lista de classes (aria-pressed); tocar de novo desliga. */
function PapeisPreview({
  ctx,
  filtro,
  onToggle,
}: {
  ctx: WizardCtx
  filtro: RoleName | null
  onToggle: (papel: RoleName) => void
}) {
  const valores = papelValuesFromFm((ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>)
  const ordenados = [...PAPEIS].sort((a, b) => valores[b] - valores[a])
  return (
    <WizSecao
      titulo="Papel no Grupo"
      nota="Toque num papel pra ver só as classes que podem tê-lo, agrupadas por estrelas e com a subclasse ou sintonia que chega lá. Toque de novo pra tirar o filtro."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 8 }}>
        {ordenados.map((p) => {
          const nome = ROLE_NAME_BY_ID.get(p) ?? p
          const meta = ROLE_NAME_BY_ID.has(p) ? ROLE_META[ROLE_NAME_BY_ID.get(p)!] : null
          const valor = valores[p]
          const tier = valor >= 3 ? 'M' : valor === 2 ? 'E' : valor === 1 ? 'A' : null
          const t = tier ? TIER_STYLE[tier] : null
          const roleName = ROLE_NAME_BY_ID.get(p) ?? null
          const ativo = roleName !== null && filtro === roleName
          return (
            <div
              key={p}
              style={{
                // Moldura: gradiente do tier na borda (padding + card por cima),
                // sem glow — o clipPath cortaria e o pedido é "nada exagerado".
                padding: t ? 1.5 : 0,
                background: t?.grad,
                clipPath: clip(8),
              }}
            >
            <button
              type="button"
              aria-pressed={ativo}
              aria-label={`Filtrar por ${nome}`}
              onClick={roleName ? () => onToggle(roleName) : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'var(--text)',
                cursor: 'pointer',
                background: ativo
                  ? `color-mix(in srgb,${meta?.color ?? 'var(--accent)'} 14%,${t ? t.tint : 'var(--card)'})`
                  : t
                    ? t.tint
                    : 'var(--card)',
                border: t ? 'none' : '1px solid var(--line2)',
                boxShadow: ativo
                  ? `inset 0 0 0 1.5px ${meta?.color ?? 'var(--accent)'}`
                  : 'none',
                clipPath: clip(t ? 7 : 8),
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.1em',
                    color: meta?.color ?? 'var(--text)',
                  }}
                >
                  {nome.toUpperCase()}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <StarCell value={valores[p]} cor={meta?.color ?? 'var(--accent)'} semGuia />
                </span>
              </span>
              {meta ? (
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{meta.desc}</span>
              ) : null}
            </button>
            </div>
          )
        })}
      </div>
    </WizSecao>
  )
}
