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
import {
  getLocalDoc,
  getLocalEntityExtras,
  getLocalEntitySession,
  isLocalId,
  setLocalEntityExtras,
  setLocalEntityFm,
  setLocalEntitySession,
  useLocalStoreVersion,
} from './local-entities'

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

/** Modelo de uma entidade LOCAL (issues #42–#47): o FM local É a fonte de
 *  verdade — não há doc extraído imutável embaixo, então as edições gravam o
 *  path direto no store local (sem overlay). session/extras vivem no próprio
 *  registro da entidade. */
function useLocalHeroModel(heroId: string, localVersion: number): HeroModel {
  return useMemo<HeroModel>(() => {
    const fm = (getLocalDoc(heroId)?.frontmatter ?? {}) as Record<string, unknown>
    const session = getLocalEntitySession(heroId)
    const extras = getLocalEntityExtras(heroId)
    return {
      fm,
      edits: { fm: {}, session, extras: extras as unknown as Record<string, unknown> },
      extras,
      set: (path, value) => setLocalEntityFm(heroId, path, value),
      setVolatile: (path, value) => setLocalEntityFm(heroId, path, value),
      setSession: (path, value) => setLocalEntitySession(heroId, path, value),
      session: (path) => session[path],
      setExtras: (key, list) => setLocalEntityExtras(heroId, key, list),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroId, localVersion])
}

/** Docs SINTÉTICOS da sessão (#188): ficha de OUTRO jogador vista pelo GM —
 *  100%% readonly. Setters viram no-op no ÚNICO choke point de escrita da
 *  ficha (todas as abas escrevem via model.set/setVolatile/setSession), então
 *  nenhuma aba precisa conhecer a flag. */
function readonlyModel(doc: VaultDoc): HeroModel {
  const noop = () => {}
  return {
    fm: (doc.frontmatter ?? {}) as Record<string, unknown>,
    edits: { fm: {}, session: {}, extras: {} },
    extras: { armas: [], tesouros: [] },
    set: noop,
    setVolatile: noop,
    setSession: noop,
    session: () => undefined,
    setExtras: noop,
  }
}

export function useHeroModel(doc: VaultDoc, origem: string): HeroModel {
  const heroId = doc.id
  const local = isLocalId(heroId)
  const localVersion = useLocalStoreVersion()
  // Store de overlay da vault (sempre assinado; vazio pra ids locais).
  const edits = useSyncExternalStore(
    (cb) => subscribeHero(heroId, cb),
    () => getHeroEdits(heroId),
  )
  const localModel = useLocalHeroModel(heroId, localVersion)

  const fm = useMemo(
    () => applyFmEdits((doc.frontmatter ?? {}) as Record<string, unknown>, edits.fm),
    [doc, edits],
  )

  const vaultModel = useMemo<HeroModel>(
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

  if (heroId.startsWith('sessao:')) return readonlyModel(doc)
  return local ? localModel : vaultModel
}
