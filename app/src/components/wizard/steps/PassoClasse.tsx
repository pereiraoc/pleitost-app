// PASSO 1 — CLASSE e SUBCLASSE (#452 §1, issue #454).
//
// 1.1 Lista de cards das classes (fonte: projeção de regras `rules.classes` —
//     a MESMA do seletor da ficha; nada de varredura própria). Clique
//     seleciona E abre o doc nos Detalhes; começa desselecionada.
// 1.2 Subclasses "caso existam": `rules.subclassChoices` (Selecionar avaliado
//     pelos elementos de regra) — cards por escolha; o write usa
//     applySubclassPick (mecânica compartilhada com o ClasseNivelPanel).
//
// TROCAR de classe dispara resetOnClasseChange (reset.ts): a fonte única
// classChangeResets() + o reset do equipamento inicial do wizard — nenhuma
// seleção órfã sobrevive (magias/subclasse/técnicas/escolhas/equipamento).
import { useCatalog } from '../../../data/CatalogContext'
import { str, wikiTarget } from '../../ficha/hero-model'
import { applySubclassPick } from '../../ficha/HabilidadesTab'
import { PAPEIS, papelValuesFromFm } from '../../../grupo/party'
import { StarCell } from '../../../grupo/panel-ui'
import { ROLE_META, type RoleName } from '../../../markdown/class-roles/role-meta'
import { slugify } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { resetOnClasseChange } from '../reset'
import { docIdOf, WizCardLista, WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

/** Gate do passo: classe escolhida + todo choice de subclasse com pick.
 *  Enquanto a projeção resolve (rules undefined) o avanço fica barrado —
 *  melhor segurar meio segundo do que deixar passar sem subclasse. */
export function classeCompleta(ctx: WizardCtx): boolean {
  if (str(ctx.fm['Classe']).trim() === '') return false
  if (!ctx.rules) return false
  return ctx.rules.subclassChoices.every((c) => !!c.pick)
}

/** Ordem de exibição dos GRUPOS de classe (pedido do usuário: Conjuradores →
 *  Marcialistas → Híbridos) — o valor é a `subcategoria` REAL dos docs de
 *  classe da vault; grupos desconhecidos caem no fim. */
const ORDEM_GRUPOS_CLASSE = ['Conjurador', 'Marcialista', 'Híbrido']

export function PassoClasse({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const catalog = useCatalog()
  const classeAtual = wikiTarget(str(fm['Classe']))
  const docIdDe = (wikilink: string) => docIdOf(catalog, wikilink)

  const escolherClasse = (value: string) => {
    if (wikiTarget(value) !== classeAtual) resetOnClasseChange(model)
    model.set('Classe', value)
  }

  // Agrupa as classes pela SUBCATEGORIA do doc (fonte: catálogo — nada
  // hardcodado por classe).
  const grupos = new Map<string, { value: string; label: string; detalheId: string | null }[]>()
  for (const o of rules?.classes ?? []) {
    const id = docIdDe(o.value)
    const sub = (id ? catalog.entryById.get(id)?.subtype : null) ?? 'Outras'
    if (!grupos.has(sub)) grupos.set(sub, [])
    grupos.get(sub)!.push({ value: o.value, label: o.label, detalheId: id })
  }
  const posGrupo = (sub: string) => {
    const i = ORDEM_GRUPOS_CLASSE.indexOf(sub)
    return i === -1 ? ORDEM_GRUPOS_CLASSE.length : i
  }
  const gruposOrdenados = [...grupos.entries()].sort((a, b) => posGrupo(a[0]) - posGrupo(b[0]))
  const selecionado =
    (rules?.classes ?? []).find((o) => wikiTarget(o.value) === classeAtual)?.value ?? null

  return (
    <div>
      <WizSecao
        titulo="Escolha sua Classe"
        nota="A classe é a espinha do personagem: define o que você sabe usar, suas habilidades e as escolhas dos próximos passos. Toque numa classe pra ler a descrição completa nos detalhes antes de decidir."
      >
        {gruposOrdenados.map(([sub, itens]) => (
          <div key={sub} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...wizTitulo, fontSize: 10, marginTop: 4 }}>{sub.toUpperCase()}</span>
            <WizCardLista
              ariaLabel={`Classes — ${sub}`}
              itens={itens.map((o) => ({ id: o.value, titulo: o.label, detalheId: o.detalheId }))}
              selecionado={selecionado}
              onPick={escolherClasse}
            />
          </div>
        ))}
        {!rules ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando classes…</span>
        ) : null}
      </WizSecao>

      {rules?.subclassChoices.map((c) => (
        <WizSecao
          key={c.choiceKey}
          titulo={`Escolha: ${c.parent}`}
          nota="A subclasse especializa a sua classe — compare as opções nos detalhes e veja embaixo como cada uma muda o seu papel no grupo."
        >
          <WizCardLista
            ariaLabel={`Opções de ${c.parent}`}
            itens={c.options.map((o) => ({
              id: o.value,
              titulo: o.label,
              detalheId: docIdDe(o.value),
            }))}
            selecionado={
              c.options.find((o) => wikiTarget(o.value) === wikiTarget(c.pick ?? ''))?.value ?? null
            }
            onPick={(v) => applySubclassPick(model, fm, c.parent, v)}
          />
        </WizSecao>
      ))}

      {classeAtual ? <PapeisPreview ctx={ctx} /> : null}
    </div>
  )
}

/** Estrelas de PAPÉIS da escolha atual (pedido do usuário: "depois que escolheu
 *  subclasse, mostrar embaixo as estrelas de abatedor/vanguarda/líder/
 *  controlador"). A MESMA lógica da aba PAPÉIS do grupo: `Somar Papel.X` dos
 *  elementos de regra da classe/subclasse cascateia no FM derivado
 *  (merge-calculated) e papelValuesFromFm lê; StarCell é a célula do design e
 *  ROLE_META a fonte de cor/descrição. Atualiza AO VIVO ao trocar a subclasse. */
// Nome ACENTUADO de cada papel: as chaves do ROLE_META são a fonte de verdade
// ("Líder"...); o id do FM.Papel é o slug ASCII ("Lider") — casa por slugify.
const ROLE_NAME_BY_ID = new Map<string, RoleName>(
  (Object.keys(ROLE_META) as RoleName[]).map((n) => [slugify(n), n]),
)

function PapeisPreview({ ctx }: { ctx: WizardCtx }) {
  const valores = papelValuesFromFm((ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>)
  return (
    <WizSecao
      titulo="Papéis no grupo"
      nota="O que esta combinação de classe e subclasse contribui pro grupo — as mesmas estrelas da aba Papéis."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 8 }}>
        {PAPEIS.map((p) => {
          const nome = ROLE_NAME_BY_ID.get(p) ?? p
          const meta = ROLE_NAME_BY_ID.has(p) ? ROLE_META[ROLE_NAME_BY_ID.get(p)!] : null
          return (
            <div
              key={p}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '10px 12px',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                clipPath: clip(8),
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
                  <StarCell value={valores[p]} cor={meta?.color ?? 'var(--accent)'} />
                </span>
              </span>
              {meta ? (
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{meta.desc}</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </WizSecao>
  )
}
