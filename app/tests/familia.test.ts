// FAMÍLIA DA FICHA (issue #201) — o módulo central que porta o delta
// CompanheiroAnimal↔Heroi do plugin (types/family.ts + family-compat.ts +
// family-pericias.ts + tabs/ca/tab-completa.ts). Valida a resolução de
// família sobre o doc REAL do Metis (vault-data) e os flags que as abas leem.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CA_PERICIAS,
  CA_TESOUROS_PERMITIDOS,
  FICHA_FAMILIA,
  abaFichaVisivel,
  familiaOf,
  familiaTemPericia,
  fichaFamiliaOf,
  resolveFamily,
  resolveFamilyFromFrontmatter,
  resolveFamilyFromPath,
} from '../src/data/familia'
import { slugify } from '../src/components/ficha/registry'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const readDoc = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const metis = readDoc('Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim')
const mera = readDoc('Sistema/Criaturas/Heróis/Mera')

describe('resolveFamily (espelho de family-compat.ts do plugin)', () => {
  it('subcategoria decide: Metis → CompanheiroAnimal, Mera → Heroi', () => {
    expect(familiaOf(metis)).toBe('CompanheiroAnimal')
    expect(familiaOf(mera)).toBe('Heroi')
  })

  it('shim legado "Jogador" → Heroi', () => {
    expect(resolveFamilyFromFrontmatter({ subcategoria: 'Jogador' })).toBe('Heroi')
  })

  it('fallback por path quando o FM não decide', () => {
    expect(resolveFamilyFromPath('Sistema/Criaturas/Companheiros Animais/X.md')).toBe(
      'CompanheiroAnimal',
    )
    expect(resolveFamilyFromPath('Sistema/Criaturas/Heróis/X.md')).toBe('Heroi')
    expect(resolveFamily({}, 'Solta/X.md')).toBe('Heroi') // default do plugin
  })
})

describe('perícias por família (family-pericias.ts do plugin)', () => {
  it('CA tem SÓ as 6 da whitelist — via slug NFD dos nomes do FM', () => {
    const nomes = ['Atletismo', 'Acrobacia', 'Furtividade', 'Sobrevivência', 'Enganação', 'Intimidação']
    for (const nome of nomes) expect(familiaTemPericia('CompanheiroAnimal', slugify(nome))).toBe(true)
    for (const nome of ['Ladinagem', 'Arcana', 'Sociedades', 'Guerra', 'Medicina', 'Anima', 'Diplomacia'])
      expect(familiaTemPericia('CompanheiroAnimal', slugify(nome))).toBe(false)
    expect(CA_PERICIAS).toHaveLength(6)
  })

  it('Heroi tem todas', () => {
    expect(familiaTemPericia('Heroi', slugify('Ladinagem'))).toBe(true)
  })
})

describe('flags da ficha por família (delta do tabs/ca/tab-completa.ts)', () => {
  it('CA esconde o que o plugin esconde e mostra o Tutor', () => {
    const ca = fichaFamiliaOf(metis)
    expect(ca.tutor).toBe(true)
    expect(ca.nivelDoTutor).toBe(true)
    for (const key of [
      'biografia',
      'experiencia',
      'anotacoes',
      'oficios',
      'especializacoes',
      'tecnicas',
      'magias',
      'equipamentos',
      'moedas',
      'consumiveis',
    ] as const)
      expect(ca[key], key).toBe(false)
    expect(ca.pericias).toBe(CA_PERICIAS)
    expect(ca.tesourosPermitidos).toBe(CA_TESOUROS_PERMITIDOS)
  })

  it('Heroi mantém a ficha cheia, sem Tutor', () => {
    const heroi = fichaFamiliaOf(mera)
    expect(heroi.tutor).toBe(false)
    expect(heroi.magias).toBe(true)
    expect(heroi.pericias).toBeNull()
  })

  it('abaFichaVisivel: anotacoes some pro CA (único gate — AppShell e FichaPage)', () => {
    expect(abaFichaVisivel('CompanheiroAnimal', 'anotacoes')).toBe(false)
    expect(abaFichaVisivel('CompanheiroAnimal', 'perfil')).toBe(true)
    expect(abaFichaVisivel('Heroi', 'anotacoes')).toBe(true)
  })

  it('tesouros permitidos do CA — verbatim do plugin (3 itens)', () => {
    expect([...(FICHA_FAMILIA.CompanheiroAnimal.tesourosPermitidos ?? [])].sort()).toEqual([
      'Anel da Resistência',
      'Anel do Equilíbrio',
      'Pulseira da Potência',
    ])
  })
})
