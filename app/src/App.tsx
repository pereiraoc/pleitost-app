import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { routerBasename } from './data/base-url'
import { CatalogProvider } from './data/CatalogContext'
import { startPublishedOverlays } from './data/published-overlay-store'
import { SessionRepoProvider } from './data/session-repo/provider'
import { AppShell } from './components/layout/AppShell'
import { FolderView } from './components/compendium/FolderView'

// #291: code-splitting por rota. A HOME (compêndio/FolderView) fica no bundle
// inicial (é a 1ª tela); as telas pesadas (ficha com todas as abas + motor de
// regras, sessão, config, markdown/dataview do doc, listas de criaturas) viram
// chunks carregados sob demanda — o bundle inicial encolhe muito. O SW do PWA
// pré-cacheia os chunks, então o update flow cobre a troca.
const DocPage = lazy(() => import('./components/compendium/DocPage').then((m) => ({ default: m.DocPage })))
const HeroisPage = lazy(() => import('./components/creatures/CreaturesPages').then((m) => ({ default: m.HeroisPage })))
const NpcsPage = lazy(() => import('./components/creatures/CreaturesPages').then((m) => ({ default: m.NpcsPage })))
const ConfigPage = lazy(() => import('./components/config/ConfigPage').then((m) => ({ default: m.ConfigPage })))
const FichaPage = lazy(() => import('./components/ficha/FichaPage').then((m) => ({ default: m.FichaPage })))
const SessaoFichaPage = lazy(() =>
  import('./components/sessao/SessaoFichaPage').then((m) => ({ default: m.SessaoFichaPage })),
)

/** Fallback discreto enquanto o chunk da rota carrega. */
function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        letterSpacing: '.1em',
        color: 'var(--muted)',
      }}
    >
      carregando…
    </div>
  )
}

/** Envolve o elemento lazy num limite de Suspense. */
const L = (el: ReactNode) => <Suspense fallback={<RouteFallback />}>{el}</Suspense>

const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        // home real (design do Claude Design) substitui este redirect
        { path: '/', element: <Navigate to="/compendio" replace /> },
        { path: '/compendio', element: <FolderView /> },
        { path: '/compendio/*', element: <FolderView /> },
        { path: '/herois', element: L(<HeroisPage />) },
        { path: '/npcs', element: L(<NpcsPage />) },
        { path: '/heroi/*', element: L(<FichaPage />) },
        { path: '/sessao-ficha/:charId', element: L(<SessaoFichaPage />) },
        { path: '/config', element: L(<ConfigPage />) },
        { path: '/doc/*', element: L(<DocPage />) },
      ],
    },
    // #210: sob GitHub Pages de projeto o app vive em /pleitost-app/ — sem o
    // basename o router 404-eia a própria home.
  ],
  { basename: routerBasename() },
)

export default function App() {
  // Carrega + assina os overlays publicados (#47) uma vez. Graceful sem Supabase.
  useEffect(() => {
    startPublishedOverlays()
  }, [])
  return (
    <CatalogProvider>
      <SessionRepoProvider>
        <RouterProvider router={router} />
      </SessionRepoProvider>
    </CatalogProvider>
  )
}
