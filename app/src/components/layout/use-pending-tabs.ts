// #302: conjunto de abas (CHAR_TABS) do herói com PENDÊNCIA — alimenta o
// indicador no painel esquerdo. Projeta o modelo derivado + rules do herói (as
// mesmas contas dos painéis, via heroPendencias) e memoiza pelo FM.
import { useMemo } from 'react'
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import { fichaFamiliaOf } from '../../data/familia'
import { heroPendencias } from '../../rules/pendencias'

const EMPTY: ReadonlySet<string> = new Set()
const STUB_DOC = {
  id: '',
  path: '',
  basename: '',
  type: null,
  subtype: null,
  grupo: null,
  kind: 'content',
  frontmatter: {},
  body: '',
  inlineFields: {},
  ruleElements: [],
} as unknown as VaultDoc

export function usePendingTabs(heroDoc: VaultDoc | undefined): ReadonlySet<string> {
  // Hooks SEMPRE chamados (stub quando não há herói) — projeção memoizada por FM.
  const model = useHeroModel(heroDoc ?? STUB_DOC, 'nav-pend')
  const rules = useHeroRules(model.fm)
  return useMemo(() => {
    if (!heroDoc) return EMPTY
    const fm = rules?.derivedFm ?? model.fm
    return heroPendencias(fm, rules, fichaFamiliaOf(heroDoc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroDoc, model.fm, rules])
}
