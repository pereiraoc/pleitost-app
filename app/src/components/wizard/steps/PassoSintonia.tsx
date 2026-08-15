// PASSO 1 — SINTONIA APARENTE (#452 §2, #455; lore + emojis no r3).
//
// Cards das sintonias da projeção (`rules.sintonias` — Traços raiz com alias
// curto, mesma fonte do dropdown da ficha), cada um com o emoji do ELEMENTO
// do registro central (tokens.emojis.sintonia via sintoniaEmojiDe — o mesmo
// da ficha de grupo). SEM o pareamento de atributos (decisão do usuário:
// aquilo é legado). Se uma REGRA define a Sintonia (sintoniaRuleLocked), o
// passo vira informativo e o gate libera.
import { str, wikiTarget } from '../../ficha/hero-model'
import { useCatalog } from '../../../data/CatalogContext'
import { sintoniaEmojiDe } from '../../../grupo/party'
import { docIdOf, WizCardLista, WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

/** Lore de abertura do passo (texto do usuário, verbatim). */
const LORE_SINTONIA = [
  'Neste mundo, algumas pessoas nascem em sintonia com os elementos primordiais. Muitos acabam sendo os melhores em seus respectivos trabalhos, ou até mesmo utilizam essa abertura para aprender melhor sobre os elementos.',
  'Aventureiros via de regra tem alguma sintonia aparente. Neste mundo perigoso, acaba-se tornando uma expectativa da sociedade que pessoas “abençoadas” por uma sintonia aparente façam os trabalhos mais arriscados, em nome do bem comum.',
]

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
      nota={
        <>
          {LORE_SINTONIA.map((p) => (
            <span key={p} style={{ display: 'block', marginBottom: 8 }}>
              {p}
            </span>
          ))}
          <span style={{ display: 'block' }}>
            A sintonia colore quem você é e pesa em algumas classes (o Monge, por exemplo, luta
            diferente em cada uma). Toque numa sintonia pra ler os detalhes antes de escolher.
          </span>
        </>
      }
    >
      <WizCardLista
        ariaLabel="Sintonias disponíveis"
        itens={(rules?.sintonias ?? []).map((o) => ({
          id: o.value,
          titulo: o.label,
          // Emoji do ELEMENTO (registro central, o mesmo da ficha de grupo).
          ic: sintoniaEmojiDe(o.value) ?? undefined,
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
