// Ordenação por clique nos cabeçalhos da ficha de grupo — VERBATIM do design
// puxado (Companion App.dc.html):
//   grpCycleSort(tab,col): sem sort/coluna diferente → {col,dir:-1};
//     dir -1 → {col,dir:1}; dir 1 → null (volta ao padrão).
//   applySort(rows,tab,getVal,labelKey): só as linhas de MEMBRO ordenam
//     (linha Grupo sempre por último); com sort ativo ordena por
//     (getVal(a,col)-getVal(b,col))*dir; sem sort, alfabético pt pelo rótulo.
//   headMap: seta '▼' com dir -1, '▲' com dir 1, só na coluna ativa.
//   num(v): remove tudo que não for dígito/ponto/sinal ('Tier 3'→3, '+9'→9).
export interface GrpSort {
  col: number
  dir: 1 | -1
}

/** grpCycleSort do design (transição de estado de UMA aba). */
export function cycleSort(cur: GrpSort | null | undefined, col: number): GrpSort | null {
  if (!cur || cur.col !== col) return { col, dir: -1 }
  if (cur.dir === -1) return { col, dir: 1 }
  return null
}

/** num() do build do grupo (design). */
export function gnum(v: unknown): number {
  const m = String(v).replace(/[^0-9.-]/g, '')
  return m === '' ? 0 : parseFloat(m)
}

/** Glifo da seta do cabeçalho (headMap do design): ativo? dir -1 '▼' : '▲'. */
export function sortArrow(s: GrpSort | null | undefined, col: number): string {
  return s && s.col === col ? (s.dir === -1 ? '▼' : '▲') : ''
}

/** applySort do design; rows já vêm com a(s) linha(s) de grupo marcada(s). */
export function applySort<T extends { grupo?: boolean | number }>(
  rows: T[],
  s: GrpSort | null | undefined,
  getVal: (row: T, col: number) => number,
  label: (row: T) => string,
): T[] {
  const mem = rows.filter((r) => !r.grupo)
  const grp = rows.filter((r) => r.grupo)
  if (s) mem.sort((a, b) => (getVal(a, s.col) - getVal(b, s.col)) * s.dir)
  else mem.sort((a, b) => label(a).localeCompare(label(b), 'pt'))
  return [...mem, ...grp]
}
