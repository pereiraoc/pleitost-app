// Parser do bloco ```class-roles``` (#276) — espelho do pleitost-views
// (parse-class-roles.ts), mas com JSON.parse (sem eval/Function → sem risco de
// CSP no browser). Cada entrada é `[nome, { Papel: peso }]`; o corpo do fence é a
// lista de entradas separadas por vírgula (com ou sem os colchetes externos).
import { isRoleName, type RoleName } from './role-meta'

export type Build = [name: string, roles: Partial<Record<RoleName, number>>]

function isBuildEntry(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'string' &&
    value[1] != null &&
    typeof value[1] === 'object' &&
    !Array.isArray(value[1])
  )
}

function normalizeBuild(entry: unknown, index: number): Build {
  const [name, roles] = entry as [unknown, unknown]
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`Entrada ${index + 1} tem nome inválido.`)
  }
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) {
    throw new Error(`Entrada ${index + 1} precisa ter objeto de roles.`)
  }
  const out: Partial<Record<RoleName, number>> = {}
  for (const [role, value] of Object.entries(roles as Record<string, unknown>)) {
    if (!isRoleName(role)) throw new Error(`Role desconhecido na entrada ${index + 1}: ${role}`)
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount <= 0) continue
    out[role] = Math.floor(amount)
  }
  return [name.trim(), out]
}

/** Lê o corpo do bloco class-roles em Build[]. Lança em conteúdo inválido (o
 *  render mostra a mensagem, como o plugin). Vazio → []. */
export function parseClassRolesSource(source: string): Build[] {
  // Notas de Classe (ex.: a seção "## Líderes" de Classes.md) terminam com
  // VÍRGULA SOBRANDO — comum em edição à mão. JSON.parse é estrito, então
  // normalizamos: tira vírgula antes de ] ou }, e a vírgula solta no fim.
  const raw = String(source ?? '')
    .trim()
    .replace(/,(\s*[\]}])/g, '$1')
    .replace(/,\s*$/, '')
  if (!raw) return []

  const candidates: string[] = []
  if (raw.startsWith('[') && raw.endsWith(']')) candidates.push(raw)
  candidates.push(`[\n${raw}\n]`)

  let parsed: unknown[] | undefined
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const result = JSON.parse(candidate) as unknown
      if (Array.isArray(result) && (result.length === 0 || result.every(isBuildEntry))) {
        parsed = result
        break
      }
    } catch (error) {
      lastError = error
    }
  }

  if (!Array.isArray(parsed)) {
    const msg = lastError instanceof Error ? lastError.message : 'formato inválido'
    throw new Error(`Não foi possível ler o bloco class-roles: ${msg}`)
  }

  return parsed
    .map((entry, i) => normalizeBuild(entry, i))
    .filter(([, roles]) => Object.keys(roles).length > 0)
}
