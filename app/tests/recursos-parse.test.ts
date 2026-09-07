// Parser de nota de Recurso: FM → Recurso (inteiros, wikilinks de Onde,
// campos opcionais). Oráculo = nota REAL do dataset da POA quando extraído.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inteiro, linkTarget, parseRecurso } from '../src/recursos/parse-recurso'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')

function doc(p: Partial<VaultDoc>): VaultDoc {
  return {
    id: 'Contexto/Recursos/Transporte/X',
    path: 'Contexto/Recursos/Transporte/X.md',
    basename: 'X',
    type: 'Recurso',
    subtype: 'Transporte',
    kind: 'content',
    frontmatter: {},
    body: '',
    images: [],
    ...p,
  } as unknown as VaultDoc
}

describe('parseRecurso', () => {
  it('lê os campos do FM; Onde vira alvo de wikilink; opcionais ausentes ficam undefined', () => {
    const r = parseRecurso(
      doc({
        frontmatter: {
          categoria: 'Recurso',
          subcategoria: 'Transporte',
          Tipo: 'Veículo',
          Marca: '[[Gurgel]]',
          Preço: 400000,
          Cobrança: 'única',
          Usado: 150000,
          Manutenção: 3000,
          Onde: ["[[Passo D'Areia]]", '[[Camelódromo|o Camelô]]'],
          Resumo: 'O carro de fibra da cidade.',
        },
      }),
    )!
    expect(r).toMatchObject({
      nome: 'X',
      aba: 'Transporte',
      tipo: 'Veículo',
      marca: '[[Gurgel]]',
      preco: 400000,
      cobranca: 'única',
      usado: 150000,
      manutencao: 3000,
      onde: ["Passo D'Areia", 'Camelódromo'],
      resumo: 'O carro de fibra da cidade.',
    })
    expect(r.compra).toBeUndefined()
    expect(r.nivel).toBeUndefined()
  })
  it('sem Preço inteiro, Tipo ou aba → null; não-Recurso → null', () => {
    expect(parseRecurso(doc({ frontmatter: { Tipo: 'X', Preço: 12.5 } }))).toBeNull()
    expect(parseRecurso(doc({ frontmatter: { Preço: 10 } }))).toBeNull()
    expect(parseRecurso(doc({ type: 'Pessoa', frontmatter: { Tipo: 'X', Preço: 10 } }))).toBeNull()
    expect(inteiro('12')).toBe(12)
    expect(inteiro(-1)).toBeUndefined()
    expect(linkTarget('[[A|b]]')).toBe('A')
    expect(linkTarget('Caloi')).toBe('Caloi')
  })
  it('nota real da POA (Gurgel Carajás) quando o dataset está extraído', () => {
    const f = path.join(cyberDir, 'Contexto/Recursos/Transporte/Gurgel Carajás.json')
    if (!fs.existsSync(f)) return
    const r = parseRecurso(JSON.parse(fs.readFileSync(f, 'utf8')) as VaultDoc)!
    expect(r.aba).toBe('Transporte')
    expect(r.tipo).toBe('Veículo')
    expect(r.preco).toBe(400000)
    expect(r.usado).toBe(150000)
    expect(r.manutencao).toBeUndefined() // v2: manutenção vive no estilo de vida de transporte
    expect(r.nivel).toBe(5)
    expect(r.onde).toContain("Passo D'Areia")
  })
})
