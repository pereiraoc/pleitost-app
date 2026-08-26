// @vitest-environment node
// INVARIANTES do Planejamento validadas contra TODOS os heróis da vault
// (review 2026-08-26). Só propriedades imunes a drift de conteúdo — valem
// pra qualquer herói, então re-extract não quebra este arquivo:
//   1. a timeline constrói sem erro
//   2. nenhum gasto REAL atribuído acima do nível do herói
//   3. o seed é IDEMPOTENTE: semeado uma vez, rebuild não gera novos pins
//      nem novo heal (sem oscilação de escrita ao abrir a aba)
//   4. registros semeados nunca PERDEM alvo (dedup só remove duplicata exata)
//   5. o bloco Planejamento segue INERTE pra engine (derivedFm idêntico)
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import {
  buildLevelTimeline,
  gastosRegistrados,
  pinsFaltantes,
  sanitizarRegistros,
} from '../src/rules/level-timeline'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const heroisDir = path.join(vaultDataDir, 'Sistema/Criaturas/Heróis')
const herois = fs
  .readdirSync(heroisDir)
  .filter((f) => f.endsWith('.json') && f !== 'Heróis.json')

describe('invariantes da timeline — todos os heróis da vault', () => {
  it.each(herois)('%s', async (arquivo) => {
    const doc = JSON.parse(fs.readFileSync(path.join(heroisDir, arquivo), 'utf8')) as VaultDoc
    const fm = doc.frontmatter as Record<string, unknown>
    const nivel = Number(fm['Nível'] ?? fm['Nivel']) || 1

    // 1. constrói sem erro
    const cards = await buildLevelTimeline(fm, catalog, load)
    expect(cards).toHaveLength(10)

    // 2. nenhum gasto REAL acima do nível do herói
    for (const c of cards) {
      if (c.nivel <= nivel) continue
      const reais = [
        ...c.gastos.pericias.filter((g) => !g.planejado),
        ...c.gastos.tecnicas.filter((g) => !g.planejado),
        ...c.gastos.magias.filter((g) => !g.planejado),
        ...c.gastos.especialidades.filter((g) => !g.planejado),
      ]
      expect(reais, `${arquivo}: gasto real no N${c.nivel} > nível ${nivel}`).toHaveLength(0)
    }

    // 3. seed idempotente: semeia (heal + pins) e reconstrói — segunda
    //    passada não pode gerar pins novos nem heal novo (senão abrir a aba
    //    entraria em loop de escritas)
    const { registros: sane } = sanitizarRegistros(cards, gastosRegistrados(fm))
    const semeados = [...sane, ...pinsFaltantes(cards, sane)]
    const fmSemeado = {
      ...fm,
      Planejamento: {
        ...((fm['Planejamento'] as Record<string, unknown>) ?? {}),
        gastosSlots: semeados,
      },
    }
    const cards2 = await buildLevelTimeline(fmSemeado, catalog, load)
    const pins2 = pinsFaltantes(cards2, semeados)
    expect(pins2, `${arquivo}: pins novos na 2ª abertura`).toHaveLength(0)
    const heal2 = sanitizarRegistros(cards2, semeados)
    expect(heal2.mudou, `${arquivo}: heal re-escreve na 2ª abertura`).toBe(false)

    // 4. nenhum ALVO se perde no ciclo seed→rebuild→heal
    const alvos = (rs: Array<{ tipo: string; alvo: string; rank?: string }>) =>
      new Set(rs.map((r) => `${r.tipo}|${r.alvo}|${r.rank ?? ''}`))
    const antes = alvos(semeados)
    const depois = alvos(heal2.registros)
    for (const a of antes) expect(depois.has(a), `${arquivo}: alvo perdido ${a}`).toBe(true)

    // 5. bloco Planejamento é INERTE pra engine
    const semPlanejamento = { ...fm }
    delete (semPlanejamento as Record<string, unknown>)['Planejamento']
    const [comP, semP] = await Promise.all([
      projectHeroRules(fmSemeado, catalog, load),
      projectHeroRules(semPlanejamento, catalog, load),
    ])
    // o derivedFm ECOA as chaves do input (rawKept) — remove o próprio bloco
    // antes de comparar: o que importa é a engine não mudar NADA além dele
    const semBloco = (proj: unknown) => {
      const d = { ...((proj as { derivedFm?: Record<string, unknown> }).derivedFm ?? {}) }
      delete d['Planejamento']
      return JSON.stringify(d)
    }
    expect(semBloco(comP.projection)).toBe(semBloco(semP.projection))
  }, 120000)
})
