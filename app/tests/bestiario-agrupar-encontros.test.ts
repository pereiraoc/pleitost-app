// AGRUPAMENTO DO BESTIÁRIO + METADADO DO ENCONTRO (pedidos do mestre,
// 2026-09-12): ver o bestiário agrupado por Tier / Afiliação / Classe, ver a
// descrição breve do encontro na lista (e ao abrir), e poder agrupar os
// encontros pelo LOCAL onde acontecem.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import {
  chaveDoCriterio,
  gruposPorChave,
  gruposPorTier,
  SEM_AFILIACAO,
} from '../src/components/creatures/agrupar-bestiario'
import { locaisDoCombate, ondeDe, rosterComVelocidades, situacaoDe } from '../src/mestre/encontro-meta'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

const entry = (basename: string): IndexDocEntry =>
  ({ id: `c/${basename}`, path: '', basename, type: 'Criatura', subtype: 'Monstro', kind: 'content' }) as IndexDocEntry
const doc = (id: string, fm: Record<string, unknown>): VaultDoc =>
  ({ id, basename: id.split('/').pop(), frontmatter: fm }) as unknown as VaultDoc

describe('agrupar o bestiário', () => {
  // O fixture declara Tier porque a ORDEM agora é por tier (pedido do mestre,
  // 2026-09-12): tier crescente (0→3) nos grupos e dentro deles, alfabético
  // só no empate. Sem Tier vai pro fim.
  const entries = [
    'Agulha da Ordem',
    'Brigadiano Atirador',
    'Brigadiano de Esquina',
    'Cabo de Choque',
    'Rato',
  ].map(entry)
  const docs = new Map<string, VaultDoc>([
    ['c/Agulha da Ordem', doc('c/Agulha da Ordem', { Tier: 2, Classe: '[[Assassino|Assassino Competente]]', 'Afiliação': '[[A Caixinha]]' })],
    ['c/Brigadiano Atirador', doc('c/Brigadiano Atirador', { Tier: 1, Classe: '[[Soldado|Soldado]]', 'Afiliação': '[[Brigada Militar Metropolitana]]' })],
    ['c/Brigadiano de Esquina', doc('c/Brigadiano de Esquina', { Tier: 1, Classe: '[[Soldado|Soldado]]', 'Afiliação': '[[Brigada Militar Metropolitana]]' })],
    ['c/Cabo de Choque', doc('c/Cabo de Choque', { Tier: 0, Classe: '[[Soldado|Soldado Competente]]', 'Afiliação': '[[Brigada Militar Metropolitana]]' })],
    ['c/Rato', doc('c/Rato', { Classe: '[[Batedor|Batedor]]' })],
  ])

  it('a chave da classe é o ALVO do wikilink — Competente e comum no mesmo balde', () => {
    expect(chaveDoCriterio(docs.get('c/Cabo de Choque'), 'classe')).toBe('Soldado')
    expect(chaveDoCriterio(docs.get('c/Brigadiano de Esquina'), 'classe')).toBe('Soldado')
  })

  it('por afiliação: alfabético, e quem não declara fica no fim', () => {
    const grupos = gruposPorChave(entries, docs, 'afiliacao')
    expect(grupos.map((g) => g.letter)).toEqual(['A Caixinha', 'Brigada Militar Metropolitana', SEM_AFILIACAO])
  })

  it('por classe: um grupo por classe, alfabéticos', () => {
    const grupos = gruposPorChave(entries, docs, 'classe')
    expect(grupos.map((g) => g.letter)).toEqual(['Assassino', 'Batedor', 'Soldado'])
    expect(grupos[2]!.entries).toHaveLength(3)
  })

  it('dentro do grupo: tier crescente primeiro, alfabético só no empate', () => {
    const porAfiliacao = gruposPorChave(entries, docs, 'afiliacao')
    expect(porAfiliacao[1]!.entries.map((e) => e.basename)).toEqual([
      'Cabo de Choque', // Tier 0
      'Brigadiano Atirador', // Tier 1, empate resolvido no alfabético
      'Brigadiano de Esquina', // Tier 1
    ])
    const porClasse = gruposPorChave(entries, docs, 'classe')
    expect(porClasse[2]!.entries.map((e) => e.basename)).toEqual([
      'Cabo de Choque',
      'Brigadiano Atirador',
      'Brigadiano de Esquina',
    ])
  })

  it('por tier: grupos CRESCENTES (0→3) e quem não declara Tier no fim', () => {
    const grupos = gruposPorTier(entries, docs)
    expect(grupos.map((g) => g.letter)).toEqual(['0', '1', '2', '—'])
    expect(grupos.map((g) => g.tier)).toEqual([0, 1, 2, null])
    expect(grupos[1]!.entries.map((e) => e.basename)).toEqual([
      'Brigadiano Atirador',
      'Brigadiano de Esquina',
    ])
  })
})

describe('metadado do encontro', () => {
  const enc = doc('Campanhas/Combates/X', {
    Onde: '[[Lagoa do Pinheiro]] · [[Delta Radioativo]]',
    'Situação': 'Chefe de bicho na beira.',
  })
  const generico = doc('Campanhas/Combates/Y', { Onde: 'Genérico — qualquer bairro.', 'Situação': 'A patrulha vira operação.' })

  it('lê Onde e Situação do frontmatter (o corpo só exibe via dataview)', () => {
    expect(ondeDe(enc)).toContain('Lagoa do Pinheiro')
    expect(situacaoDe(enc)).toBe('Chefe de bicho na beira.')
  })

  it('os locais saem dos wikilinks do Onde; sem wikilink o encontro é genérico', () => {
    expect(locaisDoCombate(enc)).toEqual(['Lagoa do Pinheiro', 'Delta Radioativo'])
    expect(locaisDoCombate(generico)).toEqual([])
  })
})

describe('roster do encontro', () => {
  const fence = [
    '```combat-marker',
    '- 1 [[Sistema/Criaturas/Bestiário/Coronel Luciana Prado|Coronel Luciana Prado]] super rápido',
    '- 3 [[Cabo de Choque]] lento',
    '```',
  ].join('\n')

  it('carrega a velocidade declarada na nota (o parser herdado ignorava o sufixo)', () => {
    const { entries } = rosterComVelocidades(fence)
    expect(entries.map((e) => e.label)).toEqual(['Coronel Luciana Prado', 'Cabo de Choque'])
    expect(entries[0]!.speeds).toEqual(['super'])
    expect(entries[1]!.speeds).toEqual(['lento'])
    // o alvo qualificado por caminho vira sourcePath; o label é o alias
    expect(entries[0]!.sourcePath).toBe('Sistema/Criaturas/Bestiário/Coronel Luciana Prado')
  })
})

describe.skipIf(!temDataset)('sobre o dataset real da POA', () => {
  const manifest = temDataset
    ? (JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest)
    : null
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

  // Avulsos de rua por desenho: não respondem a organização nenhuma.
  const AVULSOS = new Set(['Agulha de Beco', 'Chefe de Esquina', 'Arruaceiro'])

  it('toda criatura declara Afiliação (menos os avulsos de rua)', () => {
    const sem = manifest!.docs
      .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
      .filter((d) => !String(ler(d.id).frontmatter?.['Afiliação'] ?? '').trim())
      .map((d) => d.basename!)
      .filter((n) => !AVULSOS.has(n))
    expect(sem).toEqual([])
  })

  it('todo encontro tem descrição breve e velocidade em cada linha do roster', () => {
    const erros: string[] = []
    for (const e of manifest!.docs.filter((d) => d.type === 'Combate' && d.basename)) {
      const d = ler(e.id)
      if (!situacaoDe(d)) erros.push(`${e.basename}: sem Situação`)
      if (!ondeDe(d)) erros.push(`${e.basename}: sem Onde`)
      for (const linha of String(d.body ?? '').split('\n')) {
        if (!/^- \d+ \[\[/.test(linha)) continue
        if (!/(super rápido|rápido|lento)\s*$/.test(linha)) erros.push(`${e.basename}: "${linha}" sem velocidade`)
      }
    }
    expect(erros).toEqual([])
  })

  it('todo encontro do dataset entrega roster com velocidade', () => {
    const erros: string[] = []
    for (const e of manifest!.docs.filter((d) => d.type === 'Combate' && d.basename)) {
      const { entries } = rosterComVelocidades(ler(e.id).body)
      if (!entries.length) { erros.push(`${e.basename}: roster vazio`); continue }
      for (const linha of entries) {
        if (!linha.speeds?.length) erros.push(`${e.basename}: ${linha.label} sem velocidade`)
      }
    }
    expect(erros).toEqual([])
  })

  it('os encontros cobrem vários bairros — dá pra agrupar por local', () => {
    const combates = manifest!.docs.filter((d) => d.type === 'Combate')
    const locais = new Set(combates.flatMap((d) => locaisDoCombate(ler(d.id))))
    expect(locais.size).toBeGreaterThan(15)
  })
})
