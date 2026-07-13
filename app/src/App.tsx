import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { routerBasename } from './data/base-url'
import { CatalogProvider } from './data/CatalogContext'
import { SessionRepoProvider } from './data/session-repo/provider'
import { AppShell } from './components/layout/AppShell'
import { FolderView } from './components/compendium/FolderView'
import { DocPage } from './components/compendium/DocPage'
import { HeroisPage, NpcsPage } from './components/creatures/CreaturesPages'
import { ConfigPage } from './components/config/ConfigPage'
import { FichaPage } from './components/ficha/FichaPage'
import { SessaoFichaPage } from './components/sessao/SessaoFichaPage'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // home real (design do Claude Design) substitui este redirect
      { path: '/', element: <Navigate to="/compendio" replace /> },
      { path: '/compendio', element: <FolderView /> },
      { path: '/compendio/*', element: <FolderView /> },
      { path: '/herois', element: <HeroisPage /> },
      { path: '/npcs', element: <NpcsPage /> },
      { path: '/heroi/*', element: <FichaPage /> },
      { path: '/sessao-ficha/:charId', element: <SessaoFichaPage /> },
      { path: '/config', element: <ConfigPage /> },
      { path: '/doc/*', element: <DocPage /> },
    ],
  },
  // #210: sob GitHub Pages de projeto o app vive em /pleitost-app/ — sem o
  // basename o router 404-eia a própria home.
], { basename: routerBasename() })

export default function App() {
  return (
    <CatalogProvider>
      <SessionRepoProvider>
        <RouterProvider router={router} />
      </SessionRepoProvider>
    </CatalogProvider>
  )
}
