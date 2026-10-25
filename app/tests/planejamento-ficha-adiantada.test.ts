// PLANEJAMENTO TRAVADO (report 2026-10-25, Inri Prismo): herói de Nível 1 com a
// ficha "adiantada" (Elementalista, Treinamento de Arcanista e as magias da
// classe secundária já gravadas). Os cards atribuem essas magias reais aos
// níveis 2/4/7; o pinsFaltantes as registrava lá e o semRegistrosContraditos
// as tirava no rebuild seguinte — a aba gravava/regravava pra sempre e não
// abria. O heal (mesma sequência do PlanejamentoPanel) tem que estabilizar.
import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { applyFmEdits } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import {
  buildLevelTimeline,
  gastosRegistrados,
  nivelSincronizado,
  pinsValidos,
  sanitizarRegistros,
  semRegistrosContraditos,
} from '../src/rules/level-timeline'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc
const heroi = JSON.parse(
  fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/heroi-adiantado-animista.json'), 'utf8'),
) as { frontmatter: Record<string, unknown> }

it('o heal do Planejamento estabiliza numa ficha adiantada', async () => {
  let fm = heroi.frontmatter
  const nivel = 1
  let escritas = 0
  for (let i = 0; i < 6; i++) {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const regs = gastosRegistrados(fm)
    const contra = semRegistrosContraditos(fm, regs, nivel, nivelSincronizado(fm, nivel))
    if (contra.mudou) {
      fm = applyFmEdits(fm, { 'Planejamento.gastosSlots': contra.registros })
      escritas++
      continue
    }
    const { mudou, registros: sane } = sanitizarRegistros(cards, regs, nivel)
    const pins = pinsValidos(fm, cards, sane, nivel)
    if (!mudou && pins.length === 0) break
    fm = applyFmEdits(fm, { 'Planejamento.gastosSlots': [...sane, ...pins] })
    escritas++
  }
  expect(escritas).toBeLessThanOrEqual(2)
}, 120000)
