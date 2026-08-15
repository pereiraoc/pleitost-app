// REGISTRO CENTRAL dos passos do wizard de criação (#452/#453) — a ordem é a do
// spec do usuário (issue #452). Cada passo declara:
//   Component  — a tela (recebe o WizardCtx completo);
//   complete   — gate do AVANÇAR (o passo está satisfeito?);
//   visible    — passos condicionais (ex.: Magias só pra quem tem escola);
// O `passo` salvo no FM (Wizard.passo) indexa ESTE registro fixo (1-based), de
// modo que visibilidade dinâmica (trocar de classe muda se Magias existe) nunca
// invalida o ponteiro — a navegação só PULA os invisíveis.
//
// Regra de ouro (design doc): os passos NÃO duplicam lógica de regra — leem o
// RulesModel/projeção (`ctx.rules`) e escrevem pelos setters do HeroModel.
import type { ReactNode } from 'react'
import type { VaultDoc } from '../../data/types'
import type { HeroModel } from '../../data/useHeroModel'
import type { HeroProjection } from '../../rules/projection'
import type { HeroRefs } from '../ficha/useHeroRefs'
import { fmPath, str } from '../ficha/hero-model'
import { PassoClasse, classeCompleta } from './steps/PassoClasse'
import { PassoSintonia, sintoniaCompleta } from './steps/PassoSintonia'
import { PassoPassado, passadoCompleto } from './steps/PassoPassado'
import { PassoPersonalidade, personalidadeCompleta } from './steps/PassoPersonalidade'
import { PassoAtributos, atributosCompletos } from './steps/PassoAtributos'
import { PassoEquipamento, equipamentoCompleto } from './steps/PassoEquipamento'
import { PassoPericias, periciasCompletas } from './steps/PassoPericias'
import { PassoMagias, temMagias } from './steps/PassoMagias'
import { PassoHabilidades } from './steps/PassoHabilidades'
import { PassoNome } from './steps/PassoNome'
import { PassoCompanheiro, companheiroCompleto, temCompanheiro } from './steps/PassoCompanheiro'

export interface WizardCtx {
  doc: VaultDoc
  /** FM efetivo do modelo (fonte dos gates — o mesmo que os painéis leem). */
  fm: Record<string, unknown>
  model: HeroModel
  rules: HeroProjection | undefined
  refs: HeroRefs
}

export interface WizardStep {
  id: string
  titulo: string
  Component: (props: { ctx: WizardCtx }) => ReactNode
  complete: (ctx: WizardCtx) => boolean
  /** Ausente = sempre visível. */
  visible?: (ctx: WizardCtx) => boolean
}

export const WIZARD_STEPS: WizardStep[] = [
  // Sintonia ANTES da classe (feedback r2 #461 item 1): classes sem subclasse
  // (Monge) variam os papéis pela sintonia — escolhida de propósito primeiro.
  { id: 'sintonia', titulo: 'Sintonia', Component: PassoSintonia, complete: sintoniaCompleta },
  { id: 'classe', titulo: 'Classe', Component: PassoClasse, complete: classeCompleta },
  { id: 'passado', titulo: 'Passado', Component: PassoPassado, complete: passadoCompleto },
  {
    id: 'personalidade',
    titulo: 'Personalidade',
    Component: PassoPersonalidade,
    complete: personalidadeCompleta,
  },
  { id: 'atributos', titulo: 'Atributos', Component: PassoAtributos, complete: atributosCompletos },
  {
    id: 'equipamento',
    titulo: 'Equipamento',
    Component: PassoEquipamento,
    complete: equipamentoCompleto,
  },
  { id: 'pericias', titulo: 'Perícias', Component: PassoPericias, complete: periciasCompletas },
  {
    id: 'magias',
    titulo: 'Magias',
    Component: PassoMagias,
    complete: () => true, // escolher magias é opcional; sobre-gasto não existe (o painel só deixa aprender com slot)
    visible: temMagias,
  },
  {
    id: 'habilidades',
    titulo: 'Habilidades e Técnicas',
    Component: PassoHabilidades,
    complete: () => true, // pendências de regra seguem visíveis como na ficha
  },
  {
    id: 'nome',
    titulo: 'Nome',
    Component: PassoNome,
    complete: (ctx) => str(fmPath(ctx.fm, 'nome')).trim() !== '',
  },
  // #452 r15: DEPOIS do nome (o Tutor do CA carimba o nome final do herói) —
  // só aparece quando o herói comanda um animal (ação [[Comandar Animal]]).
  {
    id: 'companheiro',
    titulo: 'Companheiro Animal',
    Component: PassoCompanheiro,
    complete: companheiroCompleto,
    visible: temCompanheiro,
  },
]
