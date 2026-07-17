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
