import { Link, Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-title">
          Pleitost
        </Link>
        <nav>
          <Link to="/compendio">Compêndio</Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
