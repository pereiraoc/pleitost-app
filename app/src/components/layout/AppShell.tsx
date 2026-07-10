import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTheme } from '../../theme'
import { heroPath } from '../../paths'
import { setSelectedCreature, useSelectedCreature } from '../../data/selected-creature-store'
import { TopbarFicha } from './TopbarFicha'
import {
  APP_NAV,
  CHAR_TABS,
  NAV_ICON_PATHS,
  NAV_ROUTES,
  TITLES,
  type NavItem,
} from './design-nav'

/** Espelho do ICON_WRAP do design: mesmo wrapper <svg>, miolo verbatim do pull. */
function NavIcon({ id }: { id: string }) {
  const paths = NAV_ICON_PATHS[id]
  if (!paths) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  )
}

function NavButton({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const route = NAV_ROUTES[item.id]
  // itens sem tela implementada ficam desenhados porém disabled
  if (route) {
    return (
      <NavLink
        to={route}
        onClick={onNavigate}
        className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
      >
        <span className="nav-ic" aria-hidden>
          <NavIcon id={item.id} />
        </span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
    )
  }
  return (
    <button className="nav-item" disabled>
      <span className="nav-ic" aria-hidden>
        <NavIcon id={item.id} />
      </span>
      <span className="nav-label">{item.label}</span>
    </button>
  )
}

/** CHAR_TAB com ficha aberta: ativo e trocando a ?tab= da própria ficha. */
function CharTabButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onSelect}>
      <span className="nav-ic" aria-hidden>
        <NavIcon id={item.id} />
      </span>
      <span className="nav-label">{item.label}</span>
    </button>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Colapso da sidebar em desktop (navCollapsed do design; toggleNav do
  // renderVals: <820 abre o drawer, >=820 colapsa pra 64px só-ícones).
  const [collapsed, setCollapsed] = useState(false)
  const { mode, toggleMode } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Ficha aberta (/heroi/...): CHAR_TABS ficam ativas e trocam a ?tab=.
  const fichaOpen = pathname.startsWith('/heroi/')
  const fichaTab = fichaOpen ? (searchParams.get('tab') ?? 'perfil') : null
  const routeHeroId = fichaOpen ? decodeURIComponent(pathname.slice('/heroi/'.length)) : null
  // #86: seleção PERSISTIDA — o personagem "selecionado" continua ativo mesmo
  // fora da ficha (na tela de seleção etc.), até escolher outro. heroId efetivo
  // = o da rota OU o selecionado.
  const selectedId = useSelectedCreature()
  const heroId = routeHeroId ?? selectedId
  useEffect(() => {
    if (routeHeroId) setSelectedCreature(routeHeroId) // abrir uma ficha memoriza a seleção
  }, [routeHeroId])

  const section = fichaOpen
    ? fichaTab
    : pathname.startsWith('/herois')
      ? 'herois'
      : pathname.startsWith('/npcs')
        ? 'npcs'
        : pathname.startsWith('/config')
          ? 'config'
          : pathname.startsWith('/compendio') || pathname.startsWith('/doc')
            ? 'compendio'
            : null
  const title = section ? TITLES[section] : ''
  const closeDrawer = () => setDrawerOpen(false)

  const selectFichaTab = (id: string) => {
    // navega pra ficha do personagem selecionado, na aba pedida (#86: funciona
    // mesmo estando na tela de seleção — não fica "não clicável").
    if (heroId) navigate(heroPath(heroId, id === 'perfil' ? undefined : id))
    closeDrawer()
  }

  return (
    <div className="app-root">
      <header className="topbar">
        <button
          className="topbar-menu"
          onClick={() => {
            if (window.innerWidth < 820) setDrawerOpen((open) => !open)
            else setCollapsed((c) => !c)
          }}
          title="Menu"
        >
          ☰
        </button>
        <span className="brand-badge">PE</span>
        <span className="topbar-title">{title}</span>
        <div className="topbar-spacer" />
        <button
          className="mode-toggle"
          onClick={toggleMode}
          title="Alternar modo claro/escuro"
        >
          {mode === 'dark' ? '🌙' : '☀️'}
        </button>
        {heroId ? <TopbarFicha key={heroId} id={heroId} tab={fichaTab ?? 'perfil'} /> : null}
      </header>
      <div className="body-row">
        <aside
          className={[
            'sidebar',
            drawerOpen ? 'drawer-open' : '',
            collapsed ? 'collapsed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <nav className="nav-group">
            {CHAR_TABS.map((item) =>
              // #86: clicáveis sempre que HÁ personagem (rota OU selecionado) —
              // não ficam mortas na tela de seleção. Só destacam a aba ativa
              // quando de fato na ficha.
              heroId ? (
                <CharTabButton
                  key={item.id}
                  item={item}
                  active={fichaOpen && fichaTab === item.id}
                  onSelect={() => selectFichaTab(item.id)}
                />
              ) : (
                <NavButton key={item.id} item={item} onNavigate={closeDrawer} />
              ),
            )}
          </nav>
          <div className="sidebar-spacer" />
          <nav className="nav-group">
            {APP_NAV.map((item) => (
              <NavButton key={item.id} item={item} onNavigate={closeDrawer} />
            ))}
          </nav>
        </aside>
        {drawerOpen ? <div className="drawer-scrim" onClick={closeDrawer} /> : null}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
