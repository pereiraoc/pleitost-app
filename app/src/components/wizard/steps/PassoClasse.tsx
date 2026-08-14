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
import { resetOnClasseChange } from '../reset'
import { WizCardLista, WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

/** Gate do passo: classe escolhida + todo choice de subclasse com pick.
 *  Enquanto a projeção resolve (rules undefined) o avanço fica barrado —
 *  melhor segurar meio segundo do que deixar passar sem subclasse. */
export function classeCompleta(ctx: WizardCtx): boolean {
  if (str(ctx.fm['Classe']).trim() === '') return false
  if (!ctx.rules) return false
  return ctx.rules.subclassChoices.every((c) => !!c.pick)
}

export function PassoClasse({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const catalog = useCatalog()
  const classeAtual = wikiTarget(str(fm['Classe']))

  const docIdDe = (wikilink: string): string | null => {
    const r = catalog.resolve(wikiTarget(wikilink))
    return r.kind === 'doc' ? r.id : null
  }

  const escolherClasse = (value: string) => {
    if (wikiTarget(value) !== classeAtual) resetOnClasseChange(model)
    model.set('Classe', value)
  }

  return (
    <div>
      <WizSecao
        titulo="Escolha sua Classe"
        nota="Clique numa classe pra ver os detalhes ao lado. A classe define suas proficiências, habilidades e escolhas seguintes."
      >
        <WizCardLista
          ariaLabel="Classes disponíveis"
          itens={(rules?.classes ?? []).map((o) => ({
            id: o.value,
            titulo: o.label,
            detalheId: docIdDe(o.value),
          }))}
          selecionado={
            (rules?.classes ?? []).find((o) => wikiTarget(o.value) === classeAtual)?.value ?? null
          }
          onPick={escolherClasse}
        />
        {!rules ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando classes…</span>
        ) : null}
      </WizSecao>

      {rules?.subclassChoices.map((c) => (
        <WizSecao key={c.choiceKey} titulo={`Escolha sua ${c.parent}`}>
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
    </div>
  )
}
