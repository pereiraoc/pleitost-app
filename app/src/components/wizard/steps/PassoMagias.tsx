// PASSO 8 — MAGIAS (#452 §8, issue #458). Passo CONDICIONAL: só aparece se o
// personagem tem magias pra escolher — escola com proficiência ≠ N ou magia já
// concedida por regra (caso do Animista) — na primária OU na secundária.
// Reusa o MagiasHabPanel real (forceEdit): catálogo/slots/aprender/remover são
// os da aba COMPETÊNCIAS, sem lógica própria.
import { fmPath, str } from '../../ficha/hero-model'
import { MagiasHabPanel } from '../../ficha/HabilidadesTab'
import { TipProvider } from '../../ficha/tooltips'
import { WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

interface EscolaLike {
  Nome?: unknown
  Proficiencia?: unknown
  Lista?: unknown
}

function escolasCom(fm: Record<string, unknown>, ...path: string[]): EscolaLike[] {
  const lista = fmPath(fm, ...path)
  return Array.isArray(lista) ? (lista as EscolaLike[]) : []
}

function temEscolaAtiva(escolas: EscolaLike[]): boolean {
  return escolas.some((e) => {
    if (str(e.Nome) === 'Tesouros') return false // exclusiva, não se aprende por slot
    const aprendidas = Array.isArray(e.Lista) ? e.Lista.length : 0
    return aprendidas > 0 || str(e.Proficiencia) !== 'N'
  })
}

/** O herói tem magias? (decide a visibilidade do passo no registro). */
export function temMagias(ctx: WizardCtx): boolean {
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  return (
    temEscolaAtiva(escolasCom(fm, 'Magias', 'Lista')) ||
    temEscolaAtiva(escolasCom(fm, 'Magias', 'Secundaria', 'Lista'))
  )
}

export function PassoMagias({ ctx }: { ctx: WizardCtx }) {
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  const temSec = temEscolaAtiva(escolasCom(fm, 'Magias', 'Secundaria', 'Lista'))
  return (
    <WizSecao
      titulo="Magias"
      nota="Aprenda magias nos slots disponíveis — o catálogo à direita mostra o que as suas escolas oferecem."
    >
      <TipProvider>
        <MagiasHabPanel doc={ctx.doc} refs={ctx.refs} forceEdit />
        {temSec ? <MagiasHabPanel doc={ctx.doc} refs={ctx.refs} sec forceEdit /> : null}
      </TipProvider>
    </WizSecao>
  )
}
