// @vitest-environment jsdom
// Eixo WORLD (#519 C1): o mundo deriva do contexto do tema (fonte única);
// default fantasia; onWorldChange dispara SÓ em troca de mundo.
import { beforeEach, describe, expect, it } from 'vitest'
import { activeWorld, onWorldChange, WORLD_DATA_DIR } from '../src/data/world'
import {
  dataDirFor,
  setWorldDataset,
  worldDatasetDisponivel,
  __resetWorldDatasetForTests,
} from '../src/data/world-dataset'
import { getThemeSnapshot, useTheme, __resetThemeForTests } from '../src/theme'
import { renderHook, act } from '@testing-library/react'

beforeEach(() => {
  window.localStorage?.clear?.()
  __resetThemeForTests()
  __resetWorldDatasetForTests()
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('world (C1)', () => {
  it('default fantasia e segue o contexto do tema', () => {
    expect(activeWorld()).toBe('fantasia')
    setContext('cyberpunk')
    expect(activeWorld()).toBe('cyberpunk')
    expect(getThemeSnapshot().context).toBe('cyberpunk')
  })

  it('onWorldChange dispara só em TROCA de mundo, com o anterior', () => {
    const trocas: Array<[string, string]> = []
    const off = onWorldChange((w, de) => trocas.push([w, de]))
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark')) // mudança de tema SEM troca de mundo
    expect(trocas).toHaveLength(0)
    act(() => result.current.setContext('cyberpunk'))
    expect(trocas).toEqual([['cyberpunk', 'fantasia']])
    off()
    act(() => result.current.setContext('fantasia'))
    expect(trocas).toHaveLength(1) // unsubscribed
  })

  it('dataDirFor: fantasia sempre no dataset base; cyberpunk cai no mundo só com rel registrado', () => {
    expect(dataDirFor('index.json')).toBe(WORLD_DATA_DIR.fantasia)
    setContext('cyberpunk')
    // sem dataset registrado → fallback total
    expect(dataDirFor('Sistema/X.json')).toBe(WORLD_DATA_DIR.fantasia)
    expect(worldDatasetDisponivel()).toBe(false)
    setWorldDataset('cyberpunk', ['Sistema/X.json', 'assets/Mapa de Porto Alegre RPG.png'])
    expect(dataDirFor('Sistema/X.json')).toBe(WORLD_DATA_DIR.cyberpunk)
    // rel ENCODADO resolve igual (call sites encodam por segmento)
    expect(dataDirFor('assets/Mapa%20de%20Porto%20Alegre%20RPG.png')).toBe(WORLD_DATA_DIR.cyberpunk)
    // ausente no dataset do mundo → fallback fantasia (decisão: imagem/doc)
    expect(dataDirFor('Sistema/Y.json')).toBe(WORLD_DATA_DIR.fantasia)
    expect(worldDatasetDisponivel()).toBe(true)
    // de volta pra fantasia, o registro do mundo não interfere
    setContext('fantasia')
    expect(dataDirFor('Sistema/X.json')).toBe(WORLD_DATA_DIR.fantasia)
  })
})
