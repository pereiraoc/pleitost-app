// @vitest-environment node
// F5 do plano #347 — bestiário:
//   24234546: "monstro genérico gerado para um combate entra na iniciativa com
//     todos os valores numéricos em 0 (ev, defesa, vigor…)" — o genérico agora
//     é um doc SINTÉTICO Tier 0/Soldado/Incomum que passa pela MESMA engine de
//     regras dos monstros reais (nada de zeros hardcoded);
//   704539d5 (parte): família Monstro ganhou o DELTA declarativo
//     (FICHA_FAMILIA — sem moral, tier em vez de nível, sem biografia/técnicas/
//     ofícios; magias readonly), que as abas leem centralmente.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { npcInputsFromRoster } from '../src/data/session-repo/encounter-actions'
import { fichaFamiliaOf } from '../src/data/familia'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GOBLIN_ID = 'Sistema/Criaturas/Bestiário/Goblin Soldado'
const goblin = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8'),
) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

describe('F5 — bestiário (#347)', () => {
  it('24234546: monstro GENÉRICO entra com stats DERIVADOS (Tier 0 Soldado), não zeros', async () => {
    const [npc] = await npcInputsFromRoster(catalog, [{ label: 'Capanga', qty: 1, sourcePath: null } as never], 'gm')
    expect(npc).toBeTruthy()
    // Soldado Tier 0: `Tier 0 Definir Vida.Vitalidade 25` (regra da classe)
    expect(npc!.summary.vitalidadeMax).toBe(25)
    // defesas derivadas (prof A da classe + bônus item do modificador) — nunca 0
    expect(npc!.summary.stats.defesa).toBeGreaterThan(0)
    expect(npc!.summary.stats.vigor).toBeGreaterThan(0)
    expect(npc!.summary.stats.movimento).toBeGreaterThan(0)
    expect(npc!.summary.family).toBe('Monstro')
    // vida corrente já nasce no máximo
    expect(npc!.state.recursosRestantes?.vitalidade).toBe(25)
  }, 30000)

  it('704539d5 (delta): caps da família Monstro — sem moral, tier, sem biografia', () => {
    const caps = fichaFamiliaOf(goblin)
    expect(caps.moral).toBe(false) // vida-panel.ts:4 do plugin
    expect(caps.tier).toBe(true) // progressão por Tier 0-3
    expect(caps.biografia).toBe(false)
    expect(caps.tecnicas).toBe(false)
    expect(caps.oficios).toBe(false)
    expect(caps.magias).toBe(true) // seção existe (readonly, sourced de classe)
    expect(caps.classe).toEqual({ rotulo: 'Classe', editavel: true })
    // herói continua com moral (delta não vaza)
    const heroi = { ...goblin, frontmatter: { subcategoria: 'Heroi' }, path: 'Sistema/Criaturas/Heróis/X' }
    expect(fichaFamiliaOf(heroi as VaultDoc).moral).toBe(true)
  })
})

describe('#362 — classe de bestiário e tier (F5 restante)', () => {
  it('projeção do MONSTRO oferece as classes de BESTIÁRIO no dropdown (não as de aventureiro)', async () => {
    const { projectHeroRules } = await import('../src/rules/useHeroRules')
    const { loadDoc } = await import('../src/data/useDoc')
    const { projection } = await projectHeroRules(
      goblin.frontmatter as never,
      catalog,
      loadDoc,
    )
    const labels = projection.classes.map((c: { label: string }) => c.label)
    expect(labels).toContain('Soldado')
    expect(labels).toContain('Bruto')
    expect(labels).not.toContain('Druida') // classe de aventureiro fora
    expect(labels.length).toBe(8) // as 8 classes de bestiário
  }, 30000)
})
