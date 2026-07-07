// @vitest-environment jsdom
// ENTIDADES LOCAIS (issues #42–#47): criar herói/grupo/pessoa/companheiro
// animal/monstro no navegador (a vault é read-only), aparecer nas listas,
// abrir a ficha e editar integrantes — tudo persistido no store local, com
// remonte simulando reload. Integração no padrão do repo: catálogo montado
// dos dados REAIS da vault, fetch stubado lê os JSONs do disco.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { DocPage } from '../src/components/compendium/DocPage'
import { GrupoView } from '../src/grupo/GrupoView'
import { groupMembers } from '../src/grupo/party'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyGroupFrontmatter,
  emptyHeroFrontmatter,
  getLocalDoc,
  resolveGroupMembers,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'

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
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  // Modo Mestre ON (issue #35) pra liberar o BESTIÁRIO nos testes de criação.
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** Sonda de rota: expõe o pathname atual pra asserção de navegação. */
function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

function renderApp(initial: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initial]}>
        <LocationProbe />
        <Routes>
          <Route path="/herois" element={<HeroisPage />} />
          <Route path="/npcs" element={<NpcsPage />} />
          <Route path="/heroi/*" element={<FichaPage />} />
          <Route path="/doc/*" element={<DocPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const loc = () => decodeURIComponent(screen.getByTestId('loc').textContent ?? '')

/** "Reload da página": desmonta e zera SÓ a memória dos stores. */
function simulaReload(r: ReturnType<typeof render>) {
  r.unmount()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
}

// ── #42: criar herói ──────────────────────────────────────────────────────
describe('#42 herói local', () => {
  it('skeleton tem a forma de um herói real (listas vazias, atributos 0)', () => {
    const id = createLocalEntity('Heroi', 'Zé Local', emptyHeroFrontmatter())
    const doc = getLocalDoc(id)!
    expect(doc.type).toBe('Criatura')
    expect(doc.subtype).toBe('Heroi')
    const fm = doc.frontmatter as Record<string, any>
    // mesma forma do herói real (Carlos): containers presentes, vazios
    expect(fm.Atributos).toEqual({ Principal: '', FOR: 0, AGI: 0, INT: 0, PRE: 0 })
    expect(fm.Inventario.Armas.Lista).toEqual([])
    expect(fm.Pericias.Lista).toEqual([])
    expect(fm.Papel).toEqual({ Lider: 0, Controlador: 0, Abatedor: 0, Vanguarda: 0 })
    expect(fm.Vida).toEqual({ Vitalidade: 0, Moral: 0 })
    expect(fm['Nível']).toBe(1)
  })

  it('"+ Criar Herói" cria e navega pra ficha, que renderiza sem erro', async () => {
    renderApp('/herois')
    fireEvent.click(await screen.findByRole('button', { name: '+ Criar Herói' }))
    await waitFor(() => expect(loc()).toMatch(/^\/heroi\/local:Heroi:/))
    // ficha carrega o herói local (sem o alerta "não encontrado")
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Carregando ficha…')).toBeNull()
  })

  it('herói local aparece na lista de HERÓIS e persiste no reload', async () => {
    createLocalEntity('Heroi', 'Herói Persistente', emptyHeroFrontmatter())
    const r = renderApp('/herois')
    expect(await screen.findByText('Herói Persistente')).toBeTruthy()
    // reload: memória zerada, mas o localStorage mantém a entidade
    simulaReload(r)
    renderApp('/herois')
    expect(await screen.findByText('Herói Persistente')).toBeTruthy()
  })
})

// ── #43/#44: grupo local + editar integrantes ─────────────────────────────
describe('#43/#44 grupo local + integrantes', () => {
  it('"+ Criar Grupo" cria grupo local e o abre com header editável', async () => {
    renderApp('/herois')
    // vai pra aba GRUPOS
    fireEvent.click(await screen.findByRole('button', { name: 'GRUPOS' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Criar Grupo' }))
    // nome editável no header do grupo (issue #43)
    const nome = (await screen.findByLabelText('Nome do grupo')) as HTMLInputElement
    expect(nome.value).toBe('Novo Grupo')
    fireEvent.change(nome, { target: { value: 'Os Bravos' } })
    expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Os Bravos')
  })

  it('grupo local: adicionar integrantes muda a contagem e persiste no reload', async () => {
    const gid = createLocalEntity('Grupo', 'Time Teste', emptyGroupFrontmatter())
    const alvo = catalog.content.find((e) => e.type === 'Criatura')!
    const r = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={gid} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    // começa com 0 integrantes
    expect(await screen.findByText('0 integrantes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Editar Integrantes' })
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${alvo.basename}`) }))
    await waitFor(() => expect(screen.getByText('1 integrantes')).toBeTruthy())
    // o membro resolvido bate com o esperado (store local)
    expect(resolveGroupMembers(catalog, gid).map((m) => m.id)).toEqual([alvo.id])

    // reload: a lista de membros persiste
    simulaReload(r)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={gid} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText('1 integrantes')).toBeTruthy()
  })

  it('grupo DA VAULT: override adiciona membro sem tocar a vault; agregados recomputam', async () => {
    const base = groupMembers(catalog, GROUP_ID)
    // criatura da vault que NÃO é membro do grupo
    const alvo = catalog.content.find(
      (e) => e.type === 'Criatura' && !base.some((m) => m.id === e.id),
    )!
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText(`${base.length} integrantes`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Editar Integrantes' })
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${alvo.basename}`) }))
    // contagem (agregado) recomputa na hora
    await waitFor(() => expect(screen.getByText(`${base.length + 1} integrantes`)).toBeTruthy())
    // resolver espelha o override: base + adicionado (sem duplicar)
    const resolved = resolveGroupMembers(catalog, GROUP_ID).map((m) => m.id)
    expect(resolved.length).toBe(base.length + 1)
    expect(resolved).toContain(alvo.id)

    // remover volta ao original (toggle no membro já marcado)
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${alvo.basename}`) }))
    await waitFor(() => expect(screen.getByText(`${base.length} integrantes`)).toBeTruthy())
  })
})

// ── #45: pessoa ────────────────────────────────────────────────────────────
describe('#45 pessoa local', () => {
  it('formulário cria pessoa que entra na lista e mostra os campos na abertura', async () => {
    renderApp('/npcs')
    // PESSOAS é a primeira aba; abre o formulário
    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar Pessoa' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Comerciante Dão' } })
    fireEvent.change(screen.getByLabelText('Relação'), { target: { value: 'Negócios' } })
    fireEvent.change(screen.getByLabelText('Organização'), { target: { value: 'Guilda dos Mercadores' } })
    fireEvent.change(screen.getByLabelText('Detalhes'), { target: { value: 'Vende raridades.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    // aparece na lista (antes era o empty state)
    const card = await screen.findByText('Comerciante Dão')
    // abre a pessoa: rota de doc, com os campos renderizados (inline fields)
    fireEvent.click(card)
    await waitFor(() => expect(loc()).toMatch(/^\/doc\/local:Pessoa:/))
    expect(screen.getByText('Guilda dos Mercadores')).toBeTruthy()
    expect(screen.getByText('Negócios')).toBeTruthy()
  })
})

// ── #46/#47: companheiro animal + monstro ─────────────────────────────────
describe('#46/#47 companheiro animal + monstro', () => {
  it('CA local tem família CompanheiroAnimal (Tutor) e abre a ficha', async () => {
    renderApp('/npcs')
    fireEvent.click(await screen.findByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar Companheiro Animal' }))
    await waitFor(() => expect(loc()).toMatch(/^\/heroi\/local:CompanheiroAnimal:/))
    expect(screen.queryByRole('alert')).toBeNull()
    // o skeleton carrega o campo Tutor da família CA
    const id = decodeURIComponent(loc().replace('/heroi/', ''))
    expect(getLocalDoc(id)!.frontmatter).toHaveProperty('Tutor')
  })

  it('monstro local usa Tier/Raça (família Monstro) e abre a ficha', async () => {
    renderApp('/npcs')
    fireEvent.click(await screen.findByRole('button', { name: 'BESTIÁRIO' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar Criatura' }))
    await waitFor(() => expect(loc()).toMatch(/^\/heroi\/local:Monstro:/))
    expect(screen.queryByRole('alert')).toBeNull()
    const id = decodeURIComponent(loc().replace('/heroi/', ''))
    const fm = getLocalDoc(id)!.frontmatter as Record<string, any>
    expect(fm.Tier).toBe(0)
    expect(fm).toHaveProperty('Raça')
    expect(fm).not.toHaveProperty('Nível')
  })
})
