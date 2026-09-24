// F2 (#347) — efeitos COMPARTILHADOS pelos aliados de grupo. Espelho do plugin
// pleitost-autosheet:
//   • descoberta de aliados: interseção do campo `grupo` do FM entre criaturas
//     (cola/yaml-block-deps-factory.ts:866-909 listGroupAllies — scan de
//     Sistema/Criaturas/; aqui catálogo + entidades locais);
//   • efeitos do aliado: blocos `Efeitos_Interativos` das notas alcançáveis
//     pelo FM SALVO dele (materializado pelo plugin — Acoes/Magias/Habilidades
//     já listam as concessões de regra), filtrados aos SHAREÁVEIS
//     (escopo.compartilharGrupo/aplicaEm Aliados|Ambos; Invocação nunca) e
//     marcados `sharedFrom` + `sharedFromMeta` (potência do CONJURADOR) —
//     cola/share-ally-effects.ts:33-48 buildSharedAllyEffects.
// Fora do espelho (documentado): blocos tier-gated de aliado (imbuições de
// arma são ArmaSelecionada, não compartilham) e o extract BFS completo — o FM
// salvo cobre os casos da mesa (Inspiração/Ato Inspirador/Celeridade…).
import { useMemo } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import {
  getLocalDoc,
  groupIdsWithMember,
  isLocalId,
  localEntriesOfKind,
  resolveGroupMembers,
  useLocalStoreVersion,
} from '../data/local-entities'
import type { VaultDoc } from '../data/types'
import { fmOf, fmPath, num, str, wikiTarget } from '../components/ficha/hero-model'
import { blocoParaDescritor, blocoTier, type EffectDescriptor } from './descriptor'
import { collectEffectTargets } from './hero-context'

/** Basenames dos grupos do FM (`grupo: ["[[A, B, C]]", …]` — aceita string,
 *  array e arrays aninhados; espelho de resolveEffectiveGroups). */
export function groupBasenamesOf(fm: Record<string, unknown>): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    const t = wikiTarget(str(v))
    if (t) out.add(t.split('/').pop()!.trim())
  }
  walk(fm['grupo'])
  return out
}

/** Efeito pode ser compartilhado com o grupo? (plugin: compartilharGrupo/
 *  aplicaEm Aliados|Ambos → escopo CompartilhadoGrupo; Invocação nunca.) */
function shareable(d: EffectDescriptor): boolean {
  if (d.invocacao) return false
  return d.escopo === 'CompartilhadoGrupo' || d.compartilhar === 'Grupo'
}

/** Descriptors SHAREÁVEIS de um aliado a partir dos docs alcançáveis pelo FM
 *  dele — cada um marcado sharedFrom/sharedFromMeta. Puro (testável). */
export function sharedAllyDescriptors(
  allyName: string,
  allyFm: Record<string, unknown>,
  docs: readonly (VaultDoc | undefined)[],
): EffectDescriptor[] {
  // Meta do CONJURADOR — paridade de SHAPE com o allyMeta do plugin
  // (process-yaml-extract-phase.ts:338 popula {potenciaMagica, nivel}). Hoje o
  // ÚNICO campo consumido é potenciaMagica (build-effect-modifier.ts:160, lá e
  // aqui); `nivel` é carregado sem leitor — nenhum efeito compartilhável usa
  // porNivel (invocações nunca compartilham, v2.0.35/#264; Ataque Furtivo e
  // Aspecto Elemental são próprios). Fica pelo espelho fiel, não por impacto.
  const nivelAliado = num(allyFm['Nível'])
  const meta = {
    potenciaMagica: num(fmPath(allyFm, 'Magias', 'Potencia')),
    ...(nivelAliado ? { nivel: nivelAliado } : {}),
  }
  const out: EffectDescriptor[] = []
  const seen = new Set<string>()
  for (const doc of docs) {
    if (!doc) continue
    const blocos = fmOf(doc)['Efeitos_Interativos']
    if (!Array.isArray(blocos)) continue
    for (const bloco of blocos) {
      if (!bloco || typeof bloco !== 'object') continue
      // Tier-gate depende do TIER do dono — fora do escopo do compartilhamento.
      if (blocoTier(bloco as Record<string, unknown>)) continue
      const desc = blocoParaDescritor(bloco as Record<string, unknown>, doc.id)
      if (!desc || !shareable(desc)) continue
      const key = `${desc.label} ${doc.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...desc, sharedFrom: allyName, sharedFromMeta: meta })
    }
  }
  return out
}

/** Aliados de grupo + seus efeitos shareáveis, carregados do catálogo (vault)
 *  e das entidades locais. `loaded` = todas as fases de doc resolvidas. */
export function useSharedAllyDescriptors(
  selfDoc: VaultDoc,
  fm: Record<string, unknown>,
): { descriptors: EffectDescriptor[]; loaded: boolean } {
  const catalog = useCatalog()
  const localVersion = useLocalStoreVersion()
  // Review B3: `fm` muda de REFERÊNCIA a cada recompute de regras — memoiza os
  // grupos por CONTEÚDO (chave ordenada) pra cadeia aliados→targets→docs não
  // re-derivar em todo render da ficha.
  const myGroupsKey = useMemo(() => [...groupBasenamesOf(fm)].sort().join('|'), [fm])
  const myGroups = useMemo(
    () => new Set(myGroupsKey ? myGroupsKey.split('|') : []),
    [myGroupsKey],
  )
  const selfBase = selfDoc.basename ?? selfDoc.id.split('/').pop()!

  // #561: grupos por INTEGRANTES — herói nascido no app entra num grupo pelo
  // override `add` do grupo (setGroupMember), sem FM `grupo`; e um grupo pode
  // ter integrantes locais além dos do FM. Une os ids de grupo do FM (que
  // resolvem numa nota) com os grupos cujo override inclui o herói, e lista os
  // integrantes finais de cada um (base ∪ add \ remove) — vault e locais.
  const groupIds = useMemo(() => {
    const ids = new Set<string>(groupIdsWithMember(selfDoc.id))
    for (const g of myGroups) {
      const r = catalog.resolve(g)
      if (r.kind === 'doc') ids.add(r.id)
    }
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myGroups, catalog, selfDoc.id, localVersion])
  const memberIds = useMemo(
    () =>
      [...new Set(groupIds.flatMap((gid) => resolveGroupMembers(catalog, gid).map((e) => e.id)))].filter(
        (id) => id !== selfDoc.id,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupIds, catalog, localVersion],
  )
  const temGrupo = myGroups.size > 0 || groupIds.length > 0

  const candidateIds = useMemo(() => {
    if (!temGrupo) return []
    const scan = myGroups.size
      ? catalog.content
          .filter((e) => e.id.startsWith('Sistema/Criaturas/') && e.id !== selfDoc.id)
          .map((e) => e.id)
      : []
    return [...new Set([...scan, ...memberIds.filter((id) => !isLocalId(id))])]
  }, [catalog, myGroups, selfDoc.id, memberIds, temGrupo])
  const candDocs = useDocs(candidateIds)

  const allies = useMemo(() => {
    if (!temGrupo) return []
    const out: VaultDoc[] = []
    const seen = new Set<string>([selfBase])
    const aceitar = (d: VaultDoc | undefined) => {
      if (!d) return
      const base = d.basename ?? d.id
      if (seen.has(base)) return
      seen.add(base)
      out.push(d)
    }
    // Integrantes resolvidos dos grupos (FM-resolvido ∪ membership).
    const membros = new Set(memberIds)
    for (const id of memberIds) aceitar(isLocalId(id) ? getLocalDoc(id) : candDocs?.get(id))
    // Interseção por basename do FM `grupo` (caminho original — cobre grupo
    // referenciado no FM que não resolve numa nota).
    const consider = (d: VaultDoc | undefined) => {
      if (!d || membros.has(d.id)) return
      const groups = groupBasenamesOf(fmOf(d))
      let match = false
      for (const g of groups) if (myGroups.has(g)) match = true
      if (match) aceitar(d)
    }
    if (myGroups.size) {
      for (const d of candDocs?.values() ?? []) consider(d)
      for (const kind of ['Heroi', 'CompanheiroAnimal'] as const)
        for (const e of localEntriesOfKind(kind)) consider(getLocalDoc(e.id))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candDocs, myGroups, selfBase, localVersion, memberIds, temGrupo])

  const allyTargets = useMemo(
    () =>
      allies.map((ally) => {
        const ids = new Set<string>()
        for (const t of collectEffectTargets(fmOf(ally))) {
          const res = catalog.resolve(t)
          if (res.kind === 'doc') ids.add(res.id)
        }
        return { ally, ids: [...ids] }
      }),
    [allies, catalog],
  )
  const flatIds = useMemo(() => [...new Set(allyTargets.flatMap((a) => a.ids))], [allyTargets])
  const targetDocs = useDocs(flatIds)

  return useMemo(() => {
    if (!temGrupo) return { descriptors: [], loaded: true }
    if (candDocs === undefined || targetDocs === undefined) return { descriptors: [], loaded: false }
    const descriptors = allyTargets.flatMap(({ ally, ids }) =>
      sharedAllyDescriptors(
        ally.basename ?? ally.id,
        fmOf(ally),
        ids.map((id) => targetDocs.get(id)),
      ),
    )
    return { descriptors, loaded: true }
  }, [myGroups, candDocs, targetDocs, allyTargets])
}
