// MATERIALIZAÇÃO do alias composto da Classe no FM SALVO do herói LOCAL —
// espelho do save do plugin (que grava a composição no .md ao salvar). Sem
// isso, a LISTA de heróis (que lê o FM salvo, não o derivado) mostra o título
// velho pra sempre (report 2026-08-15: Carlos "Trovador" na lista com a ficha
// já "Menestrel"); qualquer herói local que suba de nível teria o mesmo drift.
import { useEffect } from 'react'
import { isLocalId } from '../../data/local-entities'
import type { HeroModel } from '../../data/useHeroModel'
import type { HeroProjection } from '../../rules/projection'
import type { VaultDoc } from '../../data/types'
import { str, wikiTarget } from './hero-model'

/** Decisão PURA: o que gravar em Classe (null = nada a fazer).
 *  Condições: entidade local; projeção fresca (stale = classe recém-trocada,
 *  seria o alias da anterior); MESMA classe (só o display muda, nunca o
 *  target); e valor de fato diferente (converge em um write). */
export function aliasParaMaterializar(
  docId: string,
  salvo: string,
  derivado: string,
  stale: boolean,
): string | null {
  if (!isLocalId(docId)) return null
  if (stale || !derivado || !salvo) return null
  if (wikiTarget(derivado) !== wikiTarget(salvo)) return null
  if (derivado === salvo) return null
  return derivado
}

/** Efeito write-through na ficha: projeção fresca com alias composto novo →
 *  grava no FM salvo (lista/mesa/sync leem o salvo). */
export function useMaterializaAliasClasse(
  doc: VaultDoc,
  model: HeroModel,
  rules: HeroProjection | undefined,
): void {
  const salvo = str(model.fm['Classe'])
  const derivado = rules ? str((rules.derivedFm as Record<string, unknown>)['Classe']) : ''
  const stale = !!rules?.stale
  useEffect(() => {
    const alvo = aliasParaMaterializar(doc.id, salvo, derivado, stale)
    if (alvo) model.set('Classe', alvo)
    // model.set é estável por doc; salvo/derivado dirigem a convergência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, salvo, derivado, stale])
}
