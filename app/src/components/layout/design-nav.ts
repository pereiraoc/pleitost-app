// Registro central da navegação DESENHADA — fonte: design/pulled/Companion
// App.dc.html (CHAR_TABS/APP_NAV/TITLES do script do design). Itens sem tela
// implementada renderizam disabled; ao implementar uma tela, ligue a rota no
// AppShell, nunca invente entradas aqui.

export interface NavItem {
  id: string
  ic: string
  label: string
}

export const CHAR_TABS: NavItem[] = [
  { id: 'perfil', ic: '👤', label: 'BIOGRAFIA' },
  { id: 'anotacoes', ic: '🪶', label: 'ANOTAÇÕES' },
  { id: 'grupos', ic: '👥', label: 'GRUPO' },
  { id: 'habilidades', ic: '📕', label: 'COMPETÊNCIAS' },
  { id: 'inventario', ic: '🎒', label: 'INVENTÁRIO' },
  { id: 'combate', ic: '🥊', label: 'COMBATE' },
]

export const APP_NAV: NavItem[] = [
  { id: 'herois', ic: '👤', label: 'HERÓIS' },
  { id: 'npcs', ic: '👤', label: 'NPCS' },
  { id: 'sessao', ic: '🌐', label: 'SESSÃO' },
  { id: 'compendio', ic: '📖', label: 'COMPÊNDIO' },
  { id: 'config', ic: '⚙️', label: 'CONFIG' },
]

export const TITLES: Record<string, string> = {
  perfil: 'BIOGRAFIA',
  habilidades: 'COMPETÊNCIAS',
  inventario: 'INVENTÁRIO',
  anotacoes: 'ANOTAÇÕES',
  combate: 'COMBATE',
  grupos: 'GRUPO',
  herois: 'HERÓIS',
  npcs: 'NPCS',
  sessao: 'SESSÃO',
  compendio: 'COMPÊNDIO',
  config: 'CONFIG',
}

/** Kicker da tela do compêndio, como desenhado. */
export const COMPENDIO_KICKER = '// COMPÊNDIO DO SISTEMA'
