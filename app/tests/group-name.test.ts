// Nome do grupo = apelidos dos heróis; sem apelido, a 1ª palavra do nome.
import { describe, expect, it } from 'vitest'
import { apelidoDe, composeGroupName } from '../src/data/session-repo/group-name'

describe('apelidoDe', () => {
  it('usa o Apelido do FM quando existe', () => {
    expect(apelidoDe('Carlos Facão de Andradas', { Apelido: 'Facão' })).toBe('Facão')
  })
  it('sem apelido → primeira palavra do nome', () => {
    expect(apelidoDe('Carlos Facão de Andradas')).toBe('Carlos')
    expect(apelidoDe('Dante')).toBe('Dante')
  })
  it('Apelido vazio/whitespace cai na 1ª palavra', () => {
    expect(apelidoDe('Mera da Costa', { Apelido: '   ' })).toBe('Mera')
    expect(apelidoDe('Pind Bund', { apelido: '' })).toBe('Pind')
  })
})

describe('composeGroupName', () => {
  it('junta os apelidos (Apelido quando há, senão 1ª palavra)', () => {
    const heroes = [
      { nome: 'Carlos Facão de Andradas', fmBlob: { Apelido: 'Facão' } },
      { nome: 'Dante' },
      { nome: 'Mera da Costa' },
      { nome: 'Pind Bund' },
    ]
    expect(composeGroupName(heroes)).toBe('Facão, Dante, Mera, Pind')
  })
  it('lista vazia → string vazia (pra cair no fallback do chamador)', () => {
    expect(composeGroupName([])).toBe('')
  })
})
