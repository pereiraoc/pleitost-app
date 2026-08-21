// Requisito FUNCIONAL no app — espelho do plugin v2.0.45: (1) rank de perícia
// (`Requisito Pericias.Lista.<X>.Proficiencia <rank>`, semântica >= via
// lookupProfRank); (2) bloqueio no extractHeroRules (nota com requisito não
// cumprido tem as rules podadas, reason `requisito-bloqueado`); (3) helper
// `tecnicaRequisitosCumpridos` pro filtro do painel "Não Aprendidas".
// Docs REAIS da vault: "Convite para Duelo" (Requisito Contem(Habilidades))
// e "Decifrar Resistência" (Requisito de perícia Arcana M).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import {
  extractHeroRules,
  tecnicaRequisitosCumpridos,
  type DocResolver,
} from '../src/rules/extract'
import { rulesModelFromFm, type RulesModel } from '../src/rules/rules-model'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (rel: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${rel}.json`), 'utf8')) as VaultDoc

const resolver: DocResolver = async (name) => {
  const r = catalog.resolve(name)
  return r.kind === 'doc' ? readDoc(r.id) : null
}

const CONVITE = readDoc('Sistema/Criação de Personagem/Técnicas/Bardo/Convite para Duelo')
const DECIFRAR = readDoc('Sistema/Criação de Personagem/Técnicas/Arcanista/Decifrar Resistência')

const ESTILO = '[[Estilo de Combate (Luta Artística)]]'

function model(): RulesModel {
  return rulesModelFromFm({ Nível: 8 })
}

describe('tecnicaRequisitosCumpridos (filtro de opções)', () => {
  it('Convite para Duelo SEM o estilo → não cumprido (esconde)', () => {
    expect(tecnicaRequisitosCumpridos(model(), CONVITE)).toBe(false)
  })

  it('Convite para Duelo COM o estilo → cumprido (mostra)', () => {
    const m = model()
    m.habilidades.lista.push({ link: ESTILO, source: 'Manual' })
    expect(tecnicaRequisitosCumpridos(m, CONVITE)).toBe(true)
  })

  it('Decifrar Resistência com Arcana < M → não cumprido (esconde)', () => {
    expect(tecnicaRequisitosCumpridos(model(), DECIFRAR)).toBe(false)
  })

  it('Decifrar Resistência com Arcana M → cumprido (mostra)', () => {
    const m = model()
    m.pericias['Arcana'] = { nome: 'Arcana', proficiencia: 'M', bonusEspecial: 0, incrementos: [] }
    expect(tecnicaRequisitosCumpridos(m, DECIFRAR)).toBe(true)
  })

  it('doc sem Requisito → sempre cumprido', () => {
    const semReq = readDoc('Sistema/Criação de Personagem/Técnicas/Arcanista/Fonte Entrópica')
    expect(tecnicaRequisitosCumpridos(model(), semReq)).toBe(true)
  })
})

describe('extractHeroRules — bloqueio por Requisito', () => {
  it('técnica aprendida com requisito não cumprido → rules rejeitadas com requisito-bloqueado', async () => {
    const m = model()
    m.tecnicas.lista.push({ link: '[[Convite para Duelo]]', source: 'Slot.M' })
    const r = await extractHeroRules(m, resolver)
    expect(
      r.rejectedRules.some(
        (x) => x.rule.sourceNote === 'Convite para Duelo' && x.result.reason === 'requisito-bloqueado',
      ),
    ).toBe(true)
  })

  it('técnica aprendida com requisito cumprido → nada rejeitado por requisito', async () => {
    const m = model()
    m.habilidades.lista.push({ link: ESTILO, source: 'Manual' })
    m.tecnicas.lista.push({ link: '[[Convite para Duelo]]', source: 'Slot.M' })
    const r = await extractHeroRules(m, resolver)
    expect(r.rejectedRules.some((x) => x.result.reason === 'requisito-bloqueado')).toBe(false)
  })
})
