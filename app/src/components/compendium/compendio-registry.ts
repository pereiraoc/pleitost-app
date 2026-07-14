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
