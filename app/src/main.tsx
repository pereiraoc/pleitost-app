import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initPersistence } from './data/remote-persist'
import './styles/theme.css'
import './styles/tokens.css'
import './styles/app.css'

// #84: hidrata o estado durável do servidor ANTES do 1º render (pra os dados —
// caminhos/fichas/personagens — já aparecerem, inclusive num endereço novo) e
// instala o espelho que grava cada mudança de volta. Renderiza mesmo se a
// persistência falhar (offline/deploy sem backend).
initPersistence().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
