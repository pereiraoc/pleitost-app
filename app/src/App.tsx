import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { CatalogProvider } from './data/CatalogContext'
import { AppShell } from './components/layout/AppShell'
import { TypeGrid } from './components/compendium/TypeGrid'
import { DocList } from './components/compendium/DocList'
import { DocPage } from './components/compendium/DocPage'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // home real (design do Claude Design) substitui este redirect
      { path: '/', element: <Navigate to="/compendio" replace /> },
      { path: '/compendio', element: <TypeGrid /> },
      { path: '/compendio/:type', element: <DocList /> },
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
