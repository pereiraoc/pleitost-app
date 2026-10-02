// @vitest-environment node
// Execução (2026-10-02): como cada classe / habilidade / sintonia "executa"
// cada escola no mundo — a frase vem da Contexto-Def (`reskin.execucao`),
// nunca do render. Cascata: habilidades[hab] → classes[classe] →
// sintonias[sintonia] → padrao → null (fantasia).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reskinExecucao, setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import { execucaoDe } from '../src/interativa/execucao'
import { formulaCtxDeMagia } from '../src/interativa/formula-ctx'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')

function defFake(execucao: NonNullable<ContextoDef['reskin']['execucao']>): ContextoDef {
  return {
    id: 'teste',
    nome: 'Mundo de teste',
    fonte: 'x',
    moeda: { simbolo: '$', nome: 'd' },
    atlas: { raiz: 'Atlas', mapa: null },
    pericias: {},
    reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [], execucao },
    disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
    base: { sempreDisponiveis: [], conteudoDeMundo: { pastas: [], tipos: [] } },
  } as unknown as ContextoDef
}

afterEach(() => setActiveContexto(null))

describe('execucaoDe(fm): quem é o alvo da cascata', () => {
  it('classe canônica do wikilink, mesmo com alias composto', () => {
    const alvo = execucaoDe({ Classe: '[[Arcanista|Mestre-Arcanista Bruxo]]' })
    expect(alvo.classe).toBe('Arcanista')
  })
  it('sintonia: basename do wikilink; elemento cru vira o Traço correspondente', () => {
    expect(execucaoDe({ Sintonia: '[[Traço Elemental do Fogo]]' }).sintonia).toBe('Traço Elemental do Fogo')
    expect(execucaoDe({ Sintonia: 'Água' }).sintonia).toBe('Traço Elemental da Água')
    expect(execucaoDe({ Sintonia: '[[Sistema/Criação de Personagem/Sintonia/Tipagens/Fator Positrônico]]' }).sintonia).toBe('Fator Positrônico')
  })
  it('habilidades: basenames de Habilidades.Lista', () => {
    const alvo = execucaoDe({ Habilidades: { Lista: [{ '[[Treinamento de Animista]]': 'Manual.Habilidade' }, { '[[Evolução Básica]]': 'Regra.[[Guerreiro]]' }] } })
    expect(alvo.habilidades).toEqual(['Treinamento de Animista', 'Evolução Básica'])
  })
  it('fm vazio → tudo nulo/vazio', () => {
    expect(execucaoDe({})).toEqual({ classe: null, sintonia: null, habilidades: [] })
  })
})

describe('reskinExecucao(alvo, escola): cascata do mundo', () => {
  const ex = {
    padrao: { Anima: 'padrão anima' },
    classes: { Animista: { Anima: 'classe animista' }, Guerreiro: {} },
    habilidades: { 'Treinamento de Animista': { Anima: 'exposição' } },
    sintonias: { 'Traço Elemental da Água': { Anima: 'sintonia água' } },
  }
  it('habilidade prevalece sobre classe; classe sobre sintonia; sintonia sobre padrão', () => {
    setActiveContexto(defFake(ex))
    const base = { classe: 'Animista', sintonia: 'Traço Elemental da Água', habilidades: [] as string[] }
    expect(reskinExecucao({ ...base, habilidades: ['Treinamento de Animista'] }, 'Anima')).toBe('exposição')
    expect(reskinExecucao(base, 'Anima')).toBe('classe animista')
    expect(reskinExecucao({ ...base, classe: 'Guerreiro' }, 'Anima')).toBe('sintonia água')
    expect(reskinExecucao({ classe: 'Guerreiro', sintonia: null, habilidades: [] }, 'Anima')).toBe('padrão anima')
    expect(reskinExecucao(base, 'Arcana Negra')).toBeNull()
  })
  it('sem mundo (fantasia) → null sempre', () => {
    setActiveContexto(null)
    expect(reskinExecucao({ classe: 'Animista', sintonia: null, habilidades: [] }, 'Anima')).toBeNull()
  })
  it('formulaCtxDeMagia carrega a execução junto da potência', () => {
    setActiveContexto(defFake(ex))
    const fm = { Classe: '[[Animista]]', Atributos: { PRE: 2 }, Magias: { Potencia: 4, Lista: [{ Nome: 'Anima', Atributo: 'PRE' }] } }
    expect(formulaCtxDeMagia(fm, 'Anima')).toEqual({ potencia: 4, mod: 2, execucao: 'classe animista' })
    expect(formulaCtxDeMagia(fm, null).execucao).toBeUndefined()
  })
  it('o contexto REAL da POA tem execução pras sete classes e cai no padrão pra quem não conjura', () => {
    const real = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(real)
    expect(reskinExecucao({ classe: 'Animista', sintonia: null, habilidades: [] }, 'Anima')).toMatch(/radiolênico/)
    expect(reskinExecucao({ classe: 'Guerreiro', sintonia: 'Fator Negatrônico', habilidades: [] }, 'Arcana Negra')).toMatch(/adaptador/)
    expect(reskinExecucao({ classe: 'Guerreiro', sintonia: null, habilidades: [] }, 'Tesouros')).toMatch(/cartucho/)
  })
})
