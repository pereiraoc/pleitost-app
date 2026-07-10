// COMÉRCIO do local na sidebar DETALHES (#89) — reusa a ComercioTab da ficha de
// Localização (rolagem/travar/compra), com o comprador default = herói
// SELECIONADO (#86). Comprar debita o ouro do herói e some do estoque.
import { useDoc } from '../../data/useDoc'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { ComercioTab } from '../compendium/LocationSheet'

export function CommerceDetail({ id }: { id: string }) {
  const { doc } = useDoc(id)
  const selected = useSelectedCreature()
  if (!doc) return <div className="loading">Carregando…</div>
  return <ComercioTab doc={doc} defaultHeroId={selected ?? undefined} />
}
