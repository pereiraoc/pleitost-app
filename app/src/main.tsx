import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initPersistence } from './data/remote-persist'
import { getThemeSnapshot } from './theme'
import './styles/theme.css'
import './styles/tokens.css'
import './styles/app.css'

// Inicializa o store de tema no boot → applyDom roda já (destaque nomeado no
// DOM desde o 1º render). Sem isto, o primeiro getTheme só acontecia quando a
// Config montava, e a cor de destaque só "acertava" ao visitar Config.
getThemeSnapshot()

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
