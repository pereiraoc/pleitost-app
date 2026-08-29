// Eixo WORLD (#519): o contexto do tema (fantasia|cyberpunk) é a fonte única
// do MUNDO ativo — sessões, heróis, conteúdo, imagens e mapa consultam aqui.
// Fantasia é o default e o formato legado (dado sem marca de mundo).
import { useSyncExternalStore } from 'react'
import { getThemeSnapshot, subscribeTheme, type ContextName } from '../theme'

export type WorldId = ContextName // 'fantasia' | 'cyberpunk'

/** Diretório do dataset de cada mundo (irmãos na base do deploy). */
export const WORLD_DATA_DIR: Record<WorldId, string> = {
  fantasia: 'vault-data',
  cyberpunk: 'vault-data-cyberpunk',
}

/** Marca da topbar por mundo (pedido do usuário: POA1987 no cyberpunk). */
export const WORLD_BRAND: Record<WorldId, string> = {
  fantasia: 'PE',
  cyberpunk: 'POA1987',
}

/** Mundo ativo (não-reativo — módulos de dados). */
export function activeWorld(): WorldId {
  return getThemeSnapshot().context
}

/** Mundo ativo reativo (componentes). */
export function useWorld(): WorldId {
  return useSyncExternalStore(subscribeTheme, activeWorld)
}

/** Observa TROCAS de mundo (não qualquer mudança de tema). Usado pra
 *  desconectar sessão ativa, resetar caches por mundo etc. */
export function onWorldChange(cb: (world: WorldId, anterior: WorldId) => void): () => void {
  let anterior = activeWorld()
  return subscribeTheme(() => {
    const atual = activeWorld()
    if (atual === anterior) return
    const de = anterior
    anterior = atual
    cb(atual, de)
  })
}
