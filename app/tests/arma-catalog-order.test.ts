// @vitest-environment node
// #298: no picker "+ Adicionar Arma" as armas NATURAIS e ESPECIAIS vinham
// primeiro (ordem crua do índice); devem ficar no FIM, com os grupos na ordem
// canônica (GRUPO_ARMA_ORDER) e alfabético dentro do grupo.
import { describe, expect, it } from 'vitest'
import { orderArmasByGrupo } from '../src/components/ficha/registry'

describe('orderArmasByGrupo (#298)', () => {
  it('grupos na ordem canônica: naturais e especiais por último', () => {
    const entries = [
      { grupo: 'natural', basename: 'Garra' },
      { grupo: 'especial', basename: 'Chicote de Espinhos' },
      { grupo: 'cac-simples', basename: 'Adaga' },
      { grupo: 'd-marcial', basename: 'Arco Longo' },
      { grupo: 'cac-marcial', basename: 'Espada Longa' },
    ]
    const out = orderArmasByGrupo(entries).map((e) => e.basename)
    expect(out).toEqual([
      'Adaga', // cac-simples
      'Espada Longa', // cac-marcial
      'Arco Longo', // d-marcial
      'Chicote de Espinhos', // especial
      'Garra', // natural (fim)
    ])
  })

  it('alfabético pt-BR dentro do mesmo grupo', () => {
    const entries = [
      { grupo: 'cac-simples', basename: 'Maça' },
      { grupo: 'cac-simples', basename: 'Adaga' },
      { grupo: 'cac-simples', basename: 'Ácido' },
    ]
    const out = orderArmasByGrupo(entries).map((e) => e.basename)
    expect(out).toEqual(['Ácido', 'Adaga', 'Maça'])
  })

  it('grupo desconhecido/vazio cai depois dos conhecidos (não é descartado)', () => {
    const entries = [
      { grupo: '', basename: 'Improvisada' },
      { grupo: 'natural', basename: 'Garra' },
      { grupo: 'cac-simples', basename: 'Adaga' },
    ]
    const out = orderArmasByGrupo(entries).map((e) => e.basename)
    // Adaga (conhecido) → Garra (natural, último conhecido) → Improvisada (desconhecido)
    expect(out).toEqual(['Adaga', 'Garra', 'Improvisada'])
    expect(out).toContain('Improvisada') // nunca some
  })
})
