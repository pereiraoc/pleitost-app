// Ícones "supercharged" dos wikilinks — EXTRAÍDOS da fonte de verdade do
// Obsidian na vault (não inventados): os seletores do plugin supercharged-links
// (.obsidian/plugins/supercharged-links-obsidian/data.json) casados com os
// emojis do plugin Style Settings (.obsidian/plugins/obsidian-style-settings/
// data.json), que preenchem as vars --<uid>-before do snippet
// supercharged-links-gen.css. Chaveado pelo VALOR EXATO da faceta na vault (com
// espaços e acentos), pra bater com entry.type/subtype/grupo — antes o app
// derivava do design-system (tokens) por uma chave "compacta", o que quebrava
// valores multi-palavra (ex.: "Companheiro Animal" ≠ "CompanheiroAnimal").
//
// Prioridade grupo → subcategoria → categoria (o mais específico ganha, como as
// regras do supercharged).

/** grupo (arma) → emoji. */
export const SC_GRUPO: Record<string, string> = {
  'cac-marcial': '⚔️',
  'cac-simples': '🗡️',
  'd-marcial': '🏹',
  'd-simples': '🪃',
  especial: '🌟',
  natural: '🐾',
}

/** subcategoria → emoji (valor exato da vault). */
export const SC_SUBCATEGORIA: Record<string, string> = {
  Armadura: '🥋',
  Atributo: '⚖️',
  Atualidade: '📒',
  Bônus: '⏫',
  CD: '🎯',
  Capital: '🏛️',
  'Companheiro Animal': '🐾',
  Condição: '💫',
  Dados: '📰',
  'Energia Mágica': '🔷',
  Escudo: '🛡️',
  Especialização: '🎖️',
  'Grande Cidade': '🏰',
  Heroi: '👤',
  Maestria: '🏆',
  Monstro: '👹',
  Moral: '💙',
  Nação: '🏳️',
  Passado: '📖',
  Penalidade: '⏬',
  'Pequena Cidade': '🏘️',
  Perícia: '🧠',
  'Ponto de Interesse': '📍',
  'Potência Mágica': '🌟',
  Proficiência: '🎓',
  Propriedade: '💎',
  Raça: '🧬',
  Região: '🗺️',
  'Reserva Mágica': '🔶',
  Tesouro: '💍',
  Vilarejo: '🏡',
  Vitalidade: '❤️',
  'defesas-e-resistências': '♜',
}

/** categoria (type) → emoji (valor exato da vault). Intuição/Percepção/
 *  Consumível são seletores por PATH no Obsidian; aqui ficam best-effort por
 *  tipo (sem efeito quando o tipo não bate). */
export const SC_CATEGORIA: Record<string, string> = {
  Aventura: '📜',
  Classe: '👑',
  Combate: '🥊',
  Grupo: '👥',
  Habilidade: '📕',
  Organização: '🏴‍☠️',
  Técnica: '📘',
  Intuição: '💡',
  Percepção: '👁️',
  Consumível: '🧪',
}
