// O QUE A REGALIA ENTREGA (2026-09-13). Os dois casos que decidem a regra de
// acumulação estão aqui: o Executivo, que LARGA o eixo antigo ao ganhar o
// novo, e o Artista Marcial, cujo degrau do meio não concede nada material e
// portanto não pode apagar o que veio antes.
import { describe, expect, it } from 'vitest'
import { cfg, estilos, porNome, rec } from './fixtures/recursos-fixtures'
import { parseRegalias } from '../src/recursos/regalias'
import { CONCESSOES_VAZIAS, concessoesDaRegalia } from '../src/recursos/concessoes'

const kombi = rec({ nome: 'Volkswagen Kombi', aba: 'Transporte', tipo: 'Veículo', preco: 350000, cobranca: 'única', manutencao: 3000, nivel: 4 })
const indice = new Map(porNome)
indice.set(kombi.nome, kombi)

const nota = `
#### Executivo ([[Caçador]]) — a escada
- **nv 1:** alojamento. *Concede:* [[Moradia Classe Média]]. *Paga:* a firma.
- **nv 4:** crachá. *Concede:* [[TRI Integrado]]. *Larga:* [[Moradia Classe Média]]. *Paga:* a firma.

#### Artista Marcial ([[Monge]]) — a academia
- **nv 1:** academia. *Concede:* [[Moradia Classe Média]], [[Alimentação Classe Baixa]]. *Paga:* a academia.
- **nv 4 · Asceta:** corpo temperado — sem teste de fadiga. *Preço:* não anda de carro de diretoria.
- **nv 7:** alunos. *Concede:* [[Moradia Classe Média]]. *Paga:* os alunos. *Renda:* Cz$ 10.000/mês.

#### Articulador ([[Comandante]]) — o sindicato
- **nv 1:** carteirinha. *Concede:* [[TRI Popular]]. *Paga:* o sindicato.
- **nv 4:** a Kombi. *Concede:* [[Volkswagen Kombi]]. *Paga:* o sindicato.

#### Ressonante ([[Bardo]]) — o cachê
- **nv 1:** cachê. *Concede:* [[Alimentação Classe Baixa]]. *Paga:* a casa.
- **nv 4:** camarim. *Concede:* [[Alimentação Classe Média Alta]], [[Broche Artístico]]. *Paga:* a casa.
`
const mapa = parseRegalias(nota)
const de = (classe: string, nivel: number) => concessoesDaRegalia(mapa.get(classe) ?? null, nivel, indice, cfg)

describe('acumulação dos degraus', () => {
  it('só conta o que o nível já alcançou', () => {
    expect(de('Caçador', 3).pisos.moradia?.plano.nome).toBe(estilos.m4.nome)
    expect(de('Caçador', 3).pisos.transporte).toBeUndefined()
  })

  it('*Larga:* devolve o eixo antigo — o Executivo troca a kitnet pelo crachá', () => {
    const nv4 = de('Caçador', 4)
    expect(nv4.pisos.moradia).toBeUndefined()
    expect(nv4.pisos.transporte?.plano.nome).toBe(estilos.t4.nome)
  })

  it('degrau sem concessão não apaga os anteriores — o Asceta segue na academia', () => {
    const nv4 = de('Monge', 4)
    expect(nv4.pisos.moradia?.plano.nome).toBe(estilos.m4.nome)
    expect(nv4.pisos.alimentacao?.plano.nome).toBe(estilos.a2.nome)
  })

  it('o degrau mais alto do mesmo eixo vence', () => {
    expect(de('Bardo', 1).pisos.alimentacao?.plano.nome).toBe(estilos.a2.nome)
    expect(de('Bardo', 4).pisos.alimentacao?.plano.nome).toBe(estilos.a5.nome)
  })

  it('eixos diferentes acumulam', () => {
    const c = de('Comandante', 4)
    expect(c.pisos.transporte?.plano.nome).toBe(estilos.t3.nome)
    expect(c.posse.map((p) => p.nome)).toEqual(['Volkswagen Kombi'])
  })
})

describe('classificação do que é concedido', () => {
  it('plano vira piso; recurso comprável vira posse cedida', () => {
    const c = de('Comandante', 4)
    expect(c.posse[0]).toMatchObject({ nome: 'Volkswagen Kombi', pago: 0, pagoPor: 'o sindicato' })
  })

  it('nome que não é nota de Recurso fica fora, sem virar estado', () => {
    const c = de('Bardo', 4)
    expect(c.foraDoEixo).toEqual(['Broche Artístico'])
    expect(c.posse).toHaveLength(0)
  })

  it('quem paga sai do *Paga:*, e sem ele cai no rótulo da classe', () => {
    expect(de('Caçador', 1).pisos.moradia?.quem).toBe('a firma')
    const semPaga = parseRegalias('#### X ([[Caçador]]) — y\n- **nv 1:** z. *Concede:* [[Moradia Classe Média]].')
    expect(concessoesDaRegalia(semPaga.get('Caçador')!, 1, indice, cfg).pisos.moradia?.quem).toBe('regalia de X')
  })
})

describe('renda mensal', () => {
  it('soma os degraus alcançados e diz de onde vem', () => {
    expect(de('Monge', 4).renda).toBe(0)
    const nv7 = de('Monge', 7)
    expect(nv7.renda).toBe(10000)
    expect(nv7.rendaFontes).toEqual(['os alunos (nv 7)'])
  })
})

describe('sem regalia', () => {
  it('sem nota, sem nível ou sem campos devolve tudo vazio', () => {
    expect(concessoesDaRegalia(null, 7, indice, cfg)).toBe(CONCESSOES_VAZIAS)
    expect(concessoesDaRegalia(mapa.get('Caçador')!, 0, indice, cfg)).toBe(CONCESSOES_VAZIAS)
  })
})
