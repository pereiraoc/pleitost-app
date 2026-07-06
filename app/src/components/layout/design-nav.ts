// Registro central da navegação DESENHADA — fonte: design/pulled/Companion
// App.dc.html (CHAR_TABS/APP_NAV/TITLES do script do design). Itens sem tela
// implementada renderizam disabled; ao implementar uma tela, ligue a rota no
// AppShell, nunca invente entradas aqui.

export interface NavItem {
  id: string
  /** Emoji do script do design (STUB_ICONS/telas stub) — a sidebar usa NAV_ICON_PATHS. */
  ic: string
  label: string
}

/**
 * Miolo SVG dos ícones da sidebar, VERBATIM do bloco `ICONS`/`ICON_WRAP` do
 * design (design/pulled/Companion App.dc.html linhas ~1648-1661). O wrapper
 * <svg> (viewBox 24, stroke currentColor, width 1.7) vive no <NavIcon> do
 * AppShell, espelhando o ICON_WRAP do design.
 */
export const NAV_ICON_PATHS: Record<string, string> = {
  perfil: `<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5v13"/>`,
  anotacoes: `<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>`,
  habilidades: `<path d="M15 11.5h-4.5"/><path d="M15 8h-4.5"/><path d="M18.5 16.5V5.5a2 2 0 0 0-2-2H4.2"/><path d="M8 20.5h10.5a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5.5a2 2 0 1 0-4 0v1.6a1 1 0 0 0 1 1h2.8"/>`,
  inventario: `<rect x="3.5" y="9" width="17" height="10.5" rx="1.5"/><path d="M3.5 13h17"/><path d="M4.5 9V7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5V9"/><rect x="10.5" y="11.5" width="3" height="3.6" rx="0.6"/>`,
  combate: `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/>`,
  grupos: `<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4"/><path d="M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>`,
  herois: `<circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6"/>`,
  npcs: `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10.5" r="2.2"/><path d="M6.4 15.5a3 3 0 0 1 5.2 0"/><line x1="14" y1="9.5" x2="18" y2="9.5"/><line x1="14" y1="13.5" x2="18" y2="13.5"/>`,
  sessao: `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1"/><circle cx="15.5" cy="8.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="8.5" cy="15.5" r="1.1"/><circle cx="15.5" cy="15.5" r="1.1"/>`,
  compendio: `<path d="M6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M9 6.5h6"/>`,
  config: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
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

/** Rotas implementadas por item de nav; itens fora daqui renderizam disabled. */
export const NAV_ROUTES: Record<string, string> = {
  compendio: '/compendio',
  herois: '/herois',
  npcs: '/npcs',
  config: '/config',
}
