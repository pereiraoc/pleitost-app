// PASSO 9 — HABILIDADES E TÉCNICAS (#452 §9, issue #458).
//
// Reusa os painéis reais da aba COMPETÊNCIAS já em modo edição (forceEdit):
// HabilidadesArvorePanel (árvore por rank + escolhas de regra) e TecnicasPanel
// (slots fungíveis + benefícios). Pendências de regra seguem visíveis como na
// ficha — o gate é livre (o jogador pode deixar escolhas pra depois).
import { HabilidadesArvorePanel, TecnicasPanel } from '../../ficha/HabilidadesTab'
import { WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

export function PassoHabilidades({ ctx }: { ctx: WizardCtx }) {
  return (
    <WizSecao
      titulo="Habilidades e Técnicas"
      nota="As habilidades concedidas pela classe já estão aqui; resolva as escolhas pendentes e aprenda técnicas nos slots."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <HabilidadesArvorePanel doc={ctx.doc} refs={ctx.refs} forceEdit />
        <TecnicasPanel doc={ctx.doc} refs={ctx.refs} forceEdit />
      </div>
    </WizSecao>
  )
}
