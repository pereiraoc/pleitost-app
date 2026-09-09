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
    expect(r.manutencao).toBe(3000) // posse paga por mês (v3)
    expect(r.nivel).toBe(5)
    expect(r.onde).toContain("Passo D'Areia")
  })
})

/* Guarda de DADOS (2026-09-08): o nível 1 dos recursos é o rótulo "Sem Plano
 * Mensal", que descreve a AUSÊNCIA de mensalidade — não uma faixa de produto.
 * Não existe veículo, moradia ou comida "de Sem Plano Mensal": item começa em
 * Classe Baixa. Só os três planos (e o crédito que atende quem não tem plano
 * nenhum) ficam no nível 1. Varre o dataset real. */
describe('nível 1 é só dos planos e do crédito de porta aberta', () => {
  it('nenhum item comprável ou consumível está no nível 1', () => {
    const raiz = path.join(cyberDir, 'Contexto/Recursos')
    if (!fs.existsSync(raiz)) return
    const arquivos: string[] = []
    const anda = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) anda(p)
        else if (e.name.endsWith('.json')) arquivos.push(p)
      }
    }
    anda(raiz)
    expect(arquivos.length).toBeGreaterThan(100)
    const nivel1: string[] = []
    for (const f of arquivos) {
      const doc = JSON.parse(fs.readFileSync(f, 'utf8')) as VaultDoc
      const r = parseRecurso(doc)
      if (r?.nivel === 1 && r.tipo !== 'Estilo de Vida' && r.tipo !== 'Empréstimo') nivel1.push(`${r.tipo}: ${r.nome}`)
    }
    expect(nivel1).toEqual([])
  })
})
