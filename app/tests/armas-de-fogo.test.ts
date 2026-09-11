// @vitest-environment node
// ARMAS ARCANÔNICAS / ARMAS DE FOGO (pedido 2026-09-10) — terceira categoria
// de arma do sistema. As três regras que ela traz, todas declaradas na vault:
//   1. proficiência PRÓPRIA que ninguém tem por padrão (nem Simples nem
//      Marciais concedem) — só a lista de Armas Específicas;
//   2. `Inteligência X`: TRAVA (abaixo do valor não se ataca), diferente de
//      `Força X`, que só penaliza;
//   3. `Fatal`: +1 passo de dado contra alvo em 1/3 ou menos da vida — o alvo
//      `PassoDeDado` já existe no motor (Apunhalante/Aspecto Colossal usam),
//      então é um Estado com botão, sem código novo de regra.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  atributoDeAtaqueDaArma,
  deriveArmaAtributo,
  exigenciaIntDaArma,
  profArmaEfetiva,
} from '../src/components/ficha/hero-model'
import { armaEhMercadoria } from '../src/components/ficha/registry'
import { setActiveContexto, reskinName } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const raiz = path.dirname(appDir)
const PISTOLA = 'Sistema/Equipamento/Armas/Armas Arcanônicas/Pistola Arcanônica'
const BACAMARTE = 'Sistema/Equipamento/Armas/Armas Arcanônicas/Bacamarte Arcanônico'
const temDataset = fs.existsSync(path.join(raiz, 'vault-data', `${PISTOLA}.json`))

const fmCom = (especificas: string[]) => ({
  Inventario: { Armas: { Proficiencia: { Simples: 'P', Marciais: 'P', Especificas: especificas } } },
})

describe('proficiência da terceira categoria', () => {
  it('ser proficiente em Simples E Marciais não dá arma de fogo', () => {
    expect(profArmaEfetiva('E', 'd-arcanonico', 'Pistola Arcanônica', fmCom([]))).toBe('N')
    // controle: a mesma ficha É proficiente nas categorias que tem
    expect(profArmaEfetiva('E', 'd-simples', 'Besta de Mão', fmCom([]))).toBe('E')
    expect(profArmaEfetiva('E', 'd-marcial', 'Arco Curto', fmCom([]))).toBe('E')
  })

  it('CRIATURA do bestiário já vem treinada: a categoria conta como P', () => {
    // decisão do user (2026-09-10): "considera tudo como N mesmo e só os
    // monstros terão como P" — o inimigo aparece armado, o jogador não aprende.
    const fmMonstro = { ...fmCom([]), categoria: 'Criatura', subcategoria: 'Monstro' }
    expect(profArmaEfetiva('E', 'd-arcanonico', 'Pistola Arcanônica', fmMonstro)).toBe('E')
    // e o herói (sem subcategoria Monstro) segue sem
    expect(profArmaEfetiva('E', 'd-arcanonico', 'Pistola Arcanônica', fmCom([]))).toBe('N')
  })

  it('a arma na lista de Específicas concede (é como o monstro fica P)', () => {
    expect(profArmaEfetiva('E', 'd-arcanonico', 'Pistola Arcanônica', fmCom(['[[Pistola Arcanônica]]']))).toBe('E')
    // e só aquela arma — o bacamarte segue travado
    expect(profArmaEfetiva('E', 'd-arcanonico', 'Bacamarte Arcanônico', fmCom(['[[Pistola Arcanônica]]']))).toBe('N')
  })
})

describe('propriedade Inteligência X — trava, não penalidade', () => {
  it('lê a exigência das propriedades da arma', () => {
    expect(exigenciaIntDaArma(['[[Alcance|Alcance 6]]', '[[Recarga]]', '[[Inteligência X|Inteligência 1]]'])).toBe(1)
    expect(exigenciaIntDaArma(['[[Inteligência X|Inteligência 3]]'])).toBe(3)
  })

  it('arma sem a propriedade não exige nada (e Força X não vira trava)', () => {
    expect(exigenciaIntDaArma(['[[Alcance|Alcance 10]]', '[[Força X|Força 1]]'])).toBeNull()
    expect(exigenciaIntDaArma(undefined)).toBeNull()
    expect(exigenciaIntDaArma('')).toBeNull()
  })
})

describe.skipIf(!temDataset)('as notas da vault', () => {
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(raiz, 'vault-data', `${id}.json`), 'utf8')) as VaultDoc

  it('pistola e bacamarte estão no grupo novo, com as três propriedades', () => {
    // a de duas mãos exige mais cabeça: Inteligência 2 (report 2026-09-10)
    for (const [id, dano, maos, int] of [[PISTOLA, 'd6+3', 1, 1], [BACAMARTE, 'd8+4', 2, 2]] as const) {
      const fm = ler(id).frontmatter as Record<string, unknown>
      expect(fm.grupo).toBe('d-arcanonico')
      expect(fm.dano).toBe(dano)
      expect(fm['mãos']).toBe(maos)
      const props = (fm.propriedades as string[]).join(' ')
      expect(props).toContain('Recarga')
      expect(props).toContain(`Inteligência ${int}`)
      expect(props).toContain('Fatal')
    }
  })

  it('Fatal é um Estado com botão que soma PassoDeDado (motor que já existe)', () => {
    const fatal = ler('Sistema/Regras/Propriedades/Fatal').frontmatter as Record<string, unknown>
    const [efeito, passivo] = fatal['Efeitos_Interativos'] as Record<string, unknown>[]
    // o botão leva o nome da faixa de vida que a mesa vê no terço (Ferido)
    expect(efeito!.label).toBe('Fatal (alvo Ferido)')
    expect(efeito!.tipo).toBe('Estado')
    expect(JSON.stringify(efeito!.visual)).toContain('iconeLigado')
    expect(JSON.stringify(efeito!.modificadores)).toContain('PassoDeDado')
    // e o Acerto Decisivo dá o mesmo passo sozinho (passivo com requer)
    expect(passivo!.tipo).toBe('Passivo')
    expect(JSON.stringify(passivo!.links)).toContain('Acerto Decisivo')
    expect(JSON.stringify(passivo!.modificadores)).toContain('PassoDeDado')
    // Fatal sobe DOIS passos (report 2026-09-10), nos dois caminhos
    for (const e of [efeito!, passivo!]) {
      const [mod] = e.modificadores as Record<string, unknown>[]
      expect(mod!.valor).toBe(2)
    }
  })
})

describe.skipIf(!fs.existsSync(path.join(raiz, 'vault-data-cyberpunk', 'contexto.json')))(
  'nomes do mundo',
  () => {
    it('no POA 1987 a categoria e as duas armas têm nome de lá', () => {
      const def = JSON.parse(
        fs.readFileSync(path.join(raiz, 'vault-data-cyberpunk', 'contexto.json'), 'utf8'),
      ) as ContextoDef
      setActiveContexto(def)
      try {
        expect(reskinName('Armas Arcanônicas')).toBe('Armas de Fogo')
        expect(reskinName('Pistola Arcanônica')).toBe('Garrucha')
        expect(reskinName('Bacamarte Arcanônico')).toBe('Espingarda Serrada')
      } finally {
        setActiveContexto(null)
      }
    })
  },
)

describe.skipIf(!temDataset)('sem acesso: fora de toda loja (decisão 2026-09-10)', () => {
  const ler = (id: string) =>
    JSON.parse(fs.readFileSync(path.join(raiz, 'vault-data', `${id}.json`), 'utf8')) as VaultDoc

  it('as duas armas de fogo não são mercadoria em mundo nenhum', () => {
    for (const id of [PISTOLA, BACAMARTE]) {
      const fm = ler(id).frontmatter as Record<string, unknown>
      expect(armaEhMercadoria(fm.grupo, fm['mãos'])).toBe(false)
    }
  })

  it('e as armas normais continuam sendo (o corte é do grupo, não da loja)', () => {
    const besta = ler('Sistema/Equipamento/Armas/Armas Simples/Distância Simples/Besta de Mão')
      .frontmatter as Record<string, unknown>
    expect(armaEhMercadoria(besta.grupo, besta['mãos'])).toBe(true)
  })
})

describe('arma de fogo mira: AGI sempre (2026-09-10)', () => {
  const attrs = { FOR: 4, AGI: 1, INT: 0, PRE: 0 }

  it('entra na ficha já com AGI, mesmo com FOR alta', () => {
    expect(deriveArmaAtributo('d-arcanonico', ['[[Recarga]]'], attrs)).toBe('AGI')
    // controle: corpo-a-corpo comum segue FOR
    expect(deriveArmaAtributo('cac-marcial', [], attrs)).toBe('FOR')
  })

  it('e o ataque usa AGI mesmo se o FM guardou outra coisa (é regra, não default)', () => {
    expect(atributoDeAtaqueDaArma('d-arcanonico', 'FOR')).toBe('AGI')
    // arma comum: quem manda é o FM (ficha antiga/monstro com atributo próprio)
    expect(atributoDeAtaqueDaArma('cac-marcial', 'FOR')).toBe('FOR')
    expect(atributoDeAtaqueDaArma('d-marcial', 'AGI')).toBe('AGI')
  })
})
