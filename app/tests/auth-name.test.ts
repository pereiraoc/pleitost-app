// #291: nome exibível do usuário nunca pode ser string VAZIA (o `?? ` deixava
// passar '' de user_metadata.name, e '' viola o CHECK não-vazio do
// session_members no join). displayNameOf pega o 1º candidato com conteúdo.
import { describe, expect, it } from 'vitest'
import { displayNameOf } from '../src/data/session-repo/auth-state'

describe('displayNameOf (#291)', () => {
  it('usa user_metadata.name quando presente', () => {
    expect(displayNameOf({ user_metadata: { name: 'Ana' } })).toBe('Ana')
  })

  it('cai pra user_name quando name é vazio', () => {
    expect(displayNameOf({ user_metadata: { name: '', user_name: 'ana_gh' } })).toBe('ana_gh')
  })

  it('name/user_name vazios ou só espaço → Convidado (nunca string vazia)', () => {
    expect(displayNameOf({ user_metadata: { name: '', user_name: '   ' } })).toBe('Convidado')
    expect(displayNameOf({ user_metadata: {} })).toBe('Convidado')
    expect(displayNameOf(null)).toBe('Convidado')
    expect(displayNameOf(undefined)).toBe('Convidado')
  })
})
