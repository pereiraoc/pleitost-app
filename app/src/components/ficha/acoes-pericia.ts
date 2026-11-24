// AÇÕES DE PERÍCIA por perícia — catálogo real da vault: cada doc de Ação de
// Perícia aponta a(s) perícia(s) no inline `perícia::`. Chave = slug da perícia
// (slugify: "Sobrevivência" → "Sobrevivencia"). Usado na sub-aba PERÍCIAS do
// Combate (p.acts do design) e na atividade da Ferramenta Obra-prima (#604).
import { useMemo } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import type { VaultDoc } from '../../data/types'
import { wikiLabels } from './hero-model'
import { slugify } from './registry'

const ACOES_PERICIA_FOLDER = 'Sistema/Regras/Ações/Ações de Perícia/'

/** `ativo` = false não carrega nada (mapa vazio) — o inventário só precisa
 *  quando há tesouro com escolha de perícia. */
export function useAcoesPorPericia(ativo = true): Map<string, VaultDoc[]> {
  const catalog = useCatalog()
  const ids = useMemo(
    () =>
      ativo
        ? catalog.content
            .filter((e) => e.id.startsWith(ACOES_PERICIA_FOLDER) && e.basename !== 'Ações de Perícia')
            .map((e) => e.id)
        : [],
    [catalog, ativo],
  )
  const docs = useDocs(ids)
  return useMemo(() => {
    const map = new Map<string, VaultDoc[]>()
    if (docs) {
      for (const acaoDoc of docs.values()) {
        const alvo = (acaoDoc.inlineFields as Record<string, unknown>)['perícia']
        for (const label of wikiLabels(alvo)) {
          const key = slugify(label)
          const list = map.get(key) ?? []
          list.push(acaoDoc)
          map.set(key, list)
        }
      }
      for (const list of map.values())
        list.sort((a, b) => (a.basename ?? '').localeCompare(b.basename ?? '', 'pt'))
    }
    return map
  }, [docs])
}
