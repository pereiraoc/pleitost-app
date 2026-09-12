// Pedido do mestre (2026-09-12): "se estiver em modo mestre, ter a aba de
// bestiário no local" — a mesma ideia da aba Serviços, mas listando as
// criaturas que podem ser encontradas ali. A criatura declara onde aparece
// (FM `Bairros`); o lugar herda do ANCESTRAL: um ponto de interesse mostra o
// bestiário do bairro dele, e o que vale pra cidade inteira aparece em todos.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criaturasEm, escoposDoLugar } from '../src/mestre/bestiario-local'
import type { IndexDocEntry, IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

const criatura = (basename: string, bairros: string[]): IndexDocEntry =>
  ({ id: `Sistema/Criaturas/Bestiário/${basename}`, path: '', basename, type: 'Criatura', subtype: 'Monstro', kind: 'content', bairros }) as IndexDocEntry

describe('escopos de um lugar', () => {
  it('é o próprio lugar mais a cadeia de ancestrais, do mais perto ao mais longe', () => {
    expect(escoposDoLugar('Teatro Quarto Distrito', ['Porto Alegre', 'Quarto Distrito']))
      .toEqual(['Teatro Quarto Distrito', 'Quarto Distrito', 'Porto Alegre'])
  })
  it('a cidade sozinha é o próprio escopo', () => {
    expect(escoposDoLugar('Porto Alegre', [])).toEqual(['Porto Alegre'])
  })
})

describe('criaturas de um lugar', () => {
  const todas = [
    criatura('Agulha da Ordem', ['Quarto Distrito']),
    criatura('Brigadiano de Esquina', ['Porto Alegre']),
    criatura('Barqueiro Armado', ['Cidade Baixa', 'Lago Guaíba']),
    criatura('Sem Bairro', []),
  ]

  it('pega a do bairro, a da cidade inteira, e ignora as de outro bairro', () => {
    const achadas = criaturasEm(todas, ['Teatro Quarto Distrito', 'Quarto Distrito', 'Porto Alegre'])
    expect(achadas.map((c) => c.basename)).toEqual(['Agulha da Ordem', 'Brigadiano de Esquina'])
  })

  it('num bairro sem criatura própria sobra só o que vale pra cidade', () => {
    expect(criaturasEm(todas, ['Ipanema', 'Porto Alegre']).map((c) => c.basename))
      .toEqual(['Brigadiano de Esquina'])
  })

  it('lugar fora da cidade não lista nada', () => {
    expect(criaturasEm(todas, ['Outro Mundo'])).toEqual([])
  })
})

describe.skipIf(!temDataset)('sobre o dataset real da POA', () => {
  const manifest = temDataset
    ? (JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest)
    : null

  it('todo bairro do Atlas tem pelo menos uma criatura possível', () => {
    const criaturas = manifest!.docs.filter((d) => d.type === 'Criatura')
    const bairros = manifest!.docs.filter((d) => d.subtype === 'Bairro' && d.basename)
    expect(bairros.length).toBeGreaterThan(10)
    const vazios = bairros
      .filter((b) => criaturasEm(criaturas, [b.basename!, 'Porto Alegre']).length === 0)
      .map((b) => b.basename)
    expect(vazios).toEqual([])
  })

  it('as criaturas do Quarto Distrito incluem a Agulha da Ordem', () => {
    const criaturas = manifest!.docs.filter((d) => d.type === 'Criatura')
    const nomes = criaturasEm(criaturas, ['Quarto Distrito', 'Porto Alegre']).map((c) => c.basename)
    expect(nomes).toContain('Agulha da Ordem')
    expect(nomes).toContain('Brigadiano de Esquina') // vale pra cidade toda
    expect(nomes).not.toContain('Barqueiro Armado') // é da Cidade Baixa
  })
})
