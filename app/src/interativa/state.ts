// Convenções de storage do estado volátil da Interativa — ESPELHO do
// plugin pleitost-autosheet src/types/interativa-state.ts (composeStateKey/
// parseStateKey + predicados "is on" canônicos, mesma unwrap dos shapes
// legados do FM).

/** `Condicoes_Ativas[key]`: true | number | {value?, numericSelector?, weaponSelector?}. */
export type CondicaoAtivaState =
  | true
  | number
  | { value?: number; numericSelector?: number; weaponSelector?: string }

/** `Efeitos_Ativos[key]`: true | {on?, auto?, autoFrom?, parametros?}. */
export type EfeitoAtivoState = true | { on?: boolean; auto?: boolean; autoFrom?: string }

export type CondicoesAtivasMap = Record<string, unknown>
export type EfeitosAtivosMap = Record<string, unknown>
export type SeletoresMap = Record<string, unknown>

/** Compõe stateKey a partir de label + sharedFrom (plugin :83-85). */
export function composeStateKey(label: string, sharedFrom?: string | null): string {
  return sharedFrom ? `${label}::${sharedFrom}` : label
}

/** Decompõe stateKey em {label, sharedFrom} (plugin :89-93). */
export function parseStateKey(stateKey: string): { label: string; sharedFrom?: string } {
  const parts = stateKey.split('::')
  if (parts.length === 1) return { label: stateKey }
  return { label: parts[0], sharedFrom: parts.slice(1).join('::') }
}

/** True quando entry de `condicoesAtivas` representa ativa (plugin :119-128):
 *  undefined→false; true→true; number>0→true; objeto: value>0, e value
 *  AUSENTE conta como ativa (entry presente = "tip ativa, valor implícito 1"). */
export function isCondicaoOn(state: unknown): boolean {
  if (state === undefined || state === null || state === false) return false
  if (state === true) return true
  if (typeof state === 'number') return state > 0
  if (typeof state === 'object') {
    const v = (state as { value?: unknown }).value
    if (v === undefined) return true
    return typeof v === 'number' ? v > 0 : Number(v) > 0
  }
  return false
}

/** True quando entry de `efeitosAtivos` representa ativo (plugin :133-137). */
export function isEfeitoOn(state: unknown): boolean {
  if (state === undefined || state === null || state === false) return false
  if (state === true) return true
  return typeof state === 'object' && (state as { on?: unknown }).on === true
}

/** Multiplier de condição ativa (plugin build-condition-context.ts:104-120):
 *  true→1; number>0 direto; {value:N}→N; resto→0 (inativa). */
export function toMultiplier(raw: unknown): number {
  if (raw === true) return 1
  if (raw === false || raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw > 0 ? Math.floor(raw) : 0
  if (typeof raw === 'object') {
    const obj = raw as { value?: unknown }
    const n = typeof obj.value === 'number' ? obj.value : Number(obj.value)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
