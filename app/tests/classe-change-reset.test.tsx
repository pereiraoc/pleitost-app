// @vitest-environment jsdom
// Bug: criar herói, escolher Bardo (caster), trocar pra Comandante (sem magia) —
// a aba MAGIAS continuava oferecendo magia, porque o estado ESCOLHIDO da classe
// anterior (proficiência de escola + magias aprendidas) fica MATERIALIZADO no FM
// e a projeção só re-deriva os grants da classe ATUAL, nunca limpando os antigos.
// Fix transversal: trocar de classe zera o estado escolhido específico da classe.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  classChangeResets,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
  setLocalEntityFm,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

describe('classChangeResets (fonte única do reset ao trocar de classe)', () => {
  it('zera magias (todas as escolas prof N), Sintonia, Habilidades.Lista, Tecnicas.Lista, Seletores', () => {
    const map = new Map(classChangeResets())
    const mag = map.get('Magias') as { Lista: { Proficiencia: string; Lista: unknown[] }[] }
    expect(mag.Lista.every((e) => e.Proficiencia === 'N')).toBe(true)
    expect(mag.Lista.every((e) => e.Lista.length === 0)).toBe(true)
    expect(map.get('Sintonia')).toBe('')
    expect(map.get('Habilidades.Lista')).toEqual([])
    expect(map.get('Tecnicas.Lista')).toEqual([])
    expect(map.get('Interativa.Seletores')).toEqual({})
    // NÃO reseta perícias/ofícios (compartilhados com o Passado) nem atributos
    expect(map.has('Pericias')).toBe(false)
    expect(map.has('Atributos')).toBe(false)
  })
})

describe('trocar Bardo→Comandante limpa a magia (integração UI)', () => {
  const classSelect = (): HTMLSelectElement =>
    ([...document.querySelectorAll('select')] as HTMLSelectElement[]).find((s) =>
      [...s.options].some((o) => /Bardo/i.test(o.textContent ?? '')),
    )!
  const optValue = (sel: HTMLSelectElement, re: RegExp) =>
    [...sel.options].find((o) => re.test(o.textContent ?? ''))?.value ?? ''
  const magiaVisivel = () => screen.queryAllByText(/Magias (Arcana|Anima)/)

  it('a aba MAGIAS some ao virar Comandante mesmo com magia salva como Bardo', async () => {
    const id = createLocalEntity('Heroi', 'Reset', { ...emptyHeroFrontmatter(), nome: 'Reset' })
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const sel = await waitFor(() => {
      const s = classSelect()
      expect(s).toBeTruthy()
      return s
    })
    fireEvent.change(sel, { target: { value: optValue(sel, /Bardo/) } })
    await waitFor(() => expect(magiaVisivel().length).toBeGreaterThan(0), { timeout: 4000 })
    // materializa estado de magia salvo (proficiência + magia aprendida), como
    // acontece ao interagir com a aba MAGIAS sendo Bardo.
    const mag = JSON.parse(JSON.stringify((getLocalDoc(id)!.frontmatter as Record<string, any>).Magias))
    mag.Lista[0].Proficiencia = 'E'
    mag.Lista[0].Lista = [{ '[[Toque Necrótico]]': 'Aprendida' }]
    setLocalEntityFm(id, 'Magias', mag)
    await waitFor(() => expect(magiaVisivel().length).toBeGreaterThan(0))
    // troca pra Comandante (sem magia)
    fireEvent.change(classSelect(), { target: { value: optValue(classSelect(), /Comandante/) } })
    await waitFor(() => expect(magiaVisivel().length).toBe(0), { timeout: 4000 })
    // e o estado salvo foi zerado (não fica magia órfã no FM)
    const magFinal = (getLocalDoc(id)!.frontmatter as Record<string, any>).Magias
    expect(magFinal.Lista.every((e: { Proficiencia: string }) => e.Proficiencia === 'N')).toBe(true)
  })
})
