// @vitest-environment jsdom
// #519 C6 — modo desenvolvedor ativa por SENHA no Config e pode ser
// desativado depois (a flag persiste em pleitost.settings.desenvolvedor).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach } from 'vitest'
import { ConfigPage } from '../src/components/config/ConfigPage'
import { MemoryRouter } from 'react-router-dom'
import { __resetThemeForTests } from '../src/theme'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
})
afterEach(cleanup)

describe('modo desenvolvedor por senha (C6)', () => {
  it('senha errada acusa; senha certa ativa; DESATIVAR desliga', async () => {
    render(
      <MemoryRouter>
        <ConfigPage />
      </MemoryRouter>,
    )
    const input = await screen.findByLabelText('Senha do modo desenvolvedor')
    fireEvent.change(input, { target: { value: 'errada' } })
    fireEvent.click(screen.getByText('ATIVAR'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('senha incorreta'))

    fireEvent.change(input, { target: { value: 'poa1987' } })
    fireEvent.click(screen.getByText('ATIVAR'))
    await waitFor(() => expect(screen.getByText('DESATIVAR')).toBeTruthy())
    expect(window.localStorage.getItem('pleitost.settings.desenvolvedor')).toBe('true')

    fireEvent.click(screen.getByText('DESATIVAR'))
    await waitFor(() => expect(screen.queryByText('DESATIVAR')).toBeNull())
    expect(window.localStorage.getItem('pleitost.settings.desenvolvedor')).toBe('false')
  })
})
