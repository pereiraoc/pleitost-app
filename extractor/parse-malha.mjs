// Bloco ```malha``` (2026-09-08): posições ESQUEMÁTICAS das paradas da malha
// de transportes, na nota que o contexto aponta em `transporte.mapa`. Uma
// linha por parada: `parada: <Nome da Localização>, <x>, <y>[, <rótulo>]` —
// grade inteira (x cresce pro leste, y pro norte); rótulo = lado do nome no
// desenho (direita|esquerda). O app desenha o mapa de metrô a partir disto e
// das notas `categoria: Linha` (Paradas em ordem); a vault é a fonte única.

/** @returns {{ paradas: { nome: string, x: number, y: number, rotulo?: string }[] } | null} */
export function parseMalhaBlock(body) {
  const m = /```malha\r?\n([\s\S]*?)```/.exec(body ?? "");
  if (!m) return null;
  const paradas = [];
  for (const raw of m[1].split(/\r?\n/)) {
    const mk = /^\s*parada:\s*(.+)$/.exec(raw);
    if (!mk) continue;
    const partes = mk[1].split(",").map((s) => s.trim());
    const nome = partes[0] ?? "";
    const x = Number(partes[1]);
    const y = Number(partes[2]);
    if (!nome || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    const rotulo = (partes[3] ?? "").trim();
    paradas.push(rotulo ? { nome, x, y, rotulo } : { nome, x, y });
  }
  return { paradas };
}
