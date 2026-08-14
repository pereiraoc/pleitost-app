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

export function PassoPericias({ ctx }: { ctx: WizardCtx }) {
  return (
    <WizSecao
      titulo="Perícias"
      nota="Gaste os slots disponíveis subindo os ranks — o saldo aparece no rodapé do painel."
    >
      <PericiasProfPanel doc={ctx.doc} forceEdit hideItemBonus />
    </WizSecao>
  )
}
