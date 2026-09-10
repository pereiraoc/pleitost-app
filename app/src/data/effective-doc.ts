// Projeção do doc EFETIVO (#252, F8). Fonte ÚNICA da fusão base⊕overlay usada
// pelos hooks useDoc/useDocs — todo view lê por eles, então a edição aparece em
// qualquer tela de graça. A vault-data base nunca muda; o overlay se sobrepõe.
//
//   base (vault-data) ⊕ overlay publicado (#47) ⊕ rascunho local (só Modo Dev)
//   ⊕ edição da FICHA (pleitost.heroEdits.<id>, 2026-09-10)
//
// A ficha entra por ÚLTIMO e é a camada mais pessoal: é a criatura/herói COMO
// a conta o editou (o overlay sincroniza no user_state). Faltava aqui — o
// report foi "editei o Sargento Valdir Brum na ficha e a campanha continua
// mostrando o antigo": a ficha lia hero-store direto, todo o resto lia a base.
//
// A reatividade (re-render quando um rascunho/flag muda) é responsabilidade dos
// hooks (useLocalDraftVersion + useSettings); esta função só lê os snapshots.
import type { VaultDoc } from './types'
import { applyOverlay } from './overlay'
import { localDraftFor } from './local-draft-store'
import { publishedOverlayFor } from './published-overlay-store'
import { isDesenvolvedor } from '../settings'
import { applyFmEdits, getHeroEdits } from './hero-store'

export function effectiveDoc(base: VaultDoc): VaultDoc {
  // 3 camadas: base ⊕ overlay PUBLICADO (todos veem) ⊕ rascunho LOCAL (só o dev,
  // até publicar). Precedência crescente — o rascunho local vence o publicado.
  const published = publishedOverlayFor(base.id)
  const local = isDesenvolvedor() ? localDraftFor(base.id) : undefined
  const doc = applyOverlay(base, published, local)
  const fmEdits = getHeroEdits(base.id).fm
  if (Object.keys(fmEdits).length === 0) return doc
  return {
    ...doc,
    frontmatter: applyFmEdits(doc.frontmatter as Record<string, unknown>, fmEdits),
  }
}
