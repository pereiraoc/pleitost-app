// REGALIAS DE CLASSE (2026-09-08): cada classe ganha um eixo do custo de vida
// pago por terceiro, em degraus por nível. A nota da vault é a fonte; o app só
// lê. Oráculo = nota REAL da POA quando extraída.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRegalias, regaliaDaClasse } from '../src/recursos/regalias'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const notaReal = path.join(cyberDir, 'Contexto/Histórias/Contexto Atual/Economia e Sobrevivência/Regalias de Classe.json')

const CORPO = `
Bla bla introdução.

#### Executivo ([[Caçador]]) — a escada corporativa
A firma paga a kitnet desde o nível 1.
- **nv 1 · Trainee:** alojamento da firma — [[Moradia Classe Média]] paga pela firma. *Preço:* o RH sabe onde tu dorme.
- **nv 4 · Gerente:** crachá de linha — [[TRI Ouro]] pago pela firma. *Preço:* auditoria mensal.
- **nv 7 · Diretor:** [[Carro com Motorista]] e moradia funcional.

#### Malandro ([[Ladino]]) — o esconderijo
- **nv 1:** quarto de fundos de graça. *Preço:* a dona sabe de tudo.

#### Como se usa
Isto não é classe nenhuma.
`

describe('parseRegalias', () => {
  const mapa = parseRegalias(CORPO)
  it('indexa pela CLASSE CANÔNICA do wikilink, não pelo nome do mundo', () => {
    expect([...mapa.keys()].sort()).toEqual(['Caçador', 'Ladino'])
    const exec = mapa.get('Caçador')!
    expect(exec.nome).toBe('Executivo')
    expect(exec.subtitulo).toBe('a escada corporativa')
    expect(exec.intro).toContain('A firma paga a kitnet')
  })
  it('lê os degraus por nível, com título e o preço escondido separados', () => {
    const exec = mapa.get('Caçador')!
    expect(exec.degraus.map((d) => d.nivel)).toEqual([1, 4, 7])
    expect(exec.degraus[0]).toMatchObject({ nivel: 1, titulo: 'Trainee' })
    expect(exec.degraus[0]!.texto).toContain('alojamento da firma')
    expect(exec.degraus[0]!.texto).not.toContain('Preço')
    expect(exec.degraus[0]!.preco).toBe('o RH sabe onde tu dorme.')
    // degrau sem título e sem preço continua válido
    expect(mapa.get('Ladino')!.degraus[0]).toMatchObject({ nivel: 1, titulo: null })
    expect(exec.degraus[2]!.preco).toBeNull()
  })
  it('"Como se usa" não vira classe (heading sem wikilink)', () => {
    expect(mapa.has('Como se usa')).toBe(false)
  })
  it('regaliaDaClasse resolve o wikilink do FM do herói', () => {
    expect(regaliaDaClasse(mapa, '[[Caçador]]')?.nome).toBe('Executivo')
    expect(regaliaDaClasse(mapa, '[[Caçador|Executivo]]')?.nome).toBe('Executivo')
    expect(regaliaDaClasse(mapa, 'Caçador')?.nome).toBe('Executivo')
    expect(regaliaDaClasse(mapa, '[[Monge]]')).toBeNull()
    expect(regaliaDaClasse(mapa, '')).toBeNull()
  })
})

describe('nota REAL da POA', () => {
  it('as dez classes do mundo têm regalia, com degraus em 1, 4 e 7', () => {
    if (!fs.existsSync(notaReal)) return
    const doc = JSON.parse(fs.readFileSync(notaReal, 'utf8')) as VaultDoc
    const mapa = parseRegalias(doc.body ?? '')
    expect(mapa.size).toBe(10)
    for (const [classe, r] of mapa) {
      expect(r.nome, classe).toBeTruthy()
      expect(r.degraus.map((d) => d.nivel), classe).toEqual([1, 4, 7])
      for (const d of r.degraus) expect(d.texto.length, `${classe} nv${d.nivel}`).toBeGreaterThan(10)
    }
    expect(mapa.get('Caçador')!.nome).toBe('Executivo')
    expect(mapa.get('Animista')!.nome).toBe('Químico')
  })
})
