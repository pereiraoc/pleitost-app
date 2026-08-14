// PASSO 10 — NOME, APELIDO e RETRATO (#452 §10, #459; feedback r2 #465 item
// 18). Último passo: o botão do rodapé vira "Concluir criação" (WizardView
// remove o marcador `Wizard` do FM e a ficha volta à visualização padrão).
//
// `nome` usa o canal existente do modelo — no herói local o setLocalEntityFm
// espelha o basename (listas/seletores/exports leem basename, #218). Apelido
// vive em Biografia.Apelido (o nome curto da mesa, mesaApelidos).
//
// RETRATO: o MESMO pipeline local-first da ficha (LocalImageUpload →
// saveEntityImage/IndexedDB, com compressão e sincronização já tratadas pelo
// sistema de imagens; preview via useEntityImageUrl).
import { fmPath, str } from '../../ficha/hero-model'
import { LocalImageUpload } from '../../ficha/PerfilTab'
import { useEntityImageUrl } from '../../../data/images'
import { clip } from '../../ficha/bits'
import { WizCampo, WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

export function PassoNome({ ctx }: { ctx: WizardCtx }) {
  const { doc, fm, model } = ctx
  const retrato = useEntityImageUrl(doc.id)
  const nome = str(fmPath(fm, 'nome'))
  return (
    <div>
      <WizSecao titulo="Qual seu nome?" pendente={nome.trim() === ''}>
        <WizCampo
          label="Nome"
          value={nome}
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
      <WizSecao
        titulo="Retrato"
        nota="Suba a imagem do seu personagem — o sistema comprime e prepara pros cards e tooltips."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 84,
              height: 84,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              overflow: 'hidden',
              background: 'var(--panel2)',
              border: '1px solid var(--line2)',
              clipPath: clip(10),
            }}
          >
            {retrato ? (
              <img src={retrato} alt="Retrato do personagem" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              '👤'
            )}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...wizTitulo, fontSize: 10 }}>IMAGEM DO PERSONAGEM</span>
            <LocalImageUpload id={doc.id} />
          </div>
        </div>
      </WizSecao>
    </div>
  )
}
