// Comércio por BAIRRO no POA 1987 (aprovado 2026-08-31): os bairros carregam
// a MESMA régua canônica da fantasia via FM `Comércio:` (a subcategoria deles
// é "Bairro", que não projeta tipo) — Mercado Público = Iluminada (o "acha
// tudo" da cidade), Moinhos/Petrópolis/Centro = Capital, periferia = Pequena
// Cidade; Zona Deserta segue sem comércio. Valida sobre o DATASET REAL
// (skip se não extraído) + a projeção unitária.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localTypeOfDoc } from '../src/data/commerce'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cybDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')

describe('localTypeOfDoc: subcategoria OU FM Comércio', () => {
  it('fantasia (subcategoria) segue igual; FM cobre os bairros; lixo = null', () => {
    expect(localTypeOfDoc({ subtype: 'Capital', frontmatter: {} })).toBe('Capital')
    expect(localTypeOfDoc({ subtype: 'Bairro', frontmatter: { 'Comércio': 'Iluminada' } })).toBe('Iluminada')
    expect(localTypeOfDoc({ subtype: 'Bairro', frontmatter: { 'Comércio': 'Grande Cidade' } })).toBe('Grande Cidade')
    expect(localTypeOfDoc({ subtype: 'Bairro', frontmatter: {} })).toBe(null)
    expect(localTypeOfDoc({ subtype: 'Bairro', frontmatter: { 'Comércio': 'Mega' } })).toBe(null)
  })
})

describe.skipIf(!fs.existsSync(path.join(cybDir, 'index.json')))('régua real dos bairros (dataset POA)', () => {
  const doc = (rel: string) => JSON.parse(fs.readFileSync(path.join(cybDir, `Atlas/Porto Alegre/${rel}.json`), 'utf8'))

  it('Mercado Público = Iluminada; Capitais e periferia conforme aprovado', () => {
    expect(localTypeOfDoc(doc('Centro Histórico/Mercado Público'))).toBe('Iluminada')
    expect(localTypeOfDoc(doc('Moinhos de Vento/Moinhos de Vento'))).toBe('Capital')
    expect(localTypeOfDoc(doc('Petrópolis/Petrópolis'))).toBe('Capital')
    expect(localTypeOfDoc(doc('Restinga/Restinga'))).toBe('Pequena Cidade')
    expect(localTypeOfDoc(doc('Zona Deserta/Zona Deserta'))).toBe(null)
  })

  it('Recursos públicos chegam no dataset (estoque típico da loja)', () => {
    const moinhos = doc('Moinhos de Vento/Moinhos de Vento')
    expect(moinhos.frontmatter['Recursos']).toContain('[[Foco da Intensificação]]')
    const mercado = doc('Centro Histórico/Mercado Público')
    expect(mercado.frontmatter['Recursos']).toContain('[[Poção de Cura]]')
  })
})
