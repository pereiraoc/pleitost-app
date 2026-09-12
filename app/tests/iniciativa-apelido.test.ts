// @vitest-environment node
// NOME NA INICIATIVA (report 2026-09-12): "o nome dos personagens na parte de
// iniciativa tem que ser o Apelido, e se o apelido estiver vazio aí sim o nome
// completo". Diferente do nome da MESA, que encurta pro primeiro nome quando
// não há apelido (mesaApelidos/apelidoDe) — aqui o cheio.
import { describe, expect, it } from 'vitest'
import { nomeDeIniciativa } from '../src/data/session-repo/group-name'

describe('nome do combatente na iniciativa', () => {
  it('usa o Apelido da Biografia', () => {
    expect(nomeDeIniciativa('Carlos Facão de Andradas', { Biografia: { Apelido: 'Facão' } })).toBe('Facão')
  })

  it('apelido vazio (ou só espaço) cai no nome COMPLETO, não na primeira palavra', () => {
    expect(nomeDeIniciativa('Carlos Facão de Andradas', { Biografia: { Apelido: '  ' } })).toBe('Carlos Facão de Andradas')
    expect(nomeDeIniciativa('Carlos Facão de Andradas', { Biografia: {} })).toBe('Carlos Facão de Andradas')
    expect(nomeDeIniciativa('Kenji')).toBe('Kenji')
  })

  it('aceita o Apelido solto no FM (ficha antiga)', () => {
    expect(nomeDeIniciativa('Drauzio Variola', { Apelido: 'Drau' })).toBe('Drau')
  })
})
