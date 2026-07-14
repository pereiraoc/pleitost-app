// Projeção do doc EFETIVO (#252, F8). Fonte ÚNICA da fusão base⊕overlay usada
// pelos hooks useDoc/useDocs — todo view lê por eles, então a edição aparece em
// qualquer tela de graça. A vault-data base nunca muda; o overlay se sobrepõe.
//
//   base (vault-data) ⊕ overlay publicado (#47) ⊕ rascunho local (só Modo Dev)
//
// A reatividade (re-render quando um rascunho/flag muda) é responsabilidade dos
// hooks (useLocalDraftVersion + useSettings); esta função só lê os snapshots.
import type { VaultDoc } from './types'
import { applyOverlay } from './overlay'
import { localDraftFor } from './local-draft-store'
import { isDesenvolvedor } from '../settings'

export function effectiveDoc(base: VaultDoc): VaultDoc {
  // Overlay publicado (Supabase) entra no #47 — aqui só o rascunho local, que só
  // é aplicado no Modo Desenvolvedor (jogador comum vê base ⊕ publicado).
  const local = isDesenvolvedor() ? localDraftFor(base.id) : undefined
  return applyOverlay(base, local)
}
