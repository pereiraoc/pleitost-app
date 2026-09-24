// FILTRO POR PAPEL no passo de Classe (2026-09-23) — lógica PURA.
// Fonte dos totais: regras (`Somar Papel` da classe + da opção de subclasse +
// `Condicional Sintonia` da classe), nunca o bloco de texto class-roles.
import { describe, expect, it } from 'vitest'
import {
  complementaresNivel1,
  entradasPorPapel,
  escolhasSemPapel,
  niveisDeCombo,
  opcoesSelecionar,
  sintoniasDoNivel,
  variantesDePapel,
} from '../src/components/wizard/class-roles-preview'

const alvos = (combos: { picks: { alvo: string }[] }[], depth: number) =>
  niveisDeCombo(combos, depth).map((n) => n.alvo)

const SINTONIAS = [
  'Traço Elemental da Água',
  'Traço Elemental da Terra',
  'Traço Elemental do Fogo',
  'Traço Elemental do Vento',
]

describe('parse das escolhas de nível 1', () => {
  it('complementaresNivel1: só Habilidades.Lista de Nivel 1', () => {
    expect(
      complementaresNivel1([
        'Nivel 1 Alias Classe Compor 0 "Arcanista"',
        'Nivel 1 Complementar Habilidades.Lista [[Evolução Básica]]',
        'Nivel 1 Complementar Habilidades.Lista [[Escola Arcana]]',
        'Nivel 4 Complementar Habilidades.Lista [[Arcanologista]]',
        'Nivel 1 Complementar Inventario.Armas.Proficiencia.Especificas [[Punhal]]',
      ]),
    ).toEqual(['Evolução Básica', 'Escola Arcana'])
    expect(complementaresNivel1(undefined)).toEqual([])
  })

  it('opcoesSelecionar: alvos do Selecionar (…) — [] quando a nota não é escolha', () => {
    expect(
      opcoesSelecionar([
        'Complementar Habilidades.Lista Selecionar ([[Escola Arcana (Estudos do Vazio)]], [[Escola Arcana (Aplicações da Luz)|Luz]])',
      ]),
    ).toEqual(['Escola Arcana (Estudos do Vazio)', 'Escola Arcana (Aplicações da Luz)'])
    expect(opcoesSelecionar(['Somar Papel.Lider 1'])).toEqual([])
  })
})

describe('variantesDePapel + entradasPorPapel', () => {
  it('Guerreiro: Abatedor ★★★ com Arcos/Bestas e ★ com o resto; Líder não aparece', () => {
    const variantes = variantesDePapel({
      somaClasse: { Abatedor: 1 },
      somaSintonia: new Map(),
      escolhas: [
        {
          parent: 'Especialização em Arma',
          opcoes: [
            { alvo: 'Especialização em Arma (Arcos)', soma: { Abatedor: 2 } },
            { alvo: 'Especialização em Arma (Bestas)', soma: { Abatedor: 2 } },
            { alvo: 'Especialização em Arma (Lâminas)', soma: { Vanguarda: 2 } },
          ],
        },
      ],
      sintonias: SINTONIAS,
    })
    expect(variantes).toHaveLength(3)
    const abatedor = entradasPorPapel(variantes, 'Abatedor')
    expect(abatedor.map((e) => e.estrelas)).toEqual([3, 1])
    expect(alvos(abatedor[0]!.combos, 0)).toEqual([
      'Especialização em Arma (Arcos)',
      'Especialização em Arma (Bestas)',
    ])
    expect(niveisDeCombo(abatedor[0]!.combos, 0)[0]!.parent).toBe('Especialização em Arma')
    expect(alvos(abatedor[1]!.combos, 0)).toEqual(['Especialização em Arma (Lâminas)'])
    expect(entradasPorPapel(variantes, 'Vanguarda').map((e) => e.estrelas)).toEqual([2])
    expect(entradasPorPapel(variantes, 'Líder')).toEqual([])
  })

  it('Bardo: duas escolhas combinam (Líder ★★★ só Inspirador + Arte Mágica)', () => {
    const variantes = variantesDePapel({
      somaClasse: { Líder: 1 },
      somaSintonia: new Map(),
      escolhas: [
        {
          parent: 'Método Artístico',
          opcoes: [
            { alvo: 'Método Artístico (Inspirador)', soma: { Líder: 1 } },
            { alvo: 'Método Artístico (Manipulador)', soma: { Controlador: 1 } },
          ],
        },
        {
          parent: 'Estilo de Combate',
          opcoes: [
            { alvo: 'Estilo de Combate (Arte Mágica)', soma: { Líder: 1 } },
            { alvo: 'Estilo de Combate (Luta Artística)', soma: { Abatedor: 1 } },
          ],
        },
      ],
      sintonias: SINTONIAS,
    })
    expect(variantes).toHaveLength(4)
    const lider = entradasPorPapel(variantes, 'Líder')
    expect(lider.map((e) => e.estrelas)).toEqual([3, 2, 1])
    // ★★★: só Inspirador → Arte Mágica
    expect(alvos(lider[0]!.combos, 0)).toEqual(['Método Artístico (Inspirador)'])
    expect(alvos(niveisDeCombo(lider[0]!.combos, 0)[0]!.filhos, 1)).toEqual(['Estilo de Combate (Arte Mágica)'])
    // ★★: Inspirador → Luta Artística e Manipulador → Arte Mágica — nunca cruzado
    const n2 = niveisDeCombo(lider[1]!.combos, 0)
    expect(n2.map((n) => n.alvo)).toEqual(['Método Artístico (Inspirador)', 'Método Artístico (Manipulador)'])
    expect(alvos(n2[0]!.filhos, 1)).toEqual(['Estilo de Combate (Luta Artística)'])
    expect(alvos(n2[1]!.filhos, 1)).toEqual(['Estilo de Combate (Arte Mágica)'])
    // ★: Manipulador → Luta Artística
    expect(alvos(lider[2]!.combos, 0)).toEqual(['Método Artístico (Manipulador)'])
    // Controlador só com Manipulador (★), nos dois estilos
    const ctrl = entradasPorPapel(variantes, 'Controlador')
    expect(ctrl.map((e) => e.estrelas)).toEqual([1])
    expect(alvos(niveisDeCombo(ctrl[0]!.combos, 0)[0]!.filhos, 1)).toEqual([
      'Estilo de Combate (Arte Mágica)',
      'Estilo de Combate (Luta Artística)',
    ])
  })

  it('Druida: o Círculo não soma papel (não multiplica, fica listado à parte); a Tradição decide', () => {
    const escolhas = [
      {
        parent: 'Círculo Druídico',
        opcoes: [
          { alvo: 'Círculo do Sol (Fogo e Terra)', soma: {} },
          { alvo: 'Círculo da Lua (Água e Vento)', soma: {} },
        ],
      },
      {
        parent: 'Tradição Druídica',
        opcoes: [
          { alvo: 'Tradição Druídica (Guardião)', soma: { Abatedor: 1 } },
          { alvo: 'Tradição Druídica (Xamã)', soma: { Controlador: 1 } },
        ],
      },
    ]
    const variantes = variantesDePapel({
      somaClasse: { Vanguarda: 1, Controlador: 1 },
      somaSintonia: new Map(),
      escolhas,
      sintonias: SINTONIAS,
    })
    expect(variantes).toHaveLength(2)
    const ctrl = entradasPorPapel(variantes, 'Controlador')
    expect(ctrl.map((e) => e.estrelas)).toEqual([2, 1])
    expect(alvos(ctrl[0]!.combos, 0)).toEqual(['Tradição Druídica (Xamã)'])
    expect(alvos(ctrl[1]!.combos, 0)).toEqual(['Tradição Druídica (Guardião)'])
    expect(alvos(entradasPorPapel(variantes, 'Abatedor')[0]!.combos, 0)).toEqual(['Tradição Druídica (Guardião)'])
    expect(escolhasSemPapel(escolhas).map((e) => e.parent)).toEqual(['Círculo Druídico'])
  })

  it('Monge: a sintonia é a variante (Vanguarda ★★★ Fogo/Terra, ★★ Água/Vento)', () => {
    const variantes = variantesDePapel({
      somaClasse: { Vanguarda: 2 },
      somaSintonia: new Map([
        ['Traço Elemental do Fogo', { Vanguarda: 1 }],
        ['Traço Elemental da Terra', { Vanguarda: 1 }],
        ['Traço Elemental da Água', { Controlador: 1 }],
        ['Traço Elemental do Vento', { Abatedor: 1 }],
      ]),
      escolhas: [],
      sintonias: SINTONIAS,
    })
    expect(variantes).toHaveLength(4)
    const vang = entradasPorPapel(variantes, 'Vanguarda')
    expect(vang.map((e) => e.estrelas)).toEqual([3, 2])
    expect(sintoniasDoNivel(vang[0]!.combos, 0)).toEqual(['Traço Elemental da Terra', 'Traço Elemental do Fogo'])
    expect(sintoniasDoNivel(vang[1]!.combos, 0)).toEqual(['Traço Elemental da Água', 'Traço Elemental do Vento'])
    expect(sintoniasDoNivel(entradasPorPapel(variantes, 'Controlador')[0]!.combos, 0)).toEqual(['Traço Elemental da Água'])
  })
})
