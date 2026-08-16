// @vitest-environment node
// FICHA DE PAPEL (export #452) — montarDadosPapel sobre o FM DERIVADO real do
// Carlos (fixture congelada + docs da database), validando os números que o
// mock aprovado imprimia.
import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { baseDoItem, montarDadosPapel, type DadosPapel } from '../src/print/dados-papel'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const fixture = (rel: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes', rel), 'utf8')) as VaultDoc

let dd: DadosPapel
beforeAll(async () => {
  const carlos = fixture('Carlos Facão de Andradas.json')
  const { projection } = await projectHeroRules(
    carlos.frontmatter as Record<string, unknown>,
    catalog,
    async (id) => load(id),
  )
  const docDe = (nome: string): VaultDoc | undefined => {
    const r = catalog.resolve(baseDoItem(nome))
    return r.kind === 'doc' ? load(r.id) : undefined
  }
  dd = montarDadosPapel(projection.derivedFm as Record<string, unknown>, docDe, ['Caído'], ['Poção de Cura'])
})

describe('montarDadosPapel — Carlos (números do mock aprovado)', () => {
  it('vida: Moral 48 / Vitalidade 24; movimento 6q', () => {
    expect(dd.moral).toBe(48)
    expect(dd.vitalidade).toBe(24)
    expect(dd.movimento).toBe(6)
  })
  it('ataques: Punhal +10 com dano 2d4+2 (tier Experiente) e Desarmado presente', () => {
    const punhal = dd.ataques.find((a) => a.nome === 'Punhal')!
    expect(punhal.mod).toBe('+10')
    expect(punhal.dano).toContain('2d4+2')
    expect(dd.ataques.some((a) => a.nome === 'Ataque Desarmado')).toBe(true)
    expect(dd.manobrasMod).toBe(6)
  })
  it('perícias: Anima com B.ITEM +2; mod soma tudo', () => {
    const anima = dd.pericias.find((p) => p.nome === 'Anima')!
    expect(anima.item).toBe(2)
    const diplo = dd.pericias.find((p) => p.nome === 'Diplomacia')!
    expect(diplo.mod).toBe(8) // PRE3 + E4 + item1
  })
  it('ofícios com CONHECIMENTO rotulado certo (bug v7)', () => {
    expect(dd.oficios.map((o) => o.rotulo)).toContain('CONHECIMENTO')
    expect(dd.oficios.map((o) => o.rotulo)).not.toContain('ATUAÇÃO — errado')
  })
  it('atributos ordenados por valor (3·2·1·0): PRE, AGI, INT, FOR', () => {
    expect(dd.atributos.map((a) => a.sigla)).toEqual(['PRE', 'AGI', 'INT', 'FOR'])
  })
  it('magias agrupadas por rank com resumo inteiro', () => {
    const branca = dd.escolas.find((e) => e.nome === 'Arcana Branca')!
    expect(branca.grupos[0]!.rank).toBe('BÁSICAS')
    const avivar = branca.grupos.flatMap((g) => g.magias).find((m) => m.nome === 'Avivar')!
    expect(avivar.resumo.length).toBeGreaterThan(40)
    // report 2026-08-16: RESUMO de verdade — nada de parágrafo inteiro gigante
    for (const it of [...dd.habilidades, ...dd.tecnicas]) {
      expect(it.resumo.length).toBeLessThanOrEqual(300)
    }
  })
  it('tesouros: mais caros primeiro e USOS numéricos viram bolinhas', () => {
    const nomes = dd.inventario.tesouros.map((t) => t.nome)
    expect(nomes[0]).toContain('Experiente') // Mestre não há; Experiente vem antes dos Adeptos
    const ampli = dd.inventario.tesouros.find((t) => t.nome.startsWith('Amplificador'))!
    expect(ampli.usos).toBe(1) // usos.experiente = '1/10min'
  })
  it('IMPLEMENTOS separados dos tesouros, com CARGAS em bolinhas (2026-08-16)', () => {
    const nomes = dd.inventario.implementos.map((t) => t.nome)
    expect(nomes.some((n) => n.startsWith('Foco da Repetição'))).toBe(true)
    expect(dd.inventario.tesouros.some((t) => t.nome.startsWith('Foco'))).toBe(false)
    const rep = dd.inventario.implementos.find((t) => t.nome.startsWith('Foco da Repetição'))!
    expect(rep.usos).toBe(4) // cargas.adepto = 4
  })
  it('arma com imbuição marca os USOS da imbuição no tier da arma', () => {
    const punhal = dd.inventario.armas.find((a) => a.nome === 'Punhal')!
    expect(punhal.usos).toBe(1) // Relampejante usos.experiente = '1/10min'
  })
  it('perícias carregam a especialidade/maestria escolhida (colunas da tabela)', () => {
    const acro = dd.pericias.find((p) => p.nome === 'Acrobacia')!
    expect(acro.especialidade).toBe('Estabilidade')
    const atl = dd.pericias.find((p) => p.nome === 'Atletismo')!
    expect(atl.especialidade).toBe('')
  })
  it('habilidades sem o pai da escolha duplicado', () => {
    const nomes = dd.habilidades.map((h) => h.nome)
    expect(nomes).toContain('Método Artístico (Inspirador)')
    expect(nomes).not.toContain('Método Artístico')
  })
})
