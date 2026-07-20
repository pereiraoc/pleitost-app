// COMÉRCIO — buildShopCandidates (issue #93): catálogo → candidatos. Usa docs
// REAIS da vault (Canto Alto Recursos, Adaga, imbuições típica/incomum, tesouro
// típico/básico, obra-primas, poção). Classificação típico/incomum + combos.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { buildShopCandidates, imbuicaoAdjetivo } from '../src/data/commerce-candidates'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name} (${r.kind})`)
  return readDoc(r.id)
}

const cantoAlto = readDoc('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
const recursos = (cantoAlto.frontmatter['Recursos'] as string[]).filter((r) => typeof r === 'string')

describe('imbuicaoAdjetivo', () => {
  it('tira o prefixo "Imbuição"', () => {
    expect(imbuicaoAdjetivo('Imbuição Relampejante')).toBe('Relampejante')
    expect(imbuicaoAdjetivo('Imbuição da Ventania')).toBe('da Ventania')
    expect(imbuicaoAdjetivo('Imbuição de Aço Solar')).toBe('de Aço Solar')
  })
})

describe('buildShopCandidates (Canto Alto real)', () => {
  const built = buildShopCandidates({
    recursos,
    tesourosSimples: [byName('Anel Canário'), byName('Bracelete Elemental')],
    imbuicoes: [
      byName('Imbuição Relampejante'), // ∈ Recursos + cabe na Adaga (tem [[Arremesso]])
      byName('Imbuição Flamejante'), // ∉ Recursos + NÃO cabe na Adaga (perfuração ≠ corte)
      byName('Imbuição Enraizante'), // ∉ Recursos MAS cabe na Adaga (Tipo,perfuração)
    ],
    armas: [byName('Adaga'), byName('Espada Longa')], // Adaga típica; Espada Longa incomum (∉ Recursos)
    armaduras: [byName('Armadura Leve'), byName('Armadura Pesada')], // Leve ∈ Recursos; Pesada não
    escudos: [byName('Broquel'), byName('Escudo')], // Broquel ∈ Recursos; Escudo não
    qualidades: [
      byName('Arma Obra-prima'),
      byName('Armadura Obra-prima'),
      byName('Broquel Obra-prima'),
      byName('Escudo Obra-prima'),
    ],
    pocoes: [byName('Poção de Cura')],
  })
  const find = (label: string) => built.candidates.find((c) => c.label === label)

  it('combo arma×imbuição TÍPICA (Relampejante ∈ Recursos) → "Adaga Relampejante" ×1', () => {
    const c = find('Adaga Relampejante')!
    expect(c).toBeTruthy()
    expect(c.mult).toBe(1)
    expect(c.armaTarget).toContain('Adaga')
    expect(c.propriedadeBase).toBe('Imbuição Relampejante')
    expect(c.precoBase).toBeGreaterThan(0) // preço da imbuição
  })

  it('combo com imbuição INCOMUM COMPATÍVEL (Enraizante ∉ Recursos, Tipo,perfuração) → ×¼', () => {
    expect(find('Adaga Enraizante')!.mult).toBe(0.25)
  })

  it('#288: imbuição INCOMPATÍVEL com a arma NÃO vira combo (Flamejante corte ≠ Adaga perfuração)', () => {
    // Antes toda arma × toda imbuição virava carta, oferecendo combos que o sistema
    // proíbe. O AplicavelA (Subcategoria,Arma Grupo,cac-* Tipo,corte) exclui a Adaga.
    expect(find('Adaga Flamejante')).toBeUndefined()
  })

  it('arma típica + Obra-prima (básico) → "Adaga Obra-prima" ×2, selo cheio', () => {
    const c = find('Adaga Obra-prima')!
    expect(c.mult).toBe(2)
    expect(c.propriedadeBase).toBe('Arma Obra-prima')
  })

  it('#341 arma INCOMUM (Espada Longa ∉ Recursos) É oferecida — Obra-prima básico-incomum ×½', () => {
    // Antes armas fora dos Recursos SUMIAM da loja (o caso do Lilá). A nota
    // Disponibilidade de Tesouros prevê a arma incomum com % reduzido: aqui a
    // Obra-prima (básico) da Espada Longa entra como básico-incomum ×½.
    const c = find('Espada Longa Obra-prima')!
    expect(c, 'arma incomum deve virar candidato').toBeTruthy()
    expect(c.mult).toBe(0.5)
  })

  it('tesouro TÍPICO (Anel Canário ∈ Recursos) ×1; BÁSICO incomum (Bracelete) ×½', () => {
    expect(find('Anel Canário')!.mult).toBe(1)
    expect(find('Anel Canário')!.precoBase).toBe(40)
    expect(find('Bracelete Elemental')!.mult).toBe(0.5) // básico, fora dos Recursos
  })

  it('armadura TÍPICA dos Recursos ("Armadura Obra-prima|Armadura Leve") → básico-típico ×2', () => {
    const c = find('Armadura Leve Obra-prima')!
    expect(c).toBeTruthy()
    expect(c.mult).toBe(2)
    expect(c.propriedadeBase).toBe('Armadura Obra-prima')
  })

  it('#341/user: armadura INCOMUM (Armadura Pesada ∉ Recursos) É oferecida — básico-incomum ×½', () => {
    // Antes só entravam as obra-primas listadas nos Recursos → armaduras fora deles
    // sumiam em qualquer cidade. Agora TODA base entra: Pesada é básico-incomum ×½.
    const c = find('Armadura Pesada Obra-prima')!
    expect(c, 'armadura fora dos Recursos deve virar candidato').toBeTruthy()
    expect(c.mult).toBe(0.5)
    expect(c.propriedadeBase).toBe('Armadura Obra-prima')
  })

  it('escudo NÃO é básico: Broquel TÍPICO ×1, Escudo INCOMUM ×¼', () => {
    // Broquel ∈ Recursos → típico ×1; Escudo ∉ Recursos → incomum ×¼ (não básico:
    // Broquel/Escudo Obra-prima estão fora da lista de básicos da nota).
    expect(find('Broquel Obra-prima')!.mult).toBe(1)
    expect(find('Broquel Obra-prima')!.propriedadeBase).toBe('Broquel Obra-prima')
    expect(find('Escudo Obra-prima')!.mult).toBe(0.25)
    expect(find('Escudo Obra-prima')!.propriedadeBase).toBe('Escudo Obra-prima')
  })

  it('bases PURAS (sem obra-prima) nunca viram candidato — só as combinações', () => {
    // Armas/armaduras/escudos base não são vendáveis; só imbuição/obra-prima.
    expect(find('Armadura Pesada')).toBeUndefined()
    expect(find('Escudo')).toBeUndefined()
    expect(find('Espada Longa')).toBeUndefined()
  })

  it('poções viram PocaoCandidate à parte', () => {
    expect(built.pocoes.map((p) => p.nome)).toContain('Poção de Cura')
    expect(built.pocoes[0].precoBase).toBe(10)
  })
})
