// PASSO 7 — PERÍCIAS (#452 §7, issue #458).
//
// Reusa o PericiasProfPanel REAL da aba COMPETÊNCIAS já em modo edição
// (`forceEdit`) e SEM a coluna de item bônus (`hideItemBonus` — na criação
// ainda não existe item bônus de nada). Toda a economia de slots/pisos de
// regra é a do painel (computeSlotsView + applyPericiaRankEdit).
//
// Gate: a MESMA contabilidade do painel — avança só sem sobre-gasto
// (slotsView.globalOk, com a fungibilidade M≥E≥A do plugin).
import { computeSlotsView } from '../../../rules/slot-accounting'
import { familiaOf, familiaTemPericia } from '../../../data/familia'
import { fmPath, num, str } from '../../ficha/hero-model'
import { slugify } from '../../ficha/registry'
import { PericiasProfPanel } from '../../ficha/HabilidadesTab'
import { TipProvider } from '../../ficha/tooltips'
import { WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

export function periciasCompletas(ctx: WizardCtx): boolean {
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  const familia = familiaOf(ctx.doc)
  const pericias = ((fmPath(fm, 'Pericias', 'Lista') ?? []) as Record<string, unknown>[]).filter(
    (p) => familiaTemPericia(familia, slugify(str(p['Nome']))),
  )
  const usedBy = (letter: string) =>
    pericias.filter((p) =>
      ((p['Incrementos'] ?? []) as Record<string, unknown>[]).some((inc) =>
        str(inc[letter]).startsWith('Slot'),
      ),
    ).length
  const slots = fmPath(fm, 'Pericias', 'Slots') as Record<string, unknown> | undefined
  return computeSlotsView({
    total: { A: num(slots?.['A']), E: num(slots?.['E']), M: num(slots?.['M']) },
    used: { A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  }).globalOk
}

/** Lore de abertura do passo (texto do usuário, verbatim). */
const LORE_PERICIAS = [
  'Cada personagem tem um conjunto de perícias determinados pelo seu nível, classe e INT. Perícias são usadas para determinar a chance de sucesso de certas ações durante o jogo, representando o treinamento e experiência do personagem em certas situações.',
  'O nível de Proficiência do personagem na perícia define o quão treinado ou experiente ele é nesse ramo. Adicionalmente, cada perícia tem um atributo associado, que potencializa o efeito da perícia, como se fosse o “talento nato” do personagem para essa.',
  'Um personagem pode ser Adepto, Experiente ou Mestre com uma perícia, assim como em ataques, Defesas e Sentidos. A Proficiência na perícia, somada ao atributo-chave da perícia, totalizam o modificador de perícia de um personagem.',
]

export function PassoPericias({ ctx }: { ctx: WizardCtx }) {
  return (
    <WizSecao
      titulo="Perícias"
      pendente={!periciasCompletas(ctx)}
      nota={
        <>
          {LORE_PERICIAS.map((p) => (
            <span key={p} style={{ display: 'block', marginBottom: 8 }}>
              {p}
            </span>
          ))}
          <span style={{ display: 'block' }}>
            Gaste os slots disponíveis subindo os ranks — o saldo aparece no rodapé. Toque no nome
            de uma perícia pra abrir a regra nos detalhes.
          </span>
        </>
      }
    >
      {/* TipProvider: os tooltips do painel dependem do overlay singleton que
          na aba COMPETÊNCIAS vive na raiz do tab (#465 item 16). */}
      <TipProvider>
        <PericiasProfPanel doc={ctx.doc} forceEdit hideItemBonus abrirDetalhes />
      </TipProvider>
    </WizSecao>
  )
}
