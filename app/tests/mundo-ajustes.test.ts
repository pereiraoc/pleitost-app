// #544 — ajustes de REGRA do mundo (Contexto-Def `regras`): Empregado sempre
// Médio (alias sem token de tamanho) e sem armas naturais (filtro por grupo
// `natural` do índice). #538 — descricoes: corpo do mundo por nota no
// contexto.json real (os 4 Traços). Fantasia sem os blocos = intocada.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aliasSemTamanho, aplicarRegrasDoMundo } from '../src/rules/mundo-ajustes'
import { setActiveContexto, reskinDescricao } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { Catalog } from '../src/data/catalog'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const defPoa = fs.existsSync(cybContexto)
  ? (JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef)
  : null

afterEach(() => setActiveContexto(null))

const catalogFake = {
  resolve: (t: string) =>
    t === 'Mandíbula' || t === 'Garras' ? { kind: 'doc', id: `Armas/${t}` } : { kind: 'missing' },
  entryById: new Map([
    ['Armas/Mandíbula', { id: 'Armas/Mandíbula', grupo: 'natural' }],
    ['Armas/Garras', { id: 'Armas/Garras', grupo: 'natural' }],
  ]),
} as unknown as Catalog

describe('aliasSemTamanho', () => {
  it('remove só o token de tamanho do label; target intocado', () => {
    expect(aliasSemTamanho('[[Caçador|Segurança Médio]]')).toBe('[[Caçador|Segurança]]')
    expect(aliasSemTamanho('[[Caçador|Canino Pequeno]]')).toBe('[[Caçador|Canino]]')
    expect(aliasSemTamanho('[[Caçador|Segurança]]')).toBe('[[Caçador|Segurança]]')
    expect(aliasSemTamanho('[[Caçador]]')).toBe('[[Caçador]]')
  })
})

describe.skipIf(!defPoa)('aplicarRegrasDoMundo com o def REAL do POA', () => {
  it('CA: Tamanho fixo Médio, alias sem tamanho, ataques naturais fora', () => {
    setActiveContexto(defPoa)
    const fm: Record<string, unknown> = {
      subcategoria: 'Companheiro Animal',
      Tamanho: 'Pequeno',
      Classe: '[[Companheiro Animal Canino|Canino Pequeno]]',
      Ataques: { Lista: [{ '[[Mandíbula]]': 'Regra.[[X]]' }, { '[[Ataque Desarmado]]': 'Base' }] },
    }
    aplicarRegrasDoMundo(fm, catalogFake)
    expect(fm['Tamanho']).toBe('Médio')
    expect(fm['Classe']).toBe('[[Companheiro Animal Canino|Canino]]')
    const lista = (fm['Ataques'] as { Lista: unknown[] }).Lista
    expect(lista).toEqual([{ '[[Ataque Desarmado]]': 'Base' }])
  })

  it('#544: arma do Empregado no def real — só cac-simples, 1 mão, Força ≤ 2', () => {
    expect(defPoa!.regras?.companheiroAnimal?.arma).toEqual({
      grupos: ['cac-simples'],
      maos: 1,
      forcaMax: 2,
    })
  })

  it('herói comum passa reto (só família CA)', () => {
    setActiveContexto(defPoa)
    const fm: Record<string, unknown> = {
      subcategoria: 'Heroi',
      Tamanho: 'Pequeno',
      Ataques: { Lista: [{ '[[Mandíbula]]': 'Regra.[[X]]' }] },
    }
    aplicarRegrasDoMundo(fm, catalogFake)
    expect(fm['Tamanho']).toBe('Pequeno')
    expect((fm['Ataques'] as { Lista: unknown[] }).Lista.length).toBe(1)
  })

  it('#538: os 4 Traços têm corpo do mundo no def real', () => {
    setActiveContexto(defPoa)
    for (const t of ['do Fogo', 'da Terra', 'do Vento', 'da Água']) {
      const corpo = reskinDescricao(`Traço Elemental ${t}`)
      expect(corpo, t).toBeTruthy()
      expect(corpo!).toContain('Fator')
      expect(corpo!).toContain('dataview') // o fence sobrevive no texto
    }
  })

  it('#538: todo Item RENOMEADO do Sistema tem corpo do mundo (redação 2026-08-31)', () => {
    const cybIdx = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'index.json')
    const idx = JSON.parse(fs.readFileSync(cybIdx, 'utf8')) as {
      docs: { id: string; kind: string; basename?: string; type?: string | null }[]
    }
    const notas = defPoa!.reskin.notas
    const desc = defPoa!.reskin.descricoes ?? {}
    const fora = new Set(defPoa!.disponibilidade.indisponiveis)
    const sem = idx.docs
      .filter(
        (d) =>
          d.kind === 'content' &&
          d.type === 'Item' &&
          d.basename &&
          d.id.startsWith('Sistema/') &&
          notas[d.basename] &&
          !fora.has(d.basename),
      )
      .filter((d) => !desc[d.basename!])
      .map((d) => d.basename)
    expect(sem).toEqual([])
  })

  it('fantasia (sem contexto): nada muda', () => {
    const fm: Record<string, unknown> = {
      subcategoria: 'Companheiro Animal',
      Tamanho: 'Pequeno',
    }
    aplicarRegrasDoMundo(fm, catalogFake)
    expect(fm['Tamanho']).toBe('Pequeno')
    expect(reskinDescricao('Traço Elemental do Fogo')).toBeNull()
  })
})
