// @vitest-environment node
// Planejamento por nível (docs/plano-planejamento-por-nivel.md, F1): timeline
// derivada projetando o herói nível a nível (1..10) e diffando — ganhos caem
// no nível em que a regra dispara (scope Nivel N), escolhas no nível do gate,
// e os GASTOS de slot (técnicas/perícias/magias) são atribuídos por
// earliest-fit: o k-ésimo gasto do rank R cai no nível onde o k-ésimo slot R
// nasce (ordem da lista = proxy de cronologia).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { buildLevelTimeline } from '../src/rules/level-timeline'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

describe('timeline do Guerreiro (regras reais da vault)', () => {
  const fm = {
    Classe: '[[Guerreiro]]',
    'Nível': 7,
    Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    Tecnicas: {
      Lista: [
        { '[[Ataque Poderoso]]': 'Slot.A' }, // 1º A → N1 (slot da classe)
        { '[[Aparar]]': 'Slot.A' }, // 2º A → N2 (Evolução Básica)
        { '[[Ataque Brutal]]': 'Slot.E' }, // 1º E → N4
      ],
    },
    Pericias: {
      Lista: [
        {
          Nome: 'Atletismo',
          Atributo: 'FOR',
          Proficiencia: 'E',
          Bonus_Item: 0,
          Bonus_Especial: 0,
          Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
        },
      ],
    },
  }

  it('cards 1..10; ganhos da classe caem no nível do scope', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    expect(cards).toHaveLength(10)
    expect(cards.map((c) => c.nivel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const hab = (n: number) => cards[n - 1]!.habilidades.join(' ')
    expect(hab(1)).toContain('Evolução Básica')
    expect(hab(1)).toContain('Especialização em Arma')
    expect(hab(4)).toContain('Veterano')
    expect(hab(7)).toContain('Campeão')
    expect(hab(10)).toContain('Maestria em Arma')
  })

  it('slots ganhos por nível (classe + Evolução Básica)', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    // Guerreiro N1: Tec A+1; Evolução N2/N3: Tec A+1 cada; N4: classe Tec E+1
    expect(cards[0]!.slots.tecnicas.A).toBe(1)
    expect(cards[1]!.slots.tecnicas.A).toBe(1)
    expect(cards[2]!.slots.tecnicas.A).toBe(1)
    expect(cards[3]!.slots.tecnicas.E).toBe(1)
    expect(cards[6]!.slots.tecnicas.M).toBe(1)
    // Perícias: N1 = 2 (classe) + INT (Evolução, INT 1 → 1) = 3; N4 E+1
    expect(cards[0]!.slots.pericias.A).toBe(3)
    expect(cards[3]!.slots.pericias.E).toBe(1)
  })

  it('gastos atribuídos por earliest-fit na ordem da lista', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const gastosTec = (n: number) => cards[n - 1]!.gastos.tecnicas.map((g) => g.link)
    expect(gastosTec(1)).toEqual(['[[Ataque Poderoso]]'])
    expect(gastosTec(2)).toEqual(['[[Aparar]]'])
    expect(gastosTec(4)).toEqual(['[[Ataque Brutal]]'])
    // perícia: A de Atletismo no 1º slot A (N1); E no 1º slot E (N4)
    const gastosPer = (n: number) => cards[n - 1]!.gastos.pericias.map((g) => `${g.nome}:${g.rank}`)
    expect(gastosPer(1)).toContain('Atletismo:A')
    expect(gastosPer(4)).toContain('Atletismo:E')
  })

  it('escolhas caem no nível do gate (Especialização em Arma N1)', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const n1Labels = cards[0]!.escolhas.map((c) => c.sourceNote)
    expect(n1Labels).toContain('Especialização em Arma')
  })

  it('nível ACIMA do atual segue no plano (ganhos futuros visíveis)', async () => {
    const cards = await buildLevelTimeline({ ...fm, 'Nível': 3 }, catalog, load)
    expect(cards[9]!.habilidades.join(' ')).toContain('Maestria em Arma')
    expect(cards[3 - 1]!.nivel).toBe(3)
  })
})

describe('blindagem — bloco Planejamento é INERTE pra engine', () => {
  it('derivedFm idêntico com e sem o bloco (Carlos congelado)', async () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join('tests/fixtures/heroes', 'Carlos Facão de Andradas.json'), 'utf8'),
    ) as VaultDoc
    const fm = doc.frontmatter as Record<string, unknown>
    const { projectHeroRules } = await import('../src/rules/useHeroRules')
    const sem = await projectHeroRules(fm, catalog, load)
    const com = await projectHeroRules(
      { ...fm, Planejamento: { picks: { 'x|y|1': '[[Qualquer Coisa]]' } } },
      catalog,
      load,
    )
    const semD = { ...(sem.projection.derivedFm as Record<string, unknown>) }
    const comD = { ...(com.projection.derivedFm as Record<string, unknown>) }
    delete comD['Planejamento'] // a chave passa crua pro derivado (esperado)
    expect(JSON.stringify(comD)).toBe(JSON.stringify(semD))
  })
})

describe('#493 — consequência herda o nível do PAI (cadeia de derivação)', () => {
  it('escolha de técnica comprada com slot E (N4) cai no card 4, não no 1', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 9,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' }, // 1º A → N1
          { '[[Especialização em Classe Secundária]]': 'Slot.E' }, // 1º E → N4
        ],
      },
      Habilidades: {
        Lista: [{ '[[Treinamento de Ladino]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const escolhasDe = (n: number) => cards[n - 1]!.escolhas.map((c) => c.sourceNote)
    // a escolha da Especialização (técnica atribuída ao N4) pertence ao N4
    expect(escolhasDe(4)).toContain('Especialização em Classe Secundária')
    expect(escolhasDe(1)).not.toContain('Especialização em Classe Secundária')
    // a do Treinamento (comprado no N1) segue no N1
    expect(escolhasDe(1)).toContain('Treinamento de Classe Secundária')
    // ganho derivado do pick do N1 (Ataque Furtivo Menor via Treinamento de
    // Ladino) fica no N1
    expect(cards[0]!.habilidades.join(' ')).toContain('Ataque Furtivo Menor')
  })
})

describe('gastos PLANEJADOS (registro de nível futuro sem aplicação real)', () => {
  it('registro de técnica futura vira gasto `planejado` no card do nível', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Planejamento: {
        gastosSlots: [
          { nivel: 4, tipo: 'tecnica', rank: 'E', alvo: '[[Ataque Brutal]]' },
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Furtividade' },
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const c4 = cards[3]!
    expect(c4.gastos.tecnicas.map((g) => `${g.link}${g.planejado ? '(plano)' : ''}`)).toContain(
      '[[Ataque Brutal]](plano)',
    )
    expect(c4.gastos.pericias.map((g) => `${g.nome}${g.planejado ? '(plano)' : ''}`)).toContain(
      'Furtividade(plano)',
    )
    // o slot E do nível 4 está consumido pelo plano (sem pendência dupla)
    const livresE = c4.slots.tecnicas.E - c4.gastos.tecnicas.filter((g) => g.rank === 'E').length
    expect(livresE).toBe(0)
  })

  it('registro JÁ aplicado não duplica (só o gasto real aparece)', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 5,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: { Lista: [{ '[[Ataque Brutal]]': 'Slot.E' }] },
      Planejamento: {
        gastosSlots: [{ nivel: 4, tipo: 'tecnica', rank: 'E', alvo: '[[Ataque Brutal]]' }],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const todas = cards.flatMap((c) => c.gastos.tecnicas)
    expect(todas.filter((g) => g.link.includes('Ataque Brutal'))).toHaveLength(1)
    expect(todas.find((g) => g.link.includes('Ataque Brutal'))?.planejado).toBeFalsy()
  })
})

describe('registro deslocado NÃO rouba slot de outro nível', () => {
  it('registro M@N1 (sem slot M no N1) não consome o M do N8', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 7,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Enganação',
            Atributo: 'PRE',
            Proficiencia: 'M',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }, { M: 'Slot.M' }],
          },
        ],
      },
      Planejamento: {
        // registro PODRE (era das atribuições no N1): não pode comer o slot
        // M de N7/N8 — sem slot M no N1, o gasto fica no N1 e pronto
        gastosSlots: [{ nivel: 1, tipo: 'pericia', rank: 'M', alvo: 'Enganação' }],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    // slots M dos níveis 7/8/9 (Evolução/classe) continuam LIVRES
    for (const n of [7, 8, 9]) {
      const c = cards[n - 1]!
      const livres = c.slots.pericias.M - c.gastos.pericias.filter((g) => g.rank === 'M').length
      if (c.slots.pericias.M > 0) expect(livres, `M livre no N${n}`).toBe(c.slots.pericias.M)
    }
    // o gasto aparece no nível registrado (N1), mesmo sem slot lá
    expect(cards[0]!.gastos.pericias.some((g) => g.nome === 'Enganação' && g.rank === 'M')).toBe(true)
  })
})

describe('sanitizarRegistros — auto-heal sem perder informação', () => {
  it('registro M@N1 (deslocado) move pro primeiro nível com slot M; legítimo fica', async () => {
    const { sanitizarRegistros } = await import('../src/rules/level-timeline')
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 9,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const { mudou, registros } = sanitizarRegistros(cards, [
      { nivel: 1, tipo: 'pericia', rank: 'M', alvo: 'Enganação' }, // podre
      { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Acrobacia' }, // legítimo
    ])
    expect(mudou).toBe(true)
    const m = registros.find((r) => r.alvo === 'Enganação')!
    expect(m.nivel).toBe(7) // primeiro slot M de perícia (Evolução N7)
    expect(m.rank).toBe('M') // nada além do nível muda
    expect(registros.find((r) => r.alvo === 'Acrobacia')!.nivel).toBe(4)
  })
})

describe('#494 — registro de perícia é POR RANK (A/E/M da mesma perícia coexistem)', () => {
  const fmBase = {
    Classe: '[[Guerreiro]]',
    'Nível': 5,
    Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    Pericias: {
      Lista: [
        {
          Nome: 'Atletismo',
          Atributo: 'FOR',
          Proficiencia: 'E',
          Bonus_Item: 0,
          Bonus_Especial: 0,
          Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
        },
      ],
    },
  }

  it('M futuro registrado aparece planejado mesmo com A/E reais já atribuídos', async () => {
    const fm = {
      ...fmBase,
      Planejamento: {
        gastosSlots: [
          { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
          { nivel: 7, tipo: 'pericia', rank: 'M', alvo: 'Atletismo' }, // futuro
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const g = (n: number) =>
      cards[n - 1]!.gastos.pericias.map((x) => `${x.nome}:${x.rank}${x.planejado ? '*' : ''}`)
    expect(g(1)).toContain('Atletismo:A')
    expect(g(4)).toContain('Atletismo:E')
    // o registro M NÃO pode ser deduplicado pelo A/E real da mesma perícia
    expect(g(7)).toContain('Atletismo:M*')
  })

  it('registroDe respeita o rank pedido (registro de outro rank não desvia o A)', async () => {
    const fm = {
      ...fmBase,
      Planejamento: {
        // E vem PRIMEIRO na lista — o lookup do A não pode casar com ele
        gastosSlots: [
          { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
          { nivel: 2, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const g = (n: number) => cards[n - 1]!.gastos.pericias.map((x) => `${x.nome}:${x.rank}`)
    expect(g(2)).toContain('Atletismo:A') // honra o registro A@2 (não earliest-fit N1)
    expect(g(4)).toContain('Atletismo:E')
  })
})

describe('#495 — registros duplicados de espec/maestria não multiplicam gastos', () => {
  const fm = {
    Classe: '[[Guerreiro]]',
    'Nível': 8,
    Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    Pericias: {
      Lista: [
        {
          Nome: 'Acrobacia',
          Atributo: 'AGI',
          Proficiencia: 'E',
          Bonus_Item: 0,
          Bonus_Especial: 0,
          Especializacao: '[[Estabilidade]]',
          Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
        },
      ],
    },
    Planejamento: {
      gastosSlots: [
        { nivel: 9, tipo: 'pericia', rank: 'M', alvo: 'Acrobacia' },
        // clique repetido gravou o MESMO alvo 3× (report ERRO REPETIÇÃO BASE FIRME)
        { nivel: 9, tipo: 'maestria', alvo: '[[Base Firme]]', contexto: 'Acrobacia' },
        { nivel: 9, tipo: 'maestria', alvo: '[[Base Firme]]', contexto: 'Acrobacia' },
        { nivel: 9, tipo: 'maestria', alvo: '[[Base Firme]]', contexto: 'Acrobacia' },
      ],
    },
  }

  it('o card mostra UM gasto planejado por alvo, não um por registro duplicado', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const baseFirme = cards[8]!.gastos.especialidades.filter((g) => g.alvo.includes('Base Firme'))
    expect(baseFirme).toHaveLength(1)
    expect(baseFirme[0]!.planejado).toBe(true)
  })

  it('sanitizarRegistros DROPA duplicatas exatas (auto-heal limpa o FM)', async () => {
    const { sanitizarRegistros } = await import('../src/rules/level-timeline')
    const cards = await buildLevelTimeline(fm, catalog, load)
    const { mudou, registros } = sanitizarRegistros(
      cards,
      (fm.Planejamento.gastosSlots as never[]) ?? [],
    )
    expect(mudou).toBe(true)
    expect(registros.filter((r) => String((r as { alvo: string }).alvo).includes('Base Firme'))).toHaveLength(1)
    // o registro de perícia legítimo fica intacto
    expect(registros.some((r) => (r as { alvo: string }).alvo === 'Acrobacia')).toBe(true)
  })
})

describe('#503 — pick de escolha irmã com gate FUTURO materializa no gate (ERRO CONGELANTE)', () => {
  it('Congelante via Escolha.03 (gate N3) leva habilidade E magias pro card 3', async () => {
    const base = JSON.parse(
      fs.readFileSync(path.join('tests/fixtures/heroes', 'Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>
    const habs = (base['Habilidades'] as { Lista: Array<Record<string, unknown>> }).Lista
    const fm = {
      ...base,
      Habilidades: {
        ...(base['Habilidades'] as Record<string, unknown>),
        Lista: [
          ...habs.filter((r) => !JSON.stringify(r).includes('Congelante')),
          // user limpou a essência do N1 e escolheu na do N3 (occ 03)
          { '[[Essência Congelante Adepta]]': 'Escolha.03.[[Círculo do Oceano (Água e Terra)]]' },
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const magias = (n: number) => cards[n - 1]!.magiasRegra.map((m) => m.link).join(' ')
    const habilidades = (n: number) => cards[n - 1]!.habilidades.join(' ')
    // NADA da Congelante no N1 (report 2026-08-26: "não selecionei uma
    // essencia que da essas magias nesse nivel")
    expect(habilidades(1)).not.toContain('Congelante')
    expect(magias(1)).not.toContain('Caminho de Gelo')
    expect(magias(1)).not.toContain('Frio Instantâneo')
    // tudo no gate da escolha (N3)
    expect(habilidades(3)).toContain('Congelante')
    expect(magias(3)).toContain('Caminho de Gelo')
    expect(magias(3)).toContain('Frio Instantâneo')
  })
})

describe('#505 — técnica PLANEJADA expõe as escolhas internas no card do nível futuro', () => {
  it('Treinamento de Classe Secundária planejado pro N5 abre a escolha "Classe Secundária" no card 5', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Planejamento: {
        gastosSlots: [
          { nivel: 5, tipo: 'tecnica', rank: 'A', alvo: '[[Treinamento de Classe Secundária]]' },
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const escolhasDe = (n: number) =>
      cards[n - 1]!.escolhas.map((e) => `${e.label}·${e.sourceNote}`)
    // a escolha interna da técnica planejada nasce NO NÍVEL DO PLANO…
    expect(escolhasDe(5)).toContain('Classe Secundária·Treinamento de Classe Secundária')
    // …e não antes (a técnica ainda não existe nos níveis 1..4)
    for (const n of [1, 2, 3, 4]) {
      expect(escolhasDe(n).join(' ')).not.toContain('Classe Secundária')
    }
  })
})

describe('#507 — maestria órfã (perícia sem especialidade) cai no auto-heal', () => {
  it('registro de maestria sem NENHUMA espec da perícia é dropado; com espec fica', async () => {
    const { sanitizarRegistros } = await import('../src/rules/level-timeline')
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 4,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Pericias: {
        Lista: [
          {
            Nome: 'Atletismo',
            Atributo: 'FOR',
            Proficiencia: 'E',
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
          },
        ],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    // maestria planejada @8 SEM espec em lugar nenhum (user tirou a espec)
    const { mudou, registros } = sanitizarRegistros(cards, [
      { nivel: 8, tipo: 'maestria', alvo: '[[Inércia]]', contexto: 'Atletismo' },
      { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
    ])
    expect(mudou).toBe(true)
    expect(registros.some((r) => r.alvo.includes('Inércia'))).toBe(false)
    expect(registros.some((r) => r.alvo === 'Atletismo')).toBe(true)
    // COM espec registrada, a maestria sobrevive
    const ok = sanitizarRegistros(cards, [
      { nivel: 4, tipo: 'especialidade', alvo: '[[Impulso]]', contexto: 'Atletismo' },
      { nivel: 8, tipo: 'maestria', alvo: '[[Inércia]]', contexto: 'Atletismo' },
    ])
    expect(ok.registros.some((r) => r.alvo.includes('Inércia'))).toBe(true)
  })
})

describe('#508 — magias SECUNDÁRIAS caem onde os slots secundários nascem (Simões)', () => {
  it('Escola Arcana Menor: gastos secundários não transbordam pro N10', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: {
        Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }],
      },
      Habilidades: {
        Lista: [
          { '[[Treinamento de Arcanista]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
          { '[[Escola Arcana Menor]]': 'Regra.[[Treinamento de Arcanista]]' },
          { '[[Escola Arcana Menor (Estudos do Vazio)]]': 'Escolha.[[Escola Arcana Menor]]' },
        ],
      },
      Magias: {
        Lista: [],
        Secundaria: {
          Lista: [
            {
              Nome: 'Arcana Negra',
              Proficiencia: 'A',
              Lista: [
                { '[[Choque Mental]]': 'Slot.B' },
                { '[[Drenar]]': 'Slot.B' },
                { '[[Aturdir]]': 'Slot.A' },
              ],
            },
          ],
        },
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const g = (n: number) =>
      cards[n - 1]!.gastos.magias.map((m) => `${m.link}:${m.rank}${m.secundaria ? '(2ª)' : ''}`)
    // NADA empilhado no N10 (report Simões 2026-08-26: "um monte de magia
    // selecionada aparentemente no nivel 10")
    expect(g(10)).toHaveLength(0)
    // os gastos caem no nível em que os slots SECUNDÁRIOS nascem (Estudos do
    // Vazio: B×2 + A×1 — sem gate de nível → N1)
    expect(g(1)).toContain('[[Choque Mental]]:B(2ª)')
    expect(g(1)).toContain('[[Drenar]]:B(2ª)')
    expect(g(1)).toContain('[[Aturdir]]:A(2ª)')
  })
})

describe('#509 — overflow de gastos sem slot cai no nível ATUAL, nunca no N10', () => {
  it('mais técnicas do que slots: excedente fica no nível do herói', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: {
        // 14 técnicas A — mais do que TODOS os slots de técnica do ladder do
        // Guerreiro (A + fungibilidade em E/M): o resto transborda
        Lista: Array.from({ length: 14 }, (_, i) => ({ [`[[Técnica Fictícia ${i}]]`]: 'Slot.A' })),
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    // O excedente sem slot pertence ao PRESENTE do herói (N3), não ao N10
    // (report Munro 2026-08-26: "magias sendo colocadas no nivel 10").
    expect(cards[9]!.gastos.tecnicas).toHaveLength(0)
    expect(cards[2]!.gastos.tecnicas.length).toBeGreaterThanOrEqual(2)
  })
})
