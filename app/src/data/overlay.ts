// Camada de OVERLAY do compêndio (#252, F8 do épico #243). A vault-data é
// read-only e imutável; as edições do Modo Desenvolvedor vivem em overlays que
// se SOBREPÕEM ao doc base no ponto de leitura. Três camadas, nesta ordem:
//
//   base (vault-data) ⊕ overlay publicado (Supabase) ⊕ rascunho local (device)
//
// `applyOverlay` é PURO e testável — a fusão. As fontes (rascunho local, overlay
// publicado) e a projeção reativa vivem em local-draft-store / effective-doc.
import type { VaultDoc } from './types'

/** Patch parcial de um doc: só os campos EDITÁVEIS. Ausente = não mexe; presente
 *  = sobrescreve. `ruleElements` substitui o array inteiro (não faz merge item a
 *  item — o editor entrega a lista nova). */
export interface DocPatch {
  frontmatter?: Record<string, unknown>
  body?: string
  ruleElements?: VaultDoc['ruleElements']
  inlineFields?: Record<string, string>
}

/** Aplica UM patch sobre um doc (imutável — devolve cópia nova quando muda). */
export function applyPatch(base: VaultDoc, patch: DocPatch | undefined | null): VaultDoc {
  if (!patch) return base
  const next: VaultDoc = { ...base }
  if (patch.frontmatter !== undefined) next.frontmatter = patch.frontmatter
  if (patch.body !== undefined) next.body = patch.body
  if (patch.ruleElements !== undefined) next.ruleElements = patch.ruleElements
  if (patch.inlineFields !== undefined) next.inlineFields = patch.inlineFields
  return next
}

/** Funde uma pilha de patches (ordem = precedência crescente: o último vence). */
export function applyOverlay(base: VaultDoc, ...patches: (DocPatch | undefined | null)[]): VaultDoc {
  return patches.reduce<VaultDoc>((doc, p) => applyPatch(doc, p), base)
}

/** True se o patch de fato muda algo do base (pra descartar patches vazios/
 *  idênticos — evita overlay redundante quando o base já bate). */
export function patchChangesBase(base: VaultDoc, patch: DocPatch): boolean {
  const merged = applyPatch(base, patch)
  return (
    merged.body !== base.body ||
    merged.frontmatter !== base.frontmatter ||
    merged.ruleElements !== base.ruleElements ||
    merged.inlineFields !== base.inlineFields
  )
}
