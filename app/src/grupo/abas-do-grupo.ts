// ABAS DA FICHA DE GRUPO — lista e recorte por mundo. Mora fora do
// GrupoView (arquivo de componente só exporta componente: fast refresh).

// Verbatim do script do design (GRUPO_TABS / GRUPO.balHeads / roleCols).
// EXPLORAÇÃO (issue #36) é extensão sancionada: nova PRIMEIRA aba, sem
// design dedicado — as demais mantêm a ordem do design.
export const GRUPO_TABS = [
  { id: 'exploracao', label: 'EXPLORAÇÃO' },
  // #333: INVENTÁRIO logo depois de EXPLORAÇÃO. As abas mapeiam 1:1 (por índice)
  // com os TrackPanel abaixo — inserir aqui exige o painel na MESMA posição.
  { id: 'inventario', label: 'INVENTÁRIO' },
  { id: 'papeis', label: 'PAPÉIS' },
  { id: 'competencias', label: 'COMPETÊNCIAS' },
  { id: 'riqueza', label: 'RIQUEZA' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'ataques', label: 'ATAQUES' },
]

/** Abas do grupo NO MUNDO ATIVO: sem hexcrawl no mundo (POA 1987 é cidade,
 *  não hexcrawl — pedido 2026-09-10), a EXPLORAÇÃO sai. Ela é a PRIMEIRA aba
 *  e o primeiro painel, então tirar das duas listas mantém o pareamento. */
export function abasDoGrupo(temHexcrawl: boolean): typeof GRUPO_TABS {
  return temHexcrawl ? GRUPO_TABS : GRUPO_TABS.filter((t) => t.id !== 'exploracao')
}
