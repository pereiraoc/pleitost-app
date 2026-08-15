// Materialização do alias composto no FM salvo (bug da LISTA: Carlos
// "Trovador" com a ficha já "Menestrel") — matriz da decisão pura.
import { describe, expect, it } from 'vitest'
import { aliasParaMaterializar } from '../src/components/ficha/materialize-alias'

const LOCAL = 'local:Heroi:abc'
const SALVO = '[[Bardo|Trovador Inspirador de Luta Artística]]'
const NOVO = '[[Bardo|Menestrel Inspirador de Luta Artística]]'

describe('aliasParaMaterializar', () => {
  it('herói local + projeção fresca + mesmo target + display novo → grava', () => {
    expect(aliasParaMaterializar(LOCAL, SALVO, NOVO, false)).toBe(NOVO)
  })
  it('doc da VAULT nunca grava (read-only)', () => {
    expect(aliasParaMaterializar('Sistema/Criaturas/Heróis/Carlos', SALVO, NOVO, false)).toBeNull()
  })
  it('projeção STALE (classe recém-trocada) não grava o alias da anterior', () => {
    expect(aliasParaMaterializar(LOCAL, SALVO, NOVO, true)).toBeNull()
  })
  it('target diferente (trocou de classe) nunca reescreve', () => {
    expect(aliasParaMaterializar(LOCAL, '[[Mago]]', NOVO, false)).toBeNull()
  })
  it('já igual → nada (convergência em um write)', () => {
    expect(aliasParaMaterializar(LOCAL, NOVO, NOVO, false)).toBeNull()
  })
  it('sem classe salva ou sem derivado → nada', () => {
    expect(aliasParaMaterializar(LOCAL, '', NOVO, false)).toBeNull()
    expect(aliasParaMaterializar(LOCAL, SALVO, '', false)).toBeNull()
  })
})
