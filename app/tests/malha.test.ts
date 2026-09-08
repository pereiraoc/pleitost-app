// MALHA (2026-09-08): modelo puro do mapa esquemático — traçado octilinear que
// não atravessa parada alheia, arestas compartilhadas viram traços paralelos,
// baldeação = parada com ≥ 2 linhas visíveis, filtro por nível do plano.
import { describe, expect, it } from 'vitest'
import type { VaultDoc } from '../src/data/types'
import { caminhoDaLinha, desenharMalha, linhasDoNivel, montarMalha, paradasComBaldeacao, tracarPasso, type TransporteCfg } from '../src/transporte/malha'

const cfg: TransporteCfg = {
  categoria: 'Linha',
  mapa: 'Malha',
  modos: [
    { nome: 'Aeromóvel', traco: 'cheio', largura: 7 },
    { nome: 'Kombi', traco: 'pontilhado', largura: 3 },
  ],
}
function doc(basename: string, type: string, fm: Record<string, unknown>, extra: Partial<VaultDoc> = {}): VaultDoc {
  return { id: `x/${basename}`, path: `x/${basename}.md`, basename, type, subtype: String(fm.subcategoria ?? ''), grupo: null, frontmatter: fm, inlineFields: {}, ruleElements: [], links: [], images: [], headings: [], body: '', ...extra } as unknown as VaultDoc
}
const mapa = doc('Malha', 'Contexto', {}, {
  malha: { paradas: [
    { nome: 'A', x: 0, y: 0, rotulo: 'esquerda' }, { nome: 'B', x: 2, y: 0 }, { nome: 'C', x: 2, y: 2, rotulo: 'inclinado' }, { nome: 'D', x: 1, y: 1 }, { nome: 'E', x: 3, y: 0 },
  ] },
})
const l1 = doc('L1', 'Linha', { subcategoria: 'Aeromóvel', Acesso: '[[TRI Popular]]', Cor: '#1f5fbf', Paradas: ['[[A]]', '[[B]]', '[[C]]'] })
const kombi = doc('KOMBI', 'Linha', { subcategoria: 'Kombi', Acesso: 'dinheiro na mão', Cor: '#f4a261', Paradas: ['[[A]]', '[[B]]', '[[E]]'] })
const vip = doc('VIP', 'Linha', { subcategoria: 'Lotação', Acesso: '[[TRI Integrado]]', Paradas: ['[[B]]', '[[C]]'] })
const ramal = doc('RAMAL', 'Linha', { subcategoria: 'Aeromóvel', Acesso: 'só o Exército', Fechada: true, Paradas: ['[[A]]', '[[C]]'] })
const nivel = (n: string) => (n === 'TRI Popular' ? 3 : n === 'TRI Integrado' ? 4 : null)

describe('tracarPasso', () => {
  it('reta e diagonal puras não têm intermediários além da grade; desvia de parada alheia', () => {
    expect(tracarPasso({ x: 0, y: 0 }, { x: 3, y: 0 }, new Set()).pontos).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }])
    expect(tracarPasso({ x: 0, y: 0 }, { x: 2, y: 2 }, new Set()).pontos).toEqual([{ x: 1, y: 1 }])
    // (0,0)→(2,1): diagonal-primeiro passa por (1,1); ocupada → reta-primeiro (1,0)
    const r = tracarPasso({ x: 0, y: 0 }, { x: 2, y: 1 }, new Set(['1,1']))
    expect(r).toEqual({ pontos: [{ x: 1, y: 0 }], conflito: false })
    // sem saída: conflito marcado, traça mesmo assim
    expect(tracarPasso({ x: 0, y: 0 }, { x: 2, y: 1 }, new Set(['1,1', '1,0'])).conflito).toBe(true)
  })
})

describe('montarMalha + desenho', () => {
  const malha = montarMalha([mapa, l1, kombi, vip, ramal], cfg, nivel)
  it('lê cor, modo (traço/largura da config), nível do plano ou na mão, fechada; paradas com suas linhas', () => {
    const L1 = malha.linhas.find((l) => l.nome === 'L1')!
    expect(L1).toMatchObject({ cor: '#1f5fbf', traco: 'cheio', largura: 7, nivel: 3, fechada: false })
    expect(malha.linhas.find((l) => l.nome === 'KOMBI')).toMatchObject({ traco: 'pontilhado', largura: 3, nivel: null })
    expect(malha.linhas.find((l) => l.nome === 'RAMAL')!.fechada).toBe(true)
    expect(malha.paradas.get('B')!.linhas.map((id) => id.split('/')[1])).toEqual(['KOMBI', 'L1', 'VIP'])
    expect(malha.paradas.get('A')!.linhas).not.toContain('x/RAMAL') // fechada não conta
  })
  it('linhasDoNivel: plano ≤ nível + "na mão" sempre; fechada nunca', () => {
    expect(linhasDoNivel(malha, 1).map((l) => l.nome)).toEqual(['KOMBI'])
    expect(linhasDoNivel(malha, 3).map((l) => l.nome)).toEqual(['KOMBI', 'L1'])
    expect(linhasDoNivel(malha, 6).map((l) => l.nome)).toEqual(['KOMBI', 'L1', 'VIP'])
  })
  it('caminho da L1 desvia da parada D em (1,1): A→B reta, B→C reta', () => {
    const c = caminhoDaLinha(malha, malha.linhas.find((l) => l.nome === 'L1')!)
    expect(c.pontos).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }])
    expect(c.conflitos).toEqual([])
  })
  it('desenho: A–B compartilhada por L1 e KOMBI vira dois traços paralelos; B é baldeação; rótulos', () => {
    const d = desenharMalha(malha, linhasDoNivel(malha, 6), { unidade: 10, margem: 0, folga: 4, margemRotulo: 0 })
    const L1 = d.tracos.find((t) => t.nome === 'L1')!
    const K = d.tracos.find((t) => t.nome === 'KOMBI')!
    // primeiro segmento de cada uma: deslocados ±2 em y (perpendicular ao eixo x)
    const y1 = Number(/M[\d.-]+ ([\d.-]+)/.exec(L1.d)![1])
    const yk = Number(/M[\d.-]+ ([\d.-]+)/.exec(K.d)![1])
    expect(Math.abs(y1 - yk)).toBe(4)
    const B = d.paradas.find((p) => p.nome === 'B')!
    expect(B.baldeacao).toBe(true)
    expect(B.cor).toBeNull()
    expect(B.rotulo.rotacao).toBe(-45) // vizinha E em (3,0)
    const A = d.paradas.find((p) => p.nome === 'A')!
    expect(A.baldeacao).toBe(true) // L1 + KOMBI
    const C = d.paradas.find((p) => p.nome === 'C')!
    expect(C).toMatchObject({ baldeacao: true, cor: null })
    expect(C.rotulo.rotacao).not.toBe(0) // `inclinado` força a diagonal mesmo sem vizinha
    expect(A.rotulo).toMatchObject({ anchor: 'end', rotacao: 0 }) // esquerda, sem vizinha
    expect(d.paradas.find((p) => p.nome === 'D')).toBeUndefined() // ninguém para em D
    // só a KOMBI no nível 1: E é parada simples com a cor da Kombi
    const d1 = desenharMalha(malha, linhasDoNivel(malha, 1), { unidade: 10, margem: 0, margemRotulo: 0 })
    expect(d1.paradas.find((p) => p.nome === 'E')).toMatchObject({ baldeacao: false, cor: '#f4a261' })
    expect(d1.tracos.map((t) => t.nome)).toEqual(['KOMBI'])
  })
  it('paradasComBaldeacao lista as outras linhas de cada parada', () => {
    const L1 = malha.linhas.find((l) => l.nome === 'L1')!
    expect(paradasComBaldeacao(malha, L1).map((p) => [p.nome, p.baldeacoes.map((b) => b.nome)])).toEqual([['A', ['KOMBI']], ['B', ['KOMBI', 'VIP']], ['C', ['VIP']]])
  })
})
