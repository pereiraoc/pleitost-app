// #291 (rules-fidelity): projectWorkingModel keia model.pericias pelo SLUG
// canônico (igual à base, rules-model.ts:172 periciaId=slugify). Mas os appliers
// Definir/Proficiencia gravam a chave do delta com `action.targetRaw` CRU (sem
// slugify — rule-applier.ts:344/347/399), enquanto escolha-pericia-especial
// slugifica. Uma regra que mira uma perícia ACENTUADA (ex.: Enganação) gerava
// chave crua no delta → projectWorkingModel criava uma 2ª entrada divergente da
// base, e as cascatas entre iterações (Condicional INT/prof) liam a errada.
import { describe, expect, it } from 'vitest'
import { projectWorkingModel } from '../src/rules/extract'
import { rulesModelFromFm } from '../src/rules/rules-model'

describe('#291: projectWorkingModel normaliza a chave de perícia pra slug', () => {
  it('delta com nome CRU acentuado (Enganação) atualiza a entrada slug (Enganacao), sem duplicar', () => {
    const base = rulesModelFromFm({
      Pericias: { Lista: [{ Nome: 'Enganação', Proficiencia: 'A' }] },
    })
    expect(Object.keys(base.pericias)).toEqual(['Enganacao'])

    // delta com targetRaw ACENTUADO (como o applier Definir/Proficiencia grava)
    const proj = projectWorkingModel(base, {
      'Pericias.Lista.Enganação.Proficiencia': 'M',
    })

    // não pode criar uma 2ª entrada 'Enganação' — atualiza a slug existente
    expect(Object.keys(proj.pericias)).toEqual(['Enganacao'])
    expect(proj.pericias.Enganacao?.proficiencia).toBe('M')
  })
})
