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
    if (NAV_CHILDREN[parent].includes(path)) return parent
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
