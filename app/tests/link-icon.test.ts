// @vitest-environment node
// #303: o ícone supercharged de um wikilink vem do registro central
// (tokens.emojis) pela faceta do doc-alvo (grupo → subcategoria → categoria),
// como o CSS supercharged da vault. Nada inventado no call-site.
import { describe, expect, it } from 'vitest'
import { linkIconForEntry } from '../src/markdown/link-icon'
import { tokens } from '../src/components/ficha/registry'
import type { IndexDocEntry } from '../src/data/types'

const entry = (e: Partial<IndexDocEntry>): IndexDocEntry =>
  ({ id: 'x', path: 'x', basename: 'X', type: null, subtype: null, grupo: null, kind: 'content', ...e }) as IndexDocEntry

describe('linkIconForEntry (#303)', () => {
  it('arma pelo grupo (cac-marcial → grupoArma)', () => {
    expect(linkIconForEntry(entry({ type: 'Item', subtype: 'Arma', grupo: 'cac-marcial' }))).toBe(
      tokens.emojis.grupoArma.CaCMarcial,
    )
  })

  it('subcategoria (Tesouro/Heroi) e categoria (Classe) via registro; acento normalizado', () => {
    expect(linkIconForEntry(entry({ type: 'Item', subtype: 'Tesouro' }))).toBe(tokens.emojis.subcategoria.Tesouro)
    expect(linkIconForEntry(entry({ type: 'Criatura', subtype: 'Heroi' }))).toBe(tokens.emojis.subcategoria.Heroi)
    expect(linkIconForEntry(entry({ type: 'Classe', subtype: 'Marcialista' }))).toBe(tokens.emojis.categoria.Classe)
    // "Técnica" (com acento) casa a chave ASCII "Tecnica"
    expect(linkIconForEntry(entry({ type: 'Técnica' }))).toBe(tokens.emojis.categoria.Tecnica)
  })

  it('tipo sem correspondência no registro → sem ícone', () => {
    expect(linkIconForEntry(entry({ type: 'Regra' }))).toBe('')
    expect(linkIconForEntry(undefined)).toBe('')
  })
})
