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
import { publishedOverlayFor } from './published-overlay-store'
import { isDesenvolvedor } from '../settings'

export function effectiveDoc(base: VaultDoc): VaultDoc {
  // 3 camadas: base ⊕ overlay PUBLICADO (todos veem) ⊕ rascunho LOCAL (só o dev,
  // até publicar). Precedência crescente — o rascunho local vence o publicado.
  const published = publishedOverlayFor(base.id)
  const local = isDesenvolvedor() ? localDraftFor(base.id) : undefined
  return applyOverlay(base, published, local)
}
