// Report 2026-09-12 (aba CRIATURAS no POA 1987): a aba seguia "COMPANHEIROS
// ANIMAIS" enquanto os botões da mesma tela já diziam "Empregado" — reskinUpper
// só experimentava UMA capitalização ("Companheiros animais"), que não é chave
// de termo nenhuma. E o subtítulo do card mostrava "Canino" cru: a lista lia o
// FM direto, sem a cascata do mundo nem o ajuste de tamanho do Contexto que a
// ficha já aplica (#544).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setActiveContexto, reskinUpper } from '../src/data/reskin'
import { subtituloDeCriatura } from '../src/components/creatures/subtitulo'
import type { ContextoDef } from '../src/data/context-def'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const defPoa = fs.existsSync(cybContexto)
  ? (JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef)
  : null

afterEach(() => setActiveContexto(null))

const caPoa = {
  subcategoria: 'Companheiro Animal',
  Classe: '[[Companheiro Animal Canino|Canino Médio]]',
}
const monstroPoa = { subcategoria: 'Monstro', Raça: '[[Humano|Humano (Médio)]]' }
// Pedido do mestre (2026-09-12): na lista, a CLASSE vem antes da raça, e a raça
// mostra o TAMANHO — o alias "Humano (Médio)" já traz, mas "Incomum" não trazia
// e o bicho aparecia sem tamanho nenhum.
const soldadoPoa = {
  subcategoria: 'Monstro',
  Classe: '[[Soldado|Soldado Competente]]',
  Raça: '[[Humano|Humano (Médio)]]',
  Tamanho: 'Médio',
}
const bichoPoa = {
  subcategoria: 'Monstro',
  Classe: '[[Bruto|Bruto Solo]]',
  Raça: '[[Incomum|Incomum]]',
  Tamanho: 'Enorme',
}

describe.skipIf(!defPoa)('rótulos da tela de CRIATURAS no mundo', () => {
  it('reskinUpper cobre rótulo de VÁRIAS palavras (aba da criatura)', () => {
    setActiveContexto(defPoa)
    expect(reskinUpper('COMPANHEIROS ANIMAIS')).toBe('EMPREGADOS')
    expect(reskinUpper('PESSOAS')).toBe('PESSOAS')
    expect(reskinUpper('BESTIÁRIO')).toBe('BESTIÁRIO')
  })

  it('subtítulo do card: Classe do Empregado sai no vocabulário do mundo e sem tamanho', () => {
    setActiveContexto(defPoa)
    expect(subtituloDeCriatura(caPoa, 'Companheiro Animal')).toBe('Segurança')
  })

  it('subtítulo do monstro: Classe primeiro, depois a raça COM o tamanho', () => {
    setActiveContexto(defPoa)
    expect(subtituloDeCriatura(soldadoPoa, 'Monstro')).toBe('Soldado Competente · Humano (Médio)')
    // "Incomum" não carrega tamanho no alias — o FM `Tamanho` completa
    expect(subtituloDeCriatura(bichoPoa, 'Monstro')).toBe('Bruto Solo · Incomum (Enorme)')
    // sem Classe, só a raça
    expect(subtituloDeCriatura(monstroPoa, 'Monstro')).toBe('Humano (Médio)')
    // sem Raça cai na Classe, e sem as duas no subtipo — sempre reskinado
    expect(subtituloDeCriatura({ subcategoria: 'Monstro' }, 'Monstro')).toBe('Monstro')
    expect(subtituloDeCriatura({ subcategoria: 'Companheiro Animal' }, 'Companheiro Animal')).toBe(
      'Empregado',
    )
  })

  it('Pessoa compõe Relação · Organização · Posição (#414)', () => {
    setActiveContexto(defPoa)
    const fm = { Relação: 'Aliada', Organização: '[[Banrisul]]', Posição: 'Gerente' }
    expect(subtituloDeCriatura(fm, 'Pessoa')).toBe('Aliada · Banrisul · Gerente')
  })
})

describe('na fantasia o rótulo é o canônico', () => {
  it('nada de cascata nem de corte de tamanho', () => {
    expect(reskinUpper('COMPANHEIROS ANIMAIS')).toBe('COMPANHEIROS ANIMAIS')
    expect(subtituloDeCriatura(caPoa, 'Companheiro Animal')).toBe('Canino Médio')
  })
})
