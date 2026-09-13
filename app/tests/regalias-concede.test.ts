// CAMPOS DE MÁQUINA NO DEGRAU (2026-09-13): pra o app entregar a regalia
// sozinho, o degrau declara o que concede em campo EXPLÍCITO. Parsing da prosa
// foi descartado porque o texto também linka o que NÃO é concessão — o
// endereço fictício ([[Kitnet do Aeromóvel]]), o aluguel que a própria nota
// diz não ser regalia ([[Vaga na Pensão da Vila Militar]]) e a cortesia avulsa
// ([[Diária no Hotel Rua da Praia]]). Adivinhar ali dá erro silencioso.
import { describe, expect, it } from 'vitest'
import { alvoDoLink, listaDeLinks, parseRegalias, precoInteiro } from '../src/recursos/regalias'

const corpo = `
#### Executivo ([[Caçador]]) — a escada corporativa
Primeiro o endereço, depois o crachá.
- **nv 1 · Trainee:** alojamento da firma — [[Kitnet]] (6.000: [[Kitnet do Aeromóvel]] funcional) paga pela firma. *Concede:* [[Kitnet]]. *Paga:* a firma. *Preço:* o RH sabe onde tu dorme.
- **nv 4 · Gerente:** crachá de linha. *Preço:* auditoria mensal. *Concede:* [[TRI Ouro]]. *Larga:* [[Kitnet]]. *Paga:* a firma.
- **nv 7 · Diretor:** [[Carro com Motorista]] com Aeromóvel incluso. *Concede:* [[Carro com Motorista]]. *Larga:* [[TRI Ouro]]. *Paga:* a firma. *Renda:* Cz$ 40.000/mês. *Preço:* o carro tem rádio. **Sem teto:** a firma declara o Diretor.

#### Nóia ([[Druida]]) — o Círculo
- **nv 1:** a palafita.
`
const mapa = parseRegalias(corpo)
const exec = mapa.get('Caçador')!

describe('campos de máquina do degrau', () => {
  it('lê *Concede:* sem pegar o que a prosa linka por perto', () => {
    expect(exec.degraus[0]!.concede).toEqual(['Kitnet'])
    expect(exec.degraus[0]!.concede).not.toContain('Kitnet do Aeromóvel')
  })

  it('os campos valem em qualquer ordem, e nenhum engole o outro', () => {
    const nv4 = exec.degraus[1]!
    expect(nv4.concede).toEqual(['TRI Ouro'])
    expect(nv4.larga).toEqual(['Kitnet'])
    expect(nv4.paga).toBe('a firma')
    expect(nv4.preco).toBe('auditoria mensal.')
  })

  it('*Renda:* vira inteiro na moeda do mundo', () => {
    expect(exec.degraus[2]!.renda).toBe(40000)
    expect(exec.degraus[0]!.renda).toBe(0)
  })

  it('o texto do degrau não guarda nenhuma cláusula de campo', () => {
    for (const d of exec.degraus) {
      for (const rotulo of ['Concede', 'Larga', 'Paga', 'Renda', 'Preço']) {
        expect(d.texto, `${d.nivel} carregou ${rotulo}`).not.toContain(`*${rotulo}:*`)
      }
    }
  })

  it('*Preço:* preserva o **Negrito:** que vem depois dele na prosa', () => {
    // guarda de regressão: um lookahead solto truncaria aqui
    expect(exec.degraus[2]!.preco).toContain('a firma declara o Diretor')
  })

  it('degrau sem campo nenhum continua válido, com listas vazias', () => {
    const noia = mapa.get('Druida')!.degraus[0]!
    expect(noia.concede).toEqual([])
    expect(noia.larga).toEqual([])
    expect(noia.paga).toBeNull()
    expect(noia.renda).toBe(0)
  })

  it('o callout dobrável da nota real não muda nada', () => {
    const citado = parseRegalias(corpo.split('\n').map((l) => (l ? `> ${l}` : l)).join('\n'))
    expect(citado.get('Caçador')!.degraus[1]!.concede).toEqual(['TRI Ouro'])
  })
})

describe('helpers de link e número', () => {
  it('alvoDoLink tira o pipe escapado das tabelas', () => {
    expect(alvoDoLink('[[Caçador\\|Executivo]]')).toBe('Caçador')
    expect(alvoDoLink('[[Kitnet]]')).toBe('Kitnet')
    expect(alvoDoLink('texto cru')).toBe('texto cru')
  })

  it('listaDeLinks separa por vírgula, ponto-e-vírgula e " e "', () => {
    expect(listaDeLinks('[[Apartamento]], [[Churrascaria]]')).toEqual(['Apartamento', 'Churrascaria'])
    expect(listaDeLinks('[[Quarto]] e [[Cantina]]')).toEqual(['Quarto', 'Cantina'])
    expect(listaDeLinks('[[TRI Platina]]; [[Mercedes-Benz 1113]].')).toEqual(['TRI Platina', 'Mercedes-Benz 1113'])
  })

  it('precoInteiro lê o milhar com ponto e ignora a prosa', () => {
    expect(precoInteiro('Cz$ 40.000/mês')).toBe(40000)
    expect(precoInteiro('15.000 por mês de pedágio')).toBe(15000)
    expect(precoInteiro('sem número')).toBe(0)
  })
})
