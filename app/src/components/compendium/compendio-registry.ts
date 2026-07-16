// REGISTRO DE NAVEGAÇÃO DO COMPÊNDIO (épico #243 / F0 #244) — a árvore LÓGICA
// de navegação é a FONTE DE VERDADE, não uma derivação das pastas da vault.
// Isso resolve as divergências pedidas pelo usuário (AS-IS na #244):
//   - "Sistema: Criação de Personagem, Items, Regras" → Criaturas NÃO aparece
//     na navegação (tem tela própria) e "Equipamento" é rotulado "Items";
//   - "Não precisa mostrar Diários" → Diários fica fora da árvore;
//   - Campanhas/Contexto/Histórias abrem em botões dos filhos, não na listagem.
//
// Os ícones são do PRÓPRIO app (navegação do produto, não dado da vault nem do
// plugin) — este registro É a fonte de verdade deles, no mesmo espírito do
// design-nav.ts da sidebar. Nada de ícone/label hardcodado no call-site: a UI
// lê SEMPRE daqui.
//
// Um path que é CHAVE em NAV_CHILDREN é um NÓ de navegação (mostra botões
// grandes dos filhos). Um path ausente é uma FOLHA (cai na listagem/visualizador
// da pasta — refinada pelas fases F1–F6). '' é a home do compêndio.

export interface CompendioMeta {
  /** Emoji do botão grande (fonte de verdade da navegação do app). */
  icon: string
  /** Rótulo exibido; ausente = nome da pasta. Ex.: Equipamento → "Items". */
  label?: string
}

/** Filhos (por PATH de pasta) de cada nó de navegação. Ordem = ordem de exibição. */
export const NAV_CHILDREN: Record<string, string[]> = {
  '': ['Atlas', 'Campanhas', 'Contexto', 'Sistema'],
  Campanhas: ['Campanhas/Aventuras', 'Campanhas/Combates'],
  Contexto: ['Contexto/Organizações', 'Contexto/Histórias'],
  'Contexto/Histórias': [
    'Contexto/Histórias/Contexto Atual',
    'Contexto/Histórias/Contexto Histórico',
  ],
  Sistema: ['Sistema/Criação de Personagem', 'Sistema/Equipamento', 'Sistema/Regras'],
  // #245: "Items" ACHATA as 7 categorias que o usuário pediu — as 4 subpastas
  // de Tesouros (Consumíveis/Equipamentos/Imbuições e Qualidade/Implementos)
  // sobem pro mesmo nível de Armaduras/Armas/Escudos, sem o intermediário
  // "Tesouros". A árvore de navegação é a fonte de verdade (não as pastas), então
  // basta declarar os 7 paths aqui.
  'Sistema/Equipamento': [
    'Sistema/Equipamento/Armaduras',
    'Sistema/Equipamento/Armas',
    'Sistema/Equipamento/Escudos',
    'Sistema/Equipamento/Tesouros/Consumíveis',
    'Sistema/Equipamento/Tesouros/Equipamentos',
    'Sistema/Equipamento/Tesouros/Imbuições e Qualidade',
    'Sistema/Equipamento/Tesouros/Implementos',
  ],
}

/** Ícone (+ label override) por path. Todo path citado em NAV_CHILDREN aparece. */
export const NAV_META: Record<string, CompendioMeta> = {
  Atlas: { icon: '🗺️' },
  Campanhas: { icon: '📜' },
  'Campanhas/Aventuras': { icon: '⚔️' },
  'Campanhas/Combates': { icon: '🩸' },
  Contexto: { icon: '🌍' },
  'Contexto/Organizações': { icon: '🏛️' },
  'Contexto/Histórias': { icon: '📖' },
  'Contexto/Histórias/Contexto Atual': { icon: '🕰️' },
  'Contexto/Histórias/Contexto Histórico': { icon: '📚' },
  Sistema: { icon: '⚙️' },
  'Sistema/Criação de Personagem': { icon: '🎭' },
  'Sistema/Equipamento': { icon: '🎒', label: 'Items' },
  // #245: ícones das 7 categorias de Items (fonte de verdade da navegação).
  'Sistema/Equipamento/Armaduras': { icon: '🛡️' },
  'Sistema/Equipamento/Armas': { icon: '⚔️' },
  'Sistema/Equipamento/Escudos': { icon: '🛡' },
  'Sistema/Equipamento/Tesouros/Consumíveis': { icon: '🧪', label: 'Consumíveis' },
  'Sistema/Equipamento/Tesouros/Equipamentos': { icon: '🎒', label: 'Equipamentos' },
  'Sistema/Equipamento/Tesouros/Imbuições e Qualidade': { icon: '✨', label: 'Imbuições e Qualidade' },
  'Sistema/Equipamento/Tesouros/Implementos': { icon: '🔮', label: 'Implementos' },
  'Sistema/Regras': { icon: '📕' },
}

// #270: ícones da navegação do compêndio no ESTILO DA SIDEBAR — <svg> lucide-like
// (viewBox 24, stroke currentColor), não emoji. Mesma técnica do NAV_ICON_PATHS
// do design-nav.ts: aqui ficam só os PATHS internos; o componente monta o <svg>.
// Fonte de verdade dos ícones do compêndio (o `icon` emoji vira fallback). Alguns
// são reaproveitados entre nós afins (espadas em Combates/Armas, escudo em
// Armaduras/Escudos, mochila em Items/Equipamentos).
const SWORDS = `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/>`
const SHIELD = `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`
const BACKPACK = `<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><path d="M8 10h8"/>`

/** PATH interno do <svg> por path da navegação (fonte de verdade — #270). */
export const NAV_ICON_PATHS: Record<string, string> = {
  Atlas: `<path d="m9 5-6 2.5v13L9 18l6 3 6-2.5v-13L15 8 9 5Z"/><path d="M9 5v13"/><path d="M15 8v13"/>`,
  Campanhas: `<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>`,
  'Campanhas/Aventuras': `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`,
  'Campanhas/Combates': SWORDS,
  Contexto: `<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  'Contexto/Organizações': `<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>`,
  'Contexto/Histórias': `<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`,
  'Contexto/Histórias/Contexto Atual': `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  'Contexto/Histórias/Contexto Histórico': `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>`,
  Sistema: `<path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>`,
  'Sistema/Criação de Personagem': `<path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="M19 16v6"/><path d="M22 19h-6"/>`,
  'Sistema/Equipamento': BACKPACK,
  'Sistema/Equipamento/Armaduras': SHIELD,
  'Sistema/Equipamento/Armas': SWORDS,
  'Sistema/Equipamento/Escudos': `${SHIELD}<path d="M12 4v16"/>`,
  'Sistema/Equipamento/Tesouros/Consumíveis': `<path d="M10 2v6.5L4.5 18a2 2 0 0 0 1.75 3h11.5a2 2 0 0 0 1.75-3L14 8.5V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/>`,
  'Sistema/Equipamento/Tesouros/Equipamentos': BACKPACK,
  'Sistema/Equipamento/Tesouros/Imbuições e Qualidade': `<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.6 1.8 1.9.7-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.7z"/>`,
  'Sistema/Equipamento/Tesouros/Implementos': `<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>`,
  'Sistema/Regras': `<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>`,
}

/** PATH interno do ícone <svg> daquele path da navegação, ou undefined. */
export function navIconPath(path: string): string | undefined {
  return NAV_ICON_PATHS[path]
}

/** É um nó de navegação (mostra botões dos filhos), não uma folha? */
export function isNavNode(path: string): boolean {
  return path in NAV_CHILDREN
}

/** Filhos de um nó de navegação (paths), ou [] se for folha. */
export function navChildren(path: string): string[] {
  return NAV_CHILDREN[path] ?? []
}

/** Meta (ícone/label) de um path da navegação, ou undefined pra folhas puras. */
export function navMeta(path: string): CompendioMeta | undefined {
  return NAV_META[path]
}

/** Rótulo exibível de um path: override do registro, senão o basename da pasta. */
export function navLabel(path: string): string {
  return NAV_META[path]?.label ?? path.split('/').pop() ?? path
}

/**
 * Pai LÓGICO de um path na árvore de navegação (não o pai da pasta na vault):
 * o nó cujo NAV_CHILDREN contém `path`. Ex.: o pai de
 * `Sistema/Equipamento/Tesouros/Consumíveis` é `Sistema/Equipamento` ("Items"),
 * pulando o intermediário "Tesouros" que a árvore manual achatou (#245). Retorna
 * '' (home) quando o pai é a raiz e undefined quando `path` não é filho de nó
 * algum (aí o call-site sobe um segmento de pasta cru — ver navAncestors).
 */
export function navParent(path: string): string | undefined {
  for (const parent of Object.keys(NAV_CHILDREN)) {
    if (NAV_CHILDREN[parent]!.includes(path)) return parent
  }
  return undefined
}

/**
 * Cadeia de ancestrais LÓGICA de `path`, da raiz até o próprio `path` (inclusive),
 * SEM a home '' — a fonte de verdade é a árvore de navegação (#269), não as pastas
 * da vault. Nós fora do registro (subpastas mais fundas que uma folha do registro)
 * sobem por segmento de pasta cru até encontrar um nó do registro; intermediários
 * achatados (ex.: "Tesouros") nunca viram crumb porque a folha do registro pula
 * direto pro pai lógico.
 */
export function navAncestors(path: string): string[] {
  const chain: string[] = []
  let cur = path
  // guarda contra ciclo/paths degenerados
  for (let i = 0; cur && i < 32; i++) {
    chain.unshift(cur)
    const logical = navParent(cur)
    if (logical !== undefined) {
      cur = logical // '' encerra o laço (home é o crumb raiz, renderizado à parte)
    } else {
      const up = cur.split('/').slice(0, -1).join('/')
      if (up === cur) break
      cur = up
    }
  }
  return chain
}
