// #401 (report bade98e9): o Atributo da arma é derivado SÓ na escolha
// (deriveArmaAtributo em addArma/setNome — snapshot no FM salvo) e o plugin
// nunca re-deriva no render (hero-model.ts:225-236). Quando os ATRIBUTOS do
// herói mudam (swap do painel de Atributos), uma arma com Precisa ficava presa
// no atributo antigo — o jogador tinha que remover e re-adicionar a arma.
// Como NÃO existe escolha manual de FOR/AGI na UI (o campo é 100% derivado),
// re-derivar aqui nunca sobrescreve decisão do usuário.
import type { Catalog } from '../../data/catalog'
import { loadDoc } from '../../data/useDoc'
import { wikilinkTargetFlexible } from '../../grupo/wealth'
import { deriveArmaAtributo, docField, str } from './hero-model'

/** Re-deriva o `Atributo` salvo de cada arma da lista com os NOVOS valores de
 *  atributos. Devolve a lista atualizada, ou null quando nada mudou (o caller
 *  evita o write). Arma sem nome ou fora do catálogo mantém a linha como está
 *  (sem grupo/propriedades não há o que derivar). */
export async function rederiveArmasAtributos(
  catalog: Catalog,
  lista: unknown,
  atributos: Record<string, number>,
): Promise<Record<string, unknown>[] | null> {
  const armas = (Array.isArray(lista) ? lista : []) as Record<string, unknown>[]
  let mudou = false
  const next = await Promise.all(
    armas.map(async (arma) => {
      const alvo = wikilinkTargetFlexible(arma['Nome'])
      if (!alvo) return arma
      const res = catalog.resolve(alvo)
      if (res.kind !== 'doc') return arma
      const entry = catalog.entryById.get(res.id)
      const armaDoc = await loadDoc(res.id).catch(() => undefined)
      const atributo = deriveArmaAtributo(entry?.grupo, docField(armaDoc, 'propriedades'), atributos)
      if (str(arma['Atributo']) === atributo) return arma
      mudou = true
      return { ...arma, Atributo: atributo }
    }),
  )
  return mudou ? next : null
}
