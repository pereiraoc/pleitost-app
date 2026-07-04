import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { CatalogProvider } from './data/CatalogContext'
import { AppShell } from './components/layout/AppShell'
import { FolderView } from './components/compendium/FolderView'
import { DocPage } from './components/compendium/DocPage'
import { HeroisPage, NpcsPage } from './components/creatures/CreaturesPages'

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
      { path: '/doc/*', element: <DocPage /> },
    ],
  },
])

export default function App() {
  return (
    <CatalogProvider>
      <RouterProvider router={router} />
    </CatalogProvider>
  )
}
