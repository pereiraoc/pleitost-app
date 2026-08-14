// PASSO 2 — SINTONIA APARENTE (#452 §2, issue #455).
//
// Cards das sintonias da projeção (`rules.sintonias` — Traços raiz com alias
// curto, mesma fonte do dropdown da ficha). SEM o pareamento de atributos
// (decisão do usuário: aquilo é legado). Se uma REGRA define a Sintonia
// (sintoniaRuleLocked), o passo vira informativo e o gate libera.
import { str, wikiTarget } from '../../ficha/hero-model'
import { useCatalog } from '../../../data/CatalogContext'
import { docIdOf, WizCardLista, WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

export function sintoniaCompleta(ctx: WizardCtx): boolean {
  return str(ctx.fm['Sintonia']).trim() !== '' || !!ctx.rules?.sintoniaRuleLocked
}

export function PassoSintonia({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const catalog = useCatalog()
  const atual = wikiTarget(str(fm['Sintonia']))
  const docIdDe = (wikilink: string) => docIdOf(catalog, wikilink)

  if (rules?.sintoniaRuleLocked) {
    return (
      <WizSecao
        titulo="Sintonia Aparente"
        nota="A sua Sintonia é definida por uma regra da classe/raça — nada a escolher aqui."
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>{str(fm['Sintonia']) || '—'}</span>
      </WizSecao>
    )
  }

  return (
    <WizSecao
      titulo="Escolha sua Sintonia Aparente"
      pendente={!sintoniaCompleta(ctx)}
      nota="A sintonia é o elemento que corre no seu sangue — ela colore quem você é e pesa em algumas classes (o Monge, por exemplo, luta diferente em cada uma). Toque numa sintonia pra ler os detalhes antes de escolher."
    >
      <WizCardLista
        ariaLabel="Sintonias disponíveis"
        itens={(rules?.sintonias ?? []).map((o) => ({
          id: o.value,
          titulo: o.label,
          detalheId: docIdDe(o.value),
        }))}
        selecionado={
          (rules?.sintonias ?? []).find((o) => wikiTarget(o.value) === atual)?.value ?? null
        }
        onPick={(v) => model.set('Sintonia', v)}
      />
      {!rules ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando…</span> : null}
    </WizSecao>
  )
}
