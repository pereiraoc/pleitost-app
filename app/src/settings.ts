// Configurações app-level da tela CONFIG (issue #35) — estado de MÓDULO
// compartilhado via useSyncExternalStore (mesmo padrão do theme/hero-store):
// a tela CONFIG escreve e os consumidores (ex. gating do BESTIÁRIO em
// CreaturesPages) refletem sem reload. Persistência por chave própria no
// localStorage (`pleitost.settings.<nome>`).
import { useSyncExternalStore } from 'react'

const MESTRE_KEY = 'pleitost.settings.mestre'

export interface Settings {
  /** Modo Mestre: ON libera o BESTIÁRIO dos NPCs; OFF bloqueia a aba. */
  mestre: boolean
}

function loadSettings(): Settings {
  try {
    return { mestre: localStorage.getItem(MESTRE_KEY) === 'true' }
  } catch {
    return { mestre: false }
  }
}

let state: Settings | null = null
const listeners = new Set<() => void>()

function getSettings(): Settings {
  state ??= loadSettings()
  return state
}

function setMestre(mestre: boolean) {
  state = { ...getSettings(), mestre }
  try {
    localStorage.setItem(MESTRE_KEY, String(mestre))
  } catch {
    /* memória continua a fonte da sessão */
  }
  for (const cb of listeners) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSettings)
  return { ...settings, setMestre }
}
