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
  setLocalEntityFmMany,
  setLocalEntitySession,
  useLocalStoreVersion,
} from './local-entities'
import { migrarEssenciasParaSlots } from '../rules/essencia-slots'
import { migrarFocosDoCatalogo } from './implementos'
import { useCatalogOpcional } from './CatalogContext'

export interface HeroModel {
  /** FM salvo local = FM extraído + overlay (projeção pura, sem regra). */
  fm: Record<string, unknown>
  /** Edições cruas (pra derivar session/extras). */
  edits: HeroEdits
  /** Adições sem linha de FM (painéis ADICIONADAS). */
  extras: { armas: string[]; tesouros: string[] }
  /** Grava um path do FM NA HORA (abas editáveis — write-through). */
  set: (path: string, value: unknown) => void
  /** Grava VÁRIOS paths de uma vez (uma escrita/notificação no store local;
   *  na vault, um edit por path). Mesma semântica do `set`. */
  setMany: (pairs: Array<[string, unknown]>) => void
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

/** Migração dos FOCOS SOLTOS (data/implementos) mexe em DUAS listas: enquanto
 *  ela estiver pendente (fm migrado ≠ base), gravar uma delas sem a outra
 *  perderia o foco (Tesouros sem ele, Implementos sem a linha nova). Toda
 *  escrita numa das duas leva a companheira, já migrada. */
const PAR_DOS_FOCOS: Record<string, string> = {
  'Inventario.Tesouros': 'Inventario.Implementos',
  'Inventario.Implementos': 'Inventario.Tesouros',
}
export function comParDosFocos(
  pairs: Array<[string, unknown]>,
  fm: Record<string, unknown>,
  pendente: boolean,
): Array<[string, unknown]> {
  if (!pendente) return pairs
  const out = [...pairs]
  for (const [path] of pairs) {
    const par = PAR_DOS_FOCOS[path]
    if (par && !out.some(([p]) => p === par)) out.push([par, getAtPath(fm, par)])
  }
  return out
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
  const catalog = useCatalogOpcional()
  return useMemo<HeroModel>(() => {
    const base = migrarEssenciasParaSlots((getLocalDoc(heroId)?.frontmatter ?? {}) as Record<string, unknown>)
    const fm = migrarFocosDoCatalogo(base, catalog)
    const par = (pairs: Array<[string, unknown]>) => comParDosFocos(pairs, fm, fm !== base)
    const setLocal = (path: string, value: unknown) => {
      const pairs = par([[path, value]])
      if (pairs.length === 1) setLocalEntityFm(heroId, path, value)
      else setLocalEntityFmMany(heroId, pairs)
    }
    const session = getLocalEntitySession(heroId)
    const extras = getLocalEntityExtras(heroId)
    return {
      fm,
      edits: { fm: {}, session, extras: extras as unknown as Record<string, unknown> },
      extras,
      set: setLocal,
      setMany: (pairs) => setLocalEntityFmMany(heroId, par(pairs)),
      setVolatile: setLocal,
      setSession: (path, value) => setLocalEntitySession(heroId, path, value),
      session: (path) => session[path],
      setExtras: (key, list) => setLocalEntityExtras(heroId, key, list),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroId, localVersion, catalog])
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
    setMany: noop,
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

  // Ficha de antes das essências por slot (escolha → Slot.X): a projeção
  // migrada é o que a aba lê e regrava — a primeira edição persiste a forma nova.
  // Foco solto (antes de "Focos as Imbuição") → implemento com foco.
  const catalog = useCatalogOpcional()
  const { fm, focosPendentes } = useMemo(() => {
    const base = migrarEssenciasParaSlots(applyFmEdits((doc.frontmatter ?? {}) as Record<string, unknown>, edits.fm))
    const migrado = migrarFocosDoCatalogo(base, catalog)
    return { fm: migrado, focosPendentes: migrado !== base }
  }, [doc, edits, catalog])

  const vaultModel = useMemo<HeroModel>(
    () => ({
      fm,
      edits,
      extras: { armas: extrasList(edits, 'armas'), tesouros: extrasList(edits, 'tesouros') },
      set: (path, value) => {
        for (const [p, v] of comParDosFocos([[path, value]], fm, focosPendentes)) {
          writeHeroEdit(heroId, 'fm', p, v, {
            channel: 'imediato',
            origem,
            valorAntigo: getAtPath(fm, p),
          })
        }
      },
      setMany: (pairs) => {
        for (const [path, value] of comParDosFocos(pairs, fm, focosPendentes)) {
          writeHeroEdit(heroId, 'fm', path, value, {
            channel: 'imediato',
            origem,
            valorAntigo: getAtPath(fm, path),
          })
        }
      },
      setVolatile: (path, value) => {
        for (const [p, v] of comParDosFocos([[path, value]], fm, focosPendentes)) {
          writeHeroEdit(heroId, 'fm', p, v, {
            channel: 'autosave',
            origem,
            valorAntigo: getAtPath(fm, p),
          })
        }
      },
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
    [heroId, origem, fm, focosPendentes, edits],
  )

  if (heroId.startsWith('sessao:')) return readonlyModel(doc)
  return local ? localModel : vaultModel
}
