// Registro central das colunas destacadas nas listas, por tipo de doc.
// As entradas são nomes de campos dos próprios docs (inline fields ou
// frontmatter) — o cabeçalho da coluna é a própria chave (label vem do
// dado, nunca inventado aqui).
export const LIST_COLUMNS: Record<string, readonly string[]> = {
  Item: ['dano', 'tipo', 'mãos', 'propriedades'],
  Criatura: ['Nível', 'Classe'],
}
