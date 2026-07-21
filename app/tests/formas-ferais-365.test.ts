// @vitest-environment node
// #365 — report 37148523: "Formas ferais (Leonel Bravolla) estão duplicando em
// ações de habilidade. Provavelmente arquituralmente existe um problema."
// Raiz: duas escolhas de forma (a "Forma" da Tradição Druídica e a "Forma
// Adicional" da técnica) compartilham o MESMO options-set/alvo (Acoes.Lista):
//   • ficha nova → ambas defaultavam pro MESMO options[0] (Forma Caçadora);
//   • lista materializada → a inferência 2b "roubava" a forma persistida da
//     OUTRA escolha e o default re-appendava a mesma.
// Fix (mesma regra do dropdown, que filtra `taken`): default nunca repete
// opção já tomada; siblings distribuem defaults (pass C); inferência 2b não
// pega item com tag de outra escolha. Todas tomadas → sem pick (pendência).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { loadDoc } from '../src/data/useDoc'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

function druidaFm(acoes: unknown[]): Record<string, unknown> {
  return {
    categoria: 'Criatura',
    subcategoria: 'Heroi',
    Nível: 3,
    Classe: '[[Druida]]',
    Atributos: { Principal: 'INT', FOR: 0, AGI: 1, INT: 3, PRE: 1 },
    Habilidades: { Lista: [{ '[[Tradição Druídica (Xamã)|Tradição Druídica]]': 'Regra.[[Druida]]' }] },
    Tecnicas: { Lista: [{ '[[Forma Adicional]]': 'Slot.A' }] },
    Acoes: { Lista: acoes },
    Pericias: { Slots: { A: 0, E: 0, M: 0 }, Lista: [] },
    Magias: { Slots: {}, Lista: [] },
    Vida: { Vitalidade: 0, Moral: 0 },
  }
}

const formaTargets = (acoes: unknown[]): string[] =>
  acoes
    .map((a) => Object.keys(a as Record<string, unknown>)[0] ?? '')
    .filter((k) => k.includes('Forma'))

describe('#365 — formas ferais não duplicam nas ações', () => {
  it('ficha nova: as escolhas de forma (Tradição + Forma Adicional) NÃO pickam a mesma', async () => {
    const { projection } = await projectHeroRules(druidaFm([]) as never, catalog, loadDoc)
    // O sintoma: os dropdowns de "Forma" e "Forma Adicional" defaultavam AMBOS
    // pra [[Forma Caçadora]] — a mesma forma "duplicada" nas ações de
    // habilidade. Os picks das escolhas de FORMA têm que ser distintos.
    const formPicks = (projection.habilidadeChoices ?? [])
      .filter((c: { options?: string[] }) => (c.options ?? []).some((o) => String(o).includes('Forma Caçadora')))
      .map((c: { pick?: string | null }) => c.pick)
      .filter(Boolean)
    expect(formPicks.length).toBeGreaterThanOrEqual(2)
    expect(new Set(formPicks).size, `picks repetidos: ${JSON.stringify(formPicks)}`).toBe(formPicks.length)
    // e a lista derivada segue sem forma repetida
    const acoes = ((projection.derivedFm as Record<string, any>).Acoes?.Lista ?? []) as unknown[]
    const formas = formaTargets(acoes)
    expect(new Set(formas.map((f) => f.replace(/\|.*$/, ''))).size).toBe(formas.length)
  }, 60000)

  it('forma da Tradição PERSISTIDA: a Forma Adicional não a rouba nem re-appenda', async () => {
    const persistida = [{ '[[Forma Caçadora]]': 'Escolha.[[Tradição Druídica (Xamã)]]' }]
    const { projection } = await projectHeroRules(druidaFm(persistida) as never, catalog, loadDoc)
    const acoes = ((projection.derivedFm as Record<string, any>).Acoes?.Lista ?? []) as unknown[]
    const formas = formaTargets(acoes)
    const cacadoras = formas.filter((f) => f.includes('Caçadora'))
    expect(cacadoras.length, `Caçadora duplicada: ${JSON.stringify(acoes)}`).toBe(1)
    // sem duplicatas em geral
    expect(new Set(formas.map((f) => f.replace(/\|.*$/, ''))).size).toBe(formas.length)
  }, 60000)
})
