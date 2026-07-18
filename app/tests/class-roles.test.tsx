// @vitest-environment jsdom
// #276: bloco ```class-roles``` das notas de Classe — antes o JSON cru vazava num
// <pre> feio; agora vira a caixa de papéis (nome + ★×peso na cor do papel),
// espelhando o pleitost-views. Parser + render sobre o conteúdo REAL do Animista.
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { parseClassRolesSource } from '../src/markdown/class-roles/parse'
import { ClassRolesFence } from '../src/markdown/class-roles/ClassRolesFence'
import { FenceFallback } from '../src/markdown/fence-registry'
import type { VaultDoc } from '../src/data/types'

const ANIMISTA = `["Animista (Fogo/Vento)", { "Controlador": 2, "Abatedor": 1 }],
["Animista (Água/Terra)", { "Controlador": 2, "Líder": 1 }]`

const stubDoc = { id: 'x', basename: 'x' } as unknown as VaultDoc

describe('parseClassRolesSource (#276)', () => {
  it('lê as entradas [nome, {papel: peso}] do corpo do Animista', () => {
    const builds = parseClassRolesSource(ANIMISTA)
    expect(builds.length).toBe(2)
    expect(builds[0][0]).toBe('Animista (Fogo/Vento)')
    expect(builds[0][1]).toEqual({ Controlador: 2, Abatedor: 1 })
    expect(builds[1][1]).toEqual({ Controlador: 2, Líder: 1 })
  })

  it('aceita com ou sem colchetes externos; vazio → []', () => {
    expect(parseClassRolesSource(`[${ANIMISTA}]`).length).toBe(2)
    expect(parseClassRolesSource('   ')).toEqual([])
  })

  it('role desconhecido → erro (não inventa)', () => {
    expect(() => parseClassRolesSource('["X", { "Nadador": 3 }]')).toThrow(/Role desconhecido/)
  })

  // Feedback do mestre: a seção "## Líderes" de Classes.md termina com VÍRGULA
  // SOBRANDO (e linha em branco) — JSON.parse estrito rejeitava e a fence mostrava
  // o erro em vez da tabela ("não ta mostrando os líderes"). Deve tolerar.
  it('tolera vírgula sobrando no fim (seção Líderes de Classes.md)', () => {
    const LIDERES = `["Arcanista Espiritualista", { "Líder": 3 }],
["Comandante Estrategista", { "Líder": 3 }],
["Comandante Combatente", { "Vanguarda": 1, "Líder": 2 }],

`
    const builds = parseClassRolesSource(LIDERES)
    expect(builds.length).toBe(3)
    expect(builds[0]![0]).toBe('Arcanista Espiritualista')
    expect(builds[2]![1]).toEqual({ Vanguarda: 1, Líder: 2 })
  })

  it('tolera vírgula sobrando antes do colchete de fechamento', () => {
    expect(parseClassRolesSource('[["X", { "Líder": 2 }], ]').length).toBe(1)
  })
})

describe('ClassRolesFence (#276) — render', () => {
  it('mostra os papéis com ★×peso, não o JSON cru', () => {
    const { container } = render(<ClassRolesFence lang="class-roles" code={ANIMISTA} doc={stubDoc} />)
    const txt = container.textContent ?? ''
    expect(txt).toContain('Animista (Fogo/Vento)')
    expect(txt).toContain('Controlador')
    expect(txt).toContain('Abatedor')
    expect(txt).toContain('Líder')
    // ★ por peso: Controlador 2 → "★★"
    expect(txt).toContain('★★')
    // não vaza o JSON cru
    expect(txt).not.toContain('"Controlador":')
    expect(container.querySelector('pre')).toBeNull()
    // cor do papel (Líder verde #4ade80) aplicada em algum span
    const colored = [...container.querySelectorAll<HTMLElement>('span')].some(
      (s) => s.style.color === 'rgb(74, 222, 128)',
    )
    expect(colored).toBe(true)
  })

  it('conteúdo vazio → nada (sem caixa)', () => {
    const { container } = render(<ClassRolesFence lang="class-roles" code="" doc={stubDoc} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('FenceFallback (#276) — fence desconhecido VAZIO some', () => {
  it('code vazio → null (sem <pre> vazio)', () => {
    const { container } = render(<FenceFallback lang="qualquer" code="" doc={stubDoc} />)
    expect(container.firstChild).toBeNull()
  })
  it('code com conteúdo → <pre> normal', () => {
    const { container } = render(<FenceFallback lang="qualquer" code="oi" doc={stubDoc} />)
    expect(container.querySelector('pre')?.textContent).toBe('oi')
  })
})
