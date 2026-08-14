// PASSO 10 — NOME e APELIDO (#452 §10, issue #459). Último passo: o botão do
// rodapé vira "Concluir criação" (WizardView remove o marcador `Wizard` do FM
// e a ficha volta à visualização padrão com todas as edições).
//
// `nome` usa o canal existente do modelo — no herói local o setLocalEntityFm
// espelha o basename (listas/seletores/exports leem basename, #218). Apelido
// vive em Biografia.Apelido (o nome curto da mesa, mesaApelidos).
import { fmPath, str } from '../../ficha/hero-model'
import { WizCampo, WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

export function PassoNome({ ctx }: { ctx: WizardCtx }) {
  const { fm, model } = ctx
  return (
    <div>
      <WizSecao titulo="Qual seu nome?">
        <WizCampo
          label="Nome"
          value={str(fmPath(fm, 'nome'))}
          onChange={(v) => model.set('nome', v)}
          placeholder="Carlos Facão de Andradas"
        />
      </WizSecao>
      <WizSecao
        titulo="Qual seu apelido?"
        nota="O nome curto que aparece na mesa e nas listas do grupo."
      >
        <WizCampo
          label="Apelido"
          value={str(fmPath(fm, 'Biografia', 'Apelido'))}
          onChange={(v) => model.set('Biografia.Apelido', v)}
          placeholder="Carlos"
        />
      </WizSecao>
    </div>
  )
}
