// Registro central das colunas destacadas na lista do compêndio, por tipo.
// As entradas são nomes de inline fields dos próprios docs — o cabeçalho da
// coluna é a própria chave (label vem do dado, nunca inventado aqui).
export const LIST_COLUMNS: Record<string, readonly string[]> = {
  Item: ['dano', 'tipo', 'mãos', 'propriedades'],
}
