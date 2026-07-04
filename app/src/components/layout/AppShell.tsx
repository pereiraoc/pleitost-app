import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme'
import { APP_NAV, CHAR_TABS, NAV_ROUTES, TITLES, type NavItem } from './design-nav'

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
          {item.ic}
        </span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
    )
  }
  return (
    <button className="nav-item" disabled>
      <span className="nav-ic" aria-hidden>
        {item.ic}
      </span>
      <span className="nav-label">{item.label}</span>
    </button>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { mode, toggleMode } = useTheme()
  const { pathname } = useLocation()

  const section = pathname.startsWith('/herois')
    ? 'herois'
    : pathname.startsWith('/npcs')
      ? 'npcs'
      : pathname.startsWith('/compendio') || pathname.startsWith('/doc')
        ? 'compendio'
        : null
  const title = section ? TITLES[section] : ''
  const closeDrawer = () => setDrawerOpen(false)

  return (
    <div className="app-root">
      <header className="topbar">
        <button
          className="topbar-menu"
          onClick={() => setDrawerOpen((open) => !open)}
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
      </header>
      <div className="body-row">
        <aside className={drawerOpen ? 'sidebar drawer-open' : 'sidebar'}>
          <nav className="nav-group">
            {CHAR_TABS.map((item) => (
              <NavButton key={item.id} item={item} onNavigate={closeDrawer} />
            ))}
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
