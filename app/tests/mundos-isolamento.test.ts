// ISOLAMENTO ENTRE MUNDOS (2026-09-13) — guarda contra a economia da POA 1987
// vazar pra Fantasia. O custo de vida, o imposto progressivo, a classe social
// e as regalias de classe são TODOS declarados no Contexto-Def da POA, e a
// Fantasia não declara `recursos` nenhum: a aba não aparece, e cada função
// nova é inerte sem a config.
//
// Existe porque a pergunta é fácil de errar de boa fé: as duas vaults
// compartilham o mesmo sistema, e as fixtures de herói são as mesmas.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setActiveContexto, activeContextoDef } from '../src/data/reskin'
import { abaFichaVisivel } from '../src/data/familia'
import { aliquotaDoNivel, comImposto, manutencaoDoItem } from '../src/recursos/hero-recursos'
import { concessoesDaRegalia, CONCESSOES_VAZIAS } from '../src/recursos/concessoes'
import type { ContextoDef } from '../src/data/context-def'
import type { RecursosCfg } from '../src/recursos/types'

const repoDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const ler = (dir: string) => {
  const f = path.join(repoDir, dir, 'contexto.json')
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as ContextoDef) : null
}
const fantasia = ler('vault-data')
const poa = ler('vault-data-cyberpunk')

afterEach(() => setActiveContexto(null))

describe.skipIf(!fantasia)('a Fantasia não vê nada da economia da POA', () => {
  it('não declara `recursos`, então não tem aba, imposto, classe social nem regalia', () => {
    setActiveContexto(fantasia!)
    expect(activeContextoDef()?.recursos).toBeUndefined()
    expect(abaFichaVisivel('Heroi', 'recursos')).toBe(false)
  })
})

describe.skipIf(!poa)('a POA 1987 declara os três', () => {
  it('tem aba, imposto, classe social e a nota de regalias', () => {
    setActiveContexto(poa!)
    const r = activeContextoDef()?.recursos
    expect(abaFichaVisivel('Heroi', 'recursos')).toBe(true)
    expect(r?.imposto?.porNivel).toHaveLength(6)
    expect(r?.classeSocial?.tendencias).toBeTruthy()
    expect(r?.regalias).toBeTruthy()
  })

  it('nenhuma classe tem TETO — o freio é o imposto, não uma trava', () => {
    const tend = poa!.recursos!.classeSocial!.tendencias
    expect(Object.entries(tend).filter(([, v]) => 'teto' in v)).toEqual([])
  })
})

// Sem o bloco do mundo, cada função nova é inerte — é isto que faz a mudança
// não alcançar quem não pediu por ela.
describe('as funções novas são inertes sem a config do mundo', () => {
  const semEconomia = { tipos: { passagem: 'Passagem', estilo: 'Estilo de Vida' } } as unknown as RecursosCfg

  it('sem `imposto`, alíquota zero e valor intacto', () => {
    expect(aliquotaDoNivel(semEconomia, 6)).toBe(0)
    expect(comImposto(semEconomia, 50000, 6)).toBe(50000)
    const item = { nome: 'x', aba: 'Transporte', qtd: 1, pago: 0 }
    expect(manutencaoDoItem({ manutencao: 3000, nivel: 6 } as never, item, semEconomia)).toBe(3000)
  })

  it('sem nota de regalia, nada é concedido', () => {
    expect(concessoesDaRegalia(null, 7, new Map(), semEconomia)).toBe(CONCESSOES_VAZIAS)
  })
})
