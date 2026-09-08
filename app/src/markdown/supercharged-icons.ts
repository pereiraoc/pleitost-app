// GERADO por app/scripts/gen-supercharged-icons.mjs a partir da config do
// Obsidian na vault (supercharged-links + Style Settings). NÃO EDITAR À MÃO —
// rode `npm run icons`. Fonte: .obsidian/plugins/supercharged-links-obsidian/data.json + Style Settings.
//
// Semântica reproduzida (link-icon.ts): seletores na ORDEM da config; atributo
// casa por valor exato SEM caixa (`i`), path por sufixo/trecho/prefixo; o
// ÚLTIMO seletor que casa vence (cascata do CSS gerado).

export interface ScSelector {
  tipo: 'attribute' | 'path'
  /** atributo (categoria/subcategoria/grupo/custo/escola/elemento/sintonia/Tipo) ou 'path'. */
  nome: string
  valor: string
  match: 'exact' | 'endswith' | 'startswith' | 'contains' | string
  caseSensitive: boolean
  icone: string
}

export const SC_SELECTORS: ScSelector[] = [
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "cac-marcial",
    "match": "exact",
    "caseSensitive": false,
    "icone": "⚔️"
  },
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "cac-simples",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🗡️"
  },
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "d-marcial",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏹"
  },
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "d-simples",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🪃"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Armadura",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🥋"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Habilidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📕"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Classe",
    "match": "exact",
    "caseSensitive": false,
    "icone": "👑"
  },
  {
    "tipo": "attribute",
    "nome": "sintonia",
    "valor": "Água",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💧"
  },
  {
    "tipo": "attribute",
    "nome": "sintonia",
    "valor": "Fogo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔥"
  },
  {
    "tipo": "attribute",
    "nome": "sintonia",
    "valor": "Vento",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌪️"
  },
  {
    "tipo": "attribute",
    "nome": "sintonia",
    "valor": "Terra",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌿"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Escudo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🛡️"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "1A",
    "match": "contains",
    "caseSensitive": false,
    "icone": "1️⃣"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "2A",
    "match": "contains",
    "caseSensitive": false,
    "icone": "2️⃣"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "3A",
    "match": "contains",
    "caseSensitive": false,
    "icone": "3️⃣"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "L",
    "match": "contains",
    "caseSensitive": false,
    "icone": "0️⃣"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "R",
    "match": "contains",
    "caseSensitive": false,
    "icone": "↩️"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "Min",
    "match": "contains",
    "caseSensitive": false,
    "icone": "⏲"
  },
  {
    "tipo": "attribute",
    "nome": "custo",
    "valor": "P",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🅿️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Perícia",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🧠"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Propriedade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💎"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Proficiência",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🎓"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Atributo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "⚖️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "defesas-e-resistências",
    "match": "exact",
    "caseSensitive": false,
    "icone": "♜"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Vitalidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "❤️"
  },
  {
    "tipo": "path",
    "nome": "categoria",
    "valor": "Intuição.md",
    "match": "endswith",
    "caseSensitive": false,
    "icone": "💡"
  },
  {
    "tipo": "path",
    "nome": "categoria",
    "valor": "Percepção.md",
    "match": "endswith",
    "caseSensitive": false,
    "icone": "👁️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Condição",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💫"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Monstro",
    "match": "exact",
    "caseSensitive": false,
    "icone": "👹"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Heroi",
    "match": "exact",
    "caseSensitive": false,
    "icone": "👤"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Técnica",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📘"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Tesouro",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💍"
  },
  {
    "tipo": "attribute",
    "nome": "escola",
    "valor": "Negra",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔮"
  },
  {
    "tipo": "attribute",
    "nome": "escola",
    "valor": "Branca",
    "match": "exact",
    "caseSensitive": false,
    "icone": "✨"
  },
  {
    "tipo": "attribute",
    "nome": "elemento",
    "valor": "Fogo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔥"
  },
  {
    "tipo": "attribute",
    "nome": "elemento",
    "valor": "Água",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💧"
  },
  {
    "tipo": "attribute",
    "nome": "elemento",
    "valor": "Terra",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌿"
  },
  {
    "tipo": "attribute",
    "nome": "elemento",
    "valor": "Vento",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌪️"
  },
  {
    "tipo": "attribute",
    "nome": "escola",
    "valor": "Essencial",
    "match": "exact",
    "caseSensitive": false,
    "icone": "☄️"
  },
  {
    "tipo": "attribute",
    "nome": "escola",
    "valor": "Especial",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌟"
  },
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "especial",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌟"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Moral",
    "match": "exact",
    "caseSensitive": false,
    "icone": "💙"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Reserva Mágica",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔶"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Energia Mágica",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔷"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Penalidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "⏬"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Bônus",
    "match": "exact",
    "caseSensitive": false,
    "icone": "⏫"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "CD",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🎯"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Especialização",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🎖️"
  },
  {
    "tipo": "attribute",
    "nome": "grupo",
    "valor": "natural",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🐾"
  },
  {
    "tipo": "path",
    "nome": "categoria",
    "valor": "Sistema/Equipamento/Tesouros/Consumíveis",
    "match": "contains",
    "caseSensitive": false,
    "icone": "🧪"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Companheiro Animal",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🐾"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Ponto de Interesse",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📍"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Capital",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏛️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Vilarejo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏡"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Pequena Cidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏘️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Grande Cidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏰"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Região",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🗺️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Nação",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏳️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Passado",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📖"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Atualidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📒"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Organização",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏴‍☠️"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Grupo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "👥"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Aventura",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📜"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Dados",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📰"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Raça",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🧬"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Combate",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🥊"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Maestria",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏆"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Potência Mágica",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌟"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Artefato",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🧿"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Bairro",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏙️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Cidade",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌆"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Continente",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌍"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "Estado",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏞️"
  },
  {
    "tipo": "attribute",
    "nome": "subcategoria",
    "valor": "País",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🌐"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Pessoa",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🧑"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Recurso",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🧾"
  },
  {
    "tipo": "attribute",
    "nome": "categoria",
    "valor": "Linha",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🚌"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Veículo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🚗"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Aluguel de Veículo",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🔑"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Combustível",
    "match": "exact",
    "caseSensitive": false,
    "icone": "⛽"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Corrida",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🚕"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Passagem",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🎫"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Estilo de Vida",
    "match": "exact",
    "caseSensitive": false,
    "icone": "📋"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Aluguel",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🏠"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Hotel",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🛏️"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Refeição",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🍛"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Mantimento",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🛒"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Bebida",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🍺"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Refrigerante",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🥤"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Salgado",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🥟"
  },
  {
    "tipo": "attribute",
    "nome": "Tipo",
    "valor": "Guloseima",
    "match": "exact",
    "caseSensitive": false,
    "icone": "🍬"
  }
]

/** grupo (arma) → emoji (derivado; compatibilidade). */
export const SC_GRUPO: Record<string, string> = {
  "cac-marcial": "⚔️",
  "cac-simples": "🗡️",
  "d-marcial": "🏹",
  "d-simples": "🪃",
  "especial": "🌟",
  "natural": "🐾"
}

/** subcategoria → emoji (derivado; compatibilidade). */
export const SC_SUBCATEGORIA: Record<string, string> = {
  "Armadura": "🥋",
  "Escudo": "🛡️",
  "Perícia": "🧠",
  "Propriedade": "💎",
  "Proficiência": "🎓",
  "Atributo": "⚖️",
  "defesas-e-resistências": "♜",
  "Vitalidade": "❤️",
  "Condição": "💫",
  "Monstro": "👹",
  "Heroi": "👤",
  "Tesouro": "💍",
  "Moral": "💙",
  "Reserva Mágica": "🔶",
  "Energia Mágica": "🔷",
  "Penalidade": "⏬",
  "Bônus": "⏫",
  "CD": "🎯",
  "Especialização": "🎖️",
  "Companheiro Animal": "🐾",
  "Ponto de Interesse": "📍",
  "Capital": "🏛️",
  "Vilarejo": "🏡",
  "Pequena Cidade": "🏘️",
  "Grande Cidade": "🏰",
  "Região": "🗺️",
  "Nação": "🏳️",
  "Passado": "📖",
  "Atualidade": "📒",
  "Dados": "📰",
  "Raça": "🧬",
  "Maestria": "🏆",
  "Potência Mágica": "🌟",
  "Artefato": "🧿",
  "Bairro": "🏙️",
  "Cidade": "🌆",
  "Continente": "🌍",
  "Estado": "🏞️",
  "País": "🌐"
}

/** categoria → emoji (derivado; compatibilidade). */
export const SC_CATEGORIA: Record<string, string> = {
  "Habilidade": "📕",
  "Classe": "👑",
  "Técnica": "📘",
  "Organização": "🏴‍☠️",
  "Grupo": "👥",
  "Aventura": "📜",
  "Combate": "🥊",
  "Pessoa": "🧑",
  "Recurso": "🧾",
  "Linha": "🚌"
}
