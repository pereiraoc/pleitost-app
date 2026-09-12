// Nome do GRUPO (ficha do grupo na Iniciativa): composto dos APELIDOS dos heróis.
// Pedido do usuário: apelido de cada herói; se não tiver apelido, a PRIMEIRA
// palavra do nome. Puro/testável.

/** Apelido do herói: `Apelido` do FM se houver; senão a 1ª palavra do nome. */
export function apelidoDe(nome: string, fmBlob?: Record<string, unknown>): string {
  const ap = fmBlob?.['Apelido'] ?? fmBlob?.['apelido']
  const apStr = typeof ap === 'string' ? ap.trim() : ''
  if (apStr) return apStr
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/** Junta os apelidos dos HERÓIS num nome de grupo (vazio se não houver herói).
 *  Companheiros animais e monstros (`family` != 'Heroi') NÃO entram — o nome do
 *  grupo é dos heróis, não dos pets/companheiros (pedido do usuário). Entrada
 *  sem `family` declarada entra (retrocompat: o chamador já pré-filtrou). */
export function composeGroupName(
  heroes: ReadonlyArray<{ nome: string; family?: string; fmBlob?: Record<string, unknown> }>,
): string {
  return heroes
    .filter((h) => h.family === undefined || h.family === 'Heroi')
    .map((h) => apelidoDe(h.nome, h.fmBlob))
    .filter(Boolean)
    .join(', ')
}

/** Nome do combatente na INICIATIVA (report 2026-09-12): o Apelido; vazio, o
 *  nome COMPLETO (aqui não se encurta pro primeiro nome — isso é do nome da
 *  mesa). O apelido mora em `Biografia.Apelido`; ficha antiga guardava solto. */
export function nomeDeIniciativa(nome: string, fmBlob?: Record<string, unknown>): string {
  const bio = (fmBlob?.['Biografia'] ?? {}) as Record<string, unknown>
  for (const v of [bio['Apelido'], bio['apelido'], fmBlob?.['Apelido'], fmBlob?.['apelido']]) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return (nome ?? '').trim()
}
