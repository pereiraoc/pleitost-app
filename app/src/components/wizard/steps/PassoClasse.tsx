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
import { useMemo } from 'react'
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { useDocs } from '../../../data/useDoc'
import { useAssetIndex } from '../../../data/assets'
import { creatureImageUrl } from '../../../data/creature-image'
import { shortSintonia, str, wikiTarget } from '../../ficha/hero-model'
import { applySubclassPick } from '../../ficha/HabilidadesTab'
import { PAPEIS, papelValuesFromFm, sintoniaEmojiDe } from '../../../grupo/party'
import { StarCell } from '../../../grupo/panel-ui'
import { ROLE_META, type RoleName } from '../../../markdown/class-roles/role-meta'
import { slugify } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { TIER_STYLE } from '../../item-card'
import { resetOnClasseChange } from '../reset'
import {
  aliasesDeCompose,
  buildsDoCorpo,
  indicesDoBuildAtual,
  somaPapeis,
  somaPapeisPorSintonia,
} from '../class-roles-preview'
import { docIdOf, WizSecao, WizThumb, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'
import type { Build } from '../../../markdown/class-roles/parse'

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
  const tooltip = `${nome}: ${entries.map(([r, v]) => `${r} ${'★'.repeat(v)}`).join(' · ')}`
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
  const tooltip = `${nome} adiciona: ${entries.map(([r, v]) => `${r} ${'★'.repeat(v)}`).join(' · ')}`
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
  indent?: boolean
  /** Sem onClick a barra é INFORMATIVA (sintonia sob a classe, #452 r11):
   *  mesmo visual, mas não clicável nem focável. */
  onClick?: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      role="option"
      aria-selected={on}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        marginLeft: indent ? 26 : 0,
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 14,
        color: 'var(--text)',
        background: on ? 'color-mix(in srgb,var(--accent) 13%,var(--card))' : 'var(--card)',
        border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
        cursor: onClick ? 'pointer' : 'default',
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
  const sintoniaCurta = shortSintonia(str(fm['Sintonia']))

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

  // Docs das OPÇÕES de subclasse — os builds do class-roles nomeiam pelas
  // composições de alias ("Estudos do Vazio" compõe "Bruxo"); o match usa
  // rótulo + aliases (aliasesDeCompose sobre os ruleElements da nota).
  // Com a re-extração NO AR (classe recém-trocada, `stale`) as escolhas ainda
  // são da classe ANTERIOR — esconde em vez de piscar as opções erradas por
  // um instante embaixo da nova classe (#452 r9).
  const escolhasAll = rules && !rules.stale ? rules.subclassChoices : []
  const opcaoIds = useMemo(
    () =>
      escolhasAll
        .flatMap((c) => c.options.map((o) => docIdOf(catalog, o.value)))
        .filter((x): x is string => !!x),
    [escolhasAll, catalog],
  )
  const opcaoDocs = useDocs(opcaoIds)
  const textosDe = (valor: string, rotulo: string): string[] => {
    const id = docIdOf(catalog, valor)
    const d = id ? opcaoDocs?.get(id) : undefined
    const aliases = aliasesDeCompose(
      (d?.frontmatter as Record<string, unknown> | undefined)?.['Elementos_de_Regra'],
    )
    return [rotulo, ...aliases]
  }

  const escolherClasse = (value: string) => {
    if (wikiTarget(value) !== classeAtual) resetOnClasseChange(model)
    model.set('Classe', value)
    const id = docIdOf(catalog, value)
    if (id) detail?.open({ kind: 'doc', id })
  }

  const pendente = !classeCompleta(ctx)

  return (
    <div>
      {/* #452 r3: os PAPÉIS ficam NO TOPO e aparecem SEMPRE (zerados antes da
          classe) — o jogador acompanha as estrelas enchendo conforme escolhe. */}
      <PapeisPreview ctx={ctx} />

      <WizSecao
        titulo="Escolha sua Classe"
        pendente={pendente}
        nota="A classe é a espinha do personagem: define o que você sabe usar, suas habilidades e as escolhas dos próximos passos. Cada barra mostra os papéis que a classe pode assumir — toque pra ler os detalhes e abrir as subclasses."
      >
        {grupos.map(([sub, itens]) => (
          <div key={sub} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...wizTitulo, fontSize: 10, marginTop: 4 }}>{sub.toUpperCase()}</span>
            {itens.map((o) => {
              const on = wikiTarget(o.value) === classeAtual
              const doc = o.id ? classDocs?.get(o.id) : undefined
              const builds = buildsDe(o.id)
              const img = creatureImageUrl(doc, assets, true)
              // O que a CLASSE adiciona (+★, Somar Papel dos elementos dela).
              const somaClasse = somaPapeis(
                (doc?.frontmatter as Record<string, unknown> | undefined)?.['Elementos_de_Regra'],
              )
              // Papéis definidos TAMBÉM pela sintonia (Condicional Sintonia no
              // doc — Monge/Animista): o que cada sintonia adiciona pra ESTA
              // classe (#452 r9).
              const somaSintonia = somaPapeisPorSintonia(
                (doc?.frontmatter as Record<string, unknown> | undefined)?.['Elementos_de_Regra'],
              )
              // HIGHLIGHT da possibilidade mapeada pelas escolhas atuais: picks
              // (com aliases de Compor) nas classes com subclasse; SINTONIA nas
              // sem (Monge). Só na classe selecionada.
              const grupos: string[][] = on
                ? escolhasAll.length
                  ? escolhasAll
                      .filter((c) => c.pick)
                      .map((c) => {
                        // o pick pode vir como wikilink/alias cru — casa a
                        // OPÇÃO correspondente e usa rótulo + aliases dela.
                        const optPicked = c.options.find(
                          (o) => wikiTarget(o.value) === wikiTarget(c.pick!),
                        )
                        return optPicked
                          ? textosDe(optPicked.value, optPicked.label)
                          : [c.pick!]
                      })
                  : sintoniaCurta
                    ? [[sintoniaCurta]]
                    : []
                : []
              const atuais = grupos.length ? indicesDoBuildAtual(builds, grupos) : []
              return (
                <div key={o.value} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Barra on={on} onClick={() => escolherClasse(o.value)} ariaLabel={o.label}>
                    {img ? (
                      <WizThumb
                        img={img}
                        imgFull={creatureImageUrl(doc, assets, false)}
                        size={44}
                        cover
                      />
                    ) : null}
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
                      <span style={{ fontWeight: 700, marginRight: 'auto' }}>{o.label}</span>
                      {/* #452 r12: papéis (possibilidades + "+★") só na classe
                          SELECIONADA — as demais barras ficam só imagem+nome. */}
                      {on ? (
                        <>
                          <Possibilidades builds={builds} atuais={atuais} />
                          <MaisEstrelas nome={o.label} roles={somaClasse} />
                        </>
                      ) : null}
                    </span>
                    {on ? <span style={{ flex: 'none', color: 'var(--accent)', fontWeight: 800 }}>✓</span> : null}
                  </Barra>

                  {/* Subclasses INDENTADAS logo abaixo da classe selecionada. */}
                  {on
                    ? escolhasAll.map((c) => (
                        <div key={c.choiceKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ ...wizTitulo, fontSize: 9.5, marginLeft: 26 }}>
                            {c.parent.toUpperCase()}
                          </span>
                          {c.options.map((opt) => {
                            const optOn = wikiTarget(opt.value) === wikiTarget(c.pick ?? '')
                            const optId = docIdOf(catalog, opt.value)
                            // #452 r4: a subclasse mostra o que ELA ADICIONA
                            // (Somar Papel da própria nota), não o total.
                            const optSoma = somaPapeis(
                              (optId ? opcaoDocs?.get(optId)?.frontmatter : undefined)?.[
                                'Elementos_de_Regra'
                              ],
                            )
                            return (
                              <Barra
                                key={opt.value}
                                on={optOn}
                                indent
                                ariaLabel={opt.label}
                                onClick={() => {
                                  applySubclassPick(model, fm, c.parent, opt.value)
                                  const id = docIdOf(catalog, opt.value)
                                  if (id) detail?.open({ kind: 'doc', id })
                                }}
                              >
                                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
                                  <span style={{ fontWeight: 600, marginRight: 'auto' }}>{opt.label}</span>
                                  <MaisEstrelas nome={opt.label} roles={optSoma} />
                                </span>
                                {optOn ? (
                                  <span style={{ flex: 'none', color: 'var(--accent)', fontWeight: 800 }}>✓</span>
                                ) : null}
                              </Barra>
                            )
                          })}
                        </div>
                      ))
                    : null}

                  {/* SINTONIA indentada (#452 r9/r11): classe cujos papéis
                      também dependem da sintonia mostra as opções como barras
                      INFORMATIVAS (não clicáveis — trocar é lá no passo 1),
                      com a escolhida já marcada e o "+★" que cada uma
                      adiciona PRA ESTA classe. */}
                  {on && !escolhasAll.length && somaSintonia.size > 0 && !rules?.sintoniaRuleLocked
                    ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ ...wizTitulo, fontSize: 9.5, marginLeft: 26 }}>SINTONIA</span>
                          {(rules?.sintonias ?? []).map((opt) => {
                            const optOn =
                              wikiTarget(opt.value) === wikiTarget(str(fm['Sintonia']))
                            const soma = somaSintonia.get(wikiTarget(opt.value)) ?? {}
                            const ic = sintoniaEmojiDe(opt.value)
                            return (
                              <Barra key={opt.value} on={optOn} indent ariaLabel={opt.label}>
                                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
                                  <span style={{ fontWeight: 600, marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {ic ? <span style={{ fontSize: 15 }}>{ic}</span> : null}
                                    {opt.label}
                                  </span>
                                  <MaisEstrelas nome={opt.label} roles={soma} />
                                </span>
                                {optOn ? (
                                  <span style={{ flex: 'none', color: 'var(--accent)', fontWeight: 800 }}>✓</span>
                                ) : null}
                              </Barra>
                            )
                          })}
                        </div>
                      )
                    : null}
                </div>
              )
            })}
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
 *  (Mestre); 0★ segue no card neutro. */
function PapeisPreview({ ctx }: { ctx: WizardCtx }) {
  const valores = papelValuesFromFm((ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>)
  const ordenados = [...PAPEIS].sort((a, b) => valores[b] - valores[a])
  return (
    <WizSecao titulo="Papel no Grupo">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 8 }}>
        {ordenados.map((p) => {
          const nome = ROLE_NAME_BY_ID.get(p) ?? p
          const meta = ROLE_NAME_BY_ID.has(p) ? ROLE_META[ROLE_NAME_BY_ID.get(p)!] : null
          const valor = valores[p]
          const tier = valor >= 3 ? 'M' : valor === 2 ? 'E' : valor === 1 ? 'A' : null
          const t = tier ? TIER_STYLE[tier] : null
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                height: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                background: t ? t.tint : 'var(--card)',
                border: t ? 'none' : '1px solid var(--line2)',
                clipPath: clip(t ? 7 : 8),
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            </div>
            </div>
          )
        })}
      </div>
    </WizSecao>
  )
}
