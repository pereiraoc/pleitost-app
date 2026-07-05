// Camada React da persistência da ficha: junta o doc extraído (vault-data,
// cache do useDoc INTOCADO) com o overlay local do hero-store e expõe setters
// tipados por dot-path. Todo componente que renderiza OU edita dados da ficha
// consome este hook — topbar e abas compartilham a MESMA fonte (diretriz
// 2026-07-05: dentro do app não existem instâncias separadas de vida/moedas).
import { useMemo, useSyncExternalStore } from 'react'
import type { VaultDoc } from './types'
import {
  applyFmEdits,
  getAtPath,
  getHeroEdits,
  subscribeHero,
  writeHeroEdit,
  type HeroEdits,
} from './hero-store'

export interface HeroModel {
  /** FM salvo local = FM extraído + overlay (projeção pura, sem regra). */
  fm: Record<string, unknown>
  /** Edições cruas (pra derivar session/extras). */
  edits: HeroEdits
  /** Adições sem linha de FM (painéis ADICIONADAS). */
  extras: { armas: string[]; tesouros: string[] }
  /** Grava um path do FM NA HORA (abas editáveis — write-through). */
  set: (path: string, value: unknown) => void
  /** Grava um path do FM com autosave debounced (aba COMBATE — `Interativa.*`,
   *  semântica do autoSaveInterativa do plugin). A UI reflete na hora. */
  setVolatile: (path: string, value: unknown) => void
  /** Estado de combate sem home no FM (chips do design, escudo erguido…). */
  setSession: (path: string, value: unknown, channel?: 'imediato' | 'autosave') => void
  /** Lê um valor de session. */
  session: (path: string) => unknown
  /** Substitui uma lista de extras (armas/tesouros adicionados). */
  setExtras: (key: 'armas' | 'tesouros', list: string[]) => void
}

function extrasList(edits: HeroEdits, key: 'armas' | 'tesouros'): string[] {
  const raw = edits.extras[key]
  return Array.isArray(raw) ? (raw as string[]) : []
}

export function useHeroModel(doc: VaultDoc, origem: string): HeroModel {
  const heroId = doc.id
  const edits = useSyncExternalStore(
    (cb) => subscribeHero(heroId, cb),
    () => getHeroEdits(heroId),
  )

  const fm = useMemo(
    () => applyFmEdits((doc.frontmatter ?? {}) as Record<string, unknown>, edits.fm),
    [doc, edits],
  )

  return useMemo<HeroModel>(
    () => ({
      fm,
      edits,
      extras: { armas: extrasList(edits, 'armas'), tesouros: extrasList(edits, 'tesouros') },
      set: (path, value) =>
        writeHeroEdit(heroId, 'fm', path, value, {
          channel: 'imediato',
          origem,
          valorAntigo: getAtPath(fm, path),
        }),
      setVolatile: (path, value) =>
        writeHeroEdit(heroId, 'fm', path, value, {
          channel: 'autosave',
          origem,
          valorAntigo: getAtPath(fm, path),
        }),
      setSession: (path, value, channel = 'autosave') =>
        writeHeroEdit(heroId, 'session', path, value, {
          channel,
          origem,
          valorAntigo: edits.session[path],
        }),
      session: (path) => edits.session[path],
      setExtras: (key, list) =>
        writeHeroEdit(heroId, 'extras', key, list, {
          channel: 'imediato',
          origem,
          valorAntigo: edits.extras[key],
        }),
    }),
    [heroId, origem, fm, edits],
  )
}
