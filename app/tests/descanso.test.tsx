// @vitest-environment jsdom
// DESCANSO (issue #227 — "não consigo dormir, não consigo descansar"): os
// botões Descansar/Dormir do painel RECUPERAÇÃO do Combate existiam como
// markup do design mas SEM comportamento. A mecânica é a do plugin
// pleitost-autosheet (acoes-descanso.ts:renderDescansoCol):
//   DESCANSAR — Moral→max, EM(+Secundária)→max, usos por minuto (`/min`,
//     `/10min`)→max, `cargas+1/10min`→+1, libera Encorajar (#182).
//     Vitalidade NÃO restaura; Moral Temporária preserva; Medicina mantém.
//   DORMIR — Vitalidade +6/9/12 EV (níveis 1/4/7, cap no max — regra
//     Recuperação #206), Moral→max, MoralTemp→0, EM→max, imunidades zeram,
//     usos→max e Cargas (Focos) DESCARREGAM (→0).
//
// ORÁCULO (padrão de topbar-em.test.tsx): Carlos REAL (nível 7, Vida 24/48,
// EM 4, Punhal+Relampejante 1/10min, Focos com cargas) com o FM salvo
// forçado a recursos DEPLETADOS — o teste dirige a UI e assere os valores
// restaurados no DOM (VidaBar, chip de vida e chip de EM da topbar, dots de
// uso da imbuição).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  buildDescansoUsoItems,
  descansarWrites,
  dormirWrites,
  type DescansoState,
} from '../src/components/ficha/descanso'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Carlos: nível 7 (Dormir = +12 EV), Vida 24/48, EM 4 (Bardo/Trovador),
// Punhal com Imbuição Relampejante (E, usos 1/10min) e Focos com cargas.
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

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

/** FM salvo do Carlos com recursos DEPLETADOS: vit 5/24, moral 10/48,
 *  temp +3, EM 0/4, imunidades ligadas e uso do Relampejante consumido. */
function depletedFm(fm: Record<string, any>): Record<string, any> {
  const inter = { ...(fm.Interativa ?? {}) } as Record<string, any>
  return {
    ...fm,
    Interativa: {
      ...inter,
      Recursos_Restantes: {
        Vitalidade: 5,
        Moral: 10,
        Moral_Temporaria: 3,
        EM: 0,
        EM_Secundaria: 0,
        Escudo_Dano: 0,
      },
      Imunidades: { Medicina: true, Encorajar: true },
      Usos_Recursos: { 'arma:Punhal|prop:Relampejante': 0 },
    },
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${CARLOS_ID}.json`) data.frontmatter = depletedFm(data.frontmatter)
        return data
      },
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Dots de uso (bolinhas 50%) do bloco da arma Punhal Relampejante (E). */
async function punhalDots(): Promise<HTMLElement[]> {
  const nome = await screen.findByText('Punhal Relampejante (E)')
  // span do nome → div da row → bloco da arma (contém a linha USOS).
  const bloco = nome.closest('div')!.parentElement!
  return [...bloco.querySelectorAll('span')].filter(
    (s) => (s as HTMLElement).style.borderRadius === '50%',
  ) as HTMLElement[]
}
const dotOn = (dot: HTMLElement) => /2f8f5b|47,\s*143,\s*91/.test(dot.style.background)

async function abrirDescanso(): Promise<void> {
  fireEvent.click(await screen.findByText('RECUPERAÇÃO'))
  await screen.findByText('DESCANSO')
}

describe('DESCANSO na ficha (issue #227) — tela', () => {
  it('Descansar restaura Moral + EM + usos por minuto; Vitalidade e Moral Temp ficam', async () => {
    renderCombate()
    // ANTES (depletado): VidaBar 5/24 e 10/48; chips topbar 18/72 e EM 0/4.
    expect(await screen.findByText('5 / 24')).toBeTruthy()
    expect(screen.getByText('10 / 48')).toBeTruthy()
    expect(screen.getByText('18/72')).toBeTruthy()
    expect(screen.getAllByText('0/4').length).toBeGreaterThan(0)
    expect((await punhalDots()).filter(dotOn).length).toBe(0) // uso consumido

    await abrirDescanso()
    fireEvent.click(screen.getByText('Descansar'))

    // DEPOIS: Moral 48/48 e EM 4/4 restauradas…
    await waitFor(() => expect(screen.getByText('48 / 48')).toBeTruthy())
    expect(screen.getAllByText('4/4').length).toBeGreaterThan(0)
    expect(screen.queryByText('0/4')).toBeNull()
    // …Vitalidade NÃO restaura, Moral Temporária preserva (chip 5+48+3=56/72)…
    expect(screen.getByText('5 / 24')).toBeTruthy()
    expect(screen.getByText('56/72')).toBeTruthy()
    // …e o uso 1/10min da imbuição volta ao máximo.
    expect((await punhalDots()).filter(dotOn).length).toBe(1)
  })

  it('Dormir soma 12 EV (nível 7, cap no max), zera Moral Temp e enche Moral + EM', async () => {
    renderCombate()
    expect(await screen.findByText('5 / 24')).toBeTruthy()
    expect(screen.getByText('18/72')).toBeTruthy()

    await abrirDescanso()
    fireEvent.click(screen.getByText('Dormir'))

    // Vitalidade 5+12=17 (não full refill!), Moral 48, temp 0 → chip 65/72.
    await waitFor(() => expect(screen.getByText('17 / 24')).toBeTruthy())
    expect(screen.getByText('48 / 48')).toBeTruthy()
    expect(screen.getByText('65/72')).toBeTruthy()
    expect(screen.getAllByText('4/4').length).toBeGreaterThan(0)
    expect(screen.queryByText('0/4')).toBeNull()
    // Uso da imbuição também volta ao máximo ao dormir.
    expect((await punhalDots()).filter(dotOn).length).toBe(1)
  })
})

/* ===================== unidade: regras portadas do plugin ===================== */

const doc = (id: string, fm: Record<string, unknown>): VaultDoc =>
  ({ id, frontmatter: fm }) as unknown as VaultDoc

describe('buildDescansoUsoItems espelha as keys de Usos_Recursos do app', () => {
  const relampejante = doc('imb', { usos: { adepto: '1/10min', experiente: '1/10min', mestre: '1/10min' } })
  // cargas como STRING — contrato atual de cargasPorTier (parseInt(str(v))).
  const focoRep = doc('foco', { cargas: { adepto: '4', experiente: '6', mestre: '8' } })
  const anelCanario = doc('anel', { usos: { adepto: '1/10min', experiente: '1/10min', mestre: '1/10min' } })
  const anelPassivo = doc('anel2', { usos: { adepto: 'passivo', experiente: 'passivo', mestre: 'passivo' } })
  const byBase: Record<string, VaultDoc> = {
    'Imbuição Relampejante': relampejante,
    'Foco da Repetição': focoRep,
    'Anel Canário': anelCanario,
    'Anel da Resistência': anelPassivo,
  }
  const refDoc = (value: unknown) => {
    const m = /\[\[([^\]|]+)/.exec(String(value ?? ''))
    return m ? byBase[(m[1].split('/').pop() ?? '').trim()] : undefined
  }
  const fm = {
    Inventario: {
      Armas: {
        Lista: [
          {
            Nome: '[[Punhal]]',
            Categoria: '[[Experiente]]',
            Propriedade: '[[Imbuição Relampejante|Relampejante]]',
          },
        ],
      },
      Tesouros: [
        '[[Foco da Repetição|Foco da Repetição (Adepto)]]',
        '[[Anel Canário|Anel Canário (Adepto)]]',
        '[[Anel da Resistência|Anel da Resistência (Adepto)]]', // passivo → fora
      ],
    },
  }

  it('gera arma:<nome>|prop:<prop> e tes:<nome>|tier:<T> (cargas → isCarga)', () => {
    const items = buildDescansoUsoItems(fm, refDoc)
    expect(items).toEqual([
      { key: 'arma:Punhal|prop:Relampejante', max: 1, freq: '1/10min' },
      { key: 'tes:Foco da Repetição|tier:A', max: 4, freq: 'Cargas', isCarga: true },
      { key: 'tes:Anel Canário|tier:A', max: 1, freq: '1/10min' },
    ])
  })
})

function baseState(over: Partial<DescansoState> = {}): DescansoState {
  return {
    vit: 5,
    vitMax: 24,
    moralMax: 48,
    emMax: 4,
    emSecMax: 0,
    nivel: 7,
    usos: {
      'arma:Punhal|prop:Relampejante': 0,
      'tes:Foco da Repetição|tier:A': 2,
      'hab:Fôlego': 0,
      'tes:Bastão|tier:A': 1,
      'Slot.B': 2,
    },
    usoItems: [
      { key: 'arma:Punhal|prop:Relampejante', max: 1, freq: '1/10min' },
      { key: 'tes:Foco da Repetição|tier:A', max: 4, freq: 'Cargas', isCarga: true },
      { key: 'hab:Fôlego', max: 2, freq: '1/dia' },
      { key: 'tes:Bastão|tier:A', max: 3, freq: 'cargas +1/10min' },
    ],
    ...over,
  }
}
const writesMap = (ws: [string, unknown][]) => Object.fromEntries(ws)

describe('descansarWrites — plugin acoes-descanso.ts:240-262', () => {
  it('restaura Moral/EM/EM_Secundaria, usos por minuto e libera só Encorajar', () => {
    const w = writesMap(descansarWrites(baseState({ emSecMax: 3 })))
    expect(w['Interativa.Recursos_Restantes.Moral']).toBe(48)
    expect(w['Interativa.Recursos_Restantes.EM']).toBe(4)
    expect(w['Interativa.Recursos_Restantes.EM_Secundaria']).toBe(3)
    // Vitalidade e Moral Temporária NÃO são tocadas; Medicina segue imune.
    expect(w).not.toHaveProperty('Interativa.Recursos_Restantes.Vitalidade')
    expect(w).not.toHaveProperty('Interativa.Recursos_Restantes.Moral_Temporaria')
    expect(w).not.toHaveProperty('Interativa.Imunidades.Medicina')
    expect(w['Interativa.Imunidades.Encorajar']).toBe(false)
    expect(w['Interativa.Usos_Recursos']).toEqual({
      'arma:Punhal|prop:Relampejante': 1, // 1/10min → max
      'tes:Foco da Repetição|tier:A': 2, // Cargas: intactas no Descansar
      'hab:Fôlego': 0, // 1/dia: NÃO restaura
      'tes:Bastão|tier:A': 2, // cargas+1/10min → +1 (cap max)
      'Slot.B': 2, // keys fora dos usoItems ficam intactas
    })
  })
})

describe('dormirWrites — plugin acoes-descanso.ts:274-304', () => {
  it('soma EV por nível (6/9/12 cap no max), zera temp, enche usos e descarrega cargas', () => {
    const w = writesMap(dormirWrites(baseState()))
    expect(w['Interativa.Recursos_Restantes.Vitalidade']).toBe(17) // 5+12 (nível 7)
    expect(w['Interativa.Recursos_Restantes.Moral']).toBe(48)
    expect(w['Interativa.Recursos_Restantes.Moral_Temporaria']).toBe(0)
    expect(w['Interativa.Recursos_Restantes.EM']).toBe(4)
    expect(w['Interativa.Imunidades.Medicina']).toBe(false)
    expect(w['Interativa.Imunidades.Encorajar']).toBe(false)
    expect(w['Interativa.Usos_Recursos']).toEqual({
      'arma:Punhal|prop:Relampejante': 1,
      'tes:Foco da Repetição|tier:A': 0, // Cargas descarregam ao dormir
      'hab:Fôlego': 2,
      'tes:Bastão|tier:A': 3,
      'Slot.B': 2,
    })
  })

  it('ganho de EV por nível: 6 (nv1-3), 9 (nv4-6), 12 (nv7+); cap no máximo', () => {
    const vitAfter = (nivel: number, vit = 5) =>
      writesMap(dormirWrites(baseState({ nivel, vit })))['Interativa.Recursos_Restantes.Vitalidade']
    expect(vitAfter(1)).toBe(11)
    expect(vitAfter(3)).toBe(11)
    expect(vitAfter(4)).toBe(14)
    expect(vitAfter(6)).toBe(14)
    expect(vitAfter(7)).toBe(17)
    expect(vitAfter(7, 20)).toBe(24) // cap em vitMax
  })
})
