// @vitest-environment jsdom
// FORMATO DE AVENTURA (F1.5/F2/F4) — sobre a Pós Grenal REAL (fixture .md
// congelada, cifrada pelo extractor de verdade): (1) trancada → só chamada +
// campos da lista, senha errada/certa, dev destrava; (2) grade: card trancado
// SEM o título do bounty; (3) destravada → página por seção com registros,
// chips que expandem o registro ali mesmo, cenas com combates; (4) PREPARAR
// cria um encounter `prepared` na sessão InMemory com sourceNotePath por cena,
// sem duplicar; (5) Iniciar na sessão grava state.aventura e marcar cena.
import { useEffect } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { cifrarDoc } from '../../extractor/cifra-doc.mjs'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession, getLiveSession } from '../src/data/session-repo/live-session'
import { __resetDocLocksForTests, setDevSenha, unlockWithSenha } from '../src/data/doc-lock'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSettingsForTests, useSettings } from '../src/settings'
import { compendiumFolderPath } from '../src/paths'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest

// A Pós Grenal (POA) entra no catálogo de teste como se fosse da vault-data
// fantasia — o parser/render não sabem de mundo; o que importa é o formato.
const ID = 'Campanhas/Aventuras/Pós Grenal'
const raw = fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }
const record = {
  id: ID,
  path: `${ID}.md`,
  basename: 'Pós Grenal',
  type: 'Aventura',
  subtype: String(frontmatter['subcategoria']),
  grupo: null,
  frontmatter,
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [],
  headings: [],
  body,
}
const CAMPOS = ['Chamada', 'rank', 'Formato', 'Duração', 'Jogadores', 'Tom']
const CIFRADO = cifrarDoc(record, { camposPublicos: CAMPOS, senhaDev: 'dev-teste' }) as unknown as VaultDoc
const entry: IndexDocEntry = { id: ID, path: `${ID}.md`, kind: 'content', basename: 'Pós Grenal', type: 'Aventura', subtype: null, protegido: true }
const catalog = buildCatalog({ ...manifest, docs: [...manifest.docs, entry] })

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    if (rel === `${ID}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(CIFRADO)) }
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  __resetLocalStoreForTests()
  __resetDocLocksForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function mestreOn() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}
function DevOn() {
  const { setDesenvolvedor } = useSettings()
  useEffect(() => setDesenvolvedor(true), [setDesenvolvedor])
  return null
}

function renderDoc(opts: { repo?: InMemorySessionRepo; dev?: boolean } = {}) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={opts.repo ?? null} user={opts.repo ? { id: 'gm-1', nome: 'Mestre' } : null}>
        <MemoryRouter initialEntries={[`/doc/${ID}`]}>
          {opts.dev ? <DevOn /> : null}
          <Routes>
            <Route path="/doc/*" element={<DocPage />} />
          </Routes>
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

async function destravar() {
  const input = await screen.findByLabelText('Senha da aventura')
  fireEvent.change(input, { target: { value: 'poa1987grenal' } })
  fireEvent.click(screen.getByRole('button', { name: 'DESTRAVAR' }))
  await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
}

describe('aventura TRANCADA (senha por aventura)', () => {
  it('mostra só chamada + campos da lista trancada; nada do bounty/roteiro', async () => {
    mestreOn()
    const { container } = renderDoc()
    expect(await screen.findByText(/Uma noite de Gre-Nal em Porto Alegre/)).toBeTruthy()
    const txt = container.textContent ?? ''
    expect(txt).toContain('One-Shot')
    expect(txt).toContain('3h a 4h30')
    expect(txt).not.toContain('Recuperação de Carga') // título do bounty = spoiler
    expect(txt).not.toContain('Cápsula-Matriz')
    expect(txt).not.toContain('Brum')
    expect(document.querySelector('[data-doc-lock]')).toBeTruthy()
  })

  it('senha errada avisa; senha certa abre a página por seção', async () => {
    mestreOn()
    renderDoc()
    const input = await screen.findByLabelText('Senha da aventura')
    fireEvent.change(input, { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'DESTRAVAR' }))
    expect((await screen.findByRole('alert')).textContent).toContain('senha incorreta')
    await destravar()
    expect(screen.getByRole('heading', { level: 1, name: 'Pós Grenal' })).toBeTruthy()
    expect(await screen.findByText('Recuperação de Carga do Consórcio das Bandeiras')).toBeTruthy()
    // lembrado neste aparelho → chave persistida
    expect(JSON.parse(window.localStorage.getItem('pleitost.docLocks')!)).toHaveProperty(ID)
  })

  it('Modo Desenvolvedor destrava sem senha (chave do dev guardada no Config)', async () => {
    mestreOn()
    await setDevSenha('dev-teste')
    renderDoc({ dev: true })
    await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
    expect(document.querySelector('[data-doc-lock]')).toBeNull()
  })

  it('a grade mostra a aventura como card TRANCADO, sem título do bounty', async () => {
    mestreOn()
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[compendiumFolderPath('Campanhas/Aventuras')]}>
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const card = await waitFor(() => {
      const el = document.querySelector('[data-aventura-trancada]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    })
    expect(card.textContent).toContain('Pós Grenal')
    expect(card.textContent).toContain('🔒')
    expect(card.textContent).toContain('Uma noite de Gre-Nal')
    expect(card.textContent).not.toContain('Recuperação de Carga')
    // as da fantasia seguem como carta de bounty normal
    expect(await screen.findByText('Neutralização de Fenda Negra')).toBeTruthy()
  })
})

describe('página por seção (formato de aventura)', () => {
  beforeEach(async () => {
    mestreOn()
    await unlockWithSenha(CIFRADO, 'poa1987grenal', false)
  })

  it('renderiza as 5 seções, estrutura do FM, registros e cenas com combates', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-formato]')).toBeTruthy())
    for (const id of ['av-resumo', 'av-contexto', 'av-personagens', 'av-locais', 'av-cenas']) {
      expect(container.querySelector(`#${id}`), id).toBeTruthy()
    }
    // estrutura lida do FM + contagens derivadas
    const est = container.querySelector('[data-av-estrutura]') as HTMLElement
    expect(est.textContent).toContain('3h a 4h30')
    expect(est.textContent).toContain('JOGADORES4') // {min:4,max:4} → fmtAmount = "4"
    expect(container.querySelector('[data-av-totais]')!.textContent).toContain('6 cenas')
    expect(container.querySelector('[data-av-totais]')!.textContent).toContain('2 combates')
    // 7 personagens, 9 locais (o Mapa não é registro)
    expect(container.querySelectorAll('#av-personagens [data-av-registro]').length).toBe(7)
    expect(container.querySelectorAll('#av-locais [data-av-registro]').length).toBe(9)
    // registro do Arlindo: Papel como campo, Frases em balões, 🔊 e segredo
    const arlindo = container.querySelector('[data-av-registro="Arlindo “Bomba” Fagundes"]') as HTMLElement
    expect(within(arlindo).getByText('PAPEL')).toBeTruthy()
    expect(arlindo.querySelectorAll('[data-av-frases] .av-frase').length).toBe(3)
    expect(arlindo.querySelectorAll('[data-av-leitura]').length).toBe(1)
    expect(arlindo.querySelectorAll('[data-av-segredo]').length).toBe(1)
    // mapa e link de impressão
    expect(container.querySelector('[data-av-mapa]')).toBeTruthy()
    expect(container.querySelector('[data-av-imprimir-mapa]')?.getAttribute('href')).toContain('/papel/mapa/')
    // cenas: 6, a 1ª aberta por padrão; a 6ª fechada até clicar
    expect(container.querySelectorAll('[data-av-cena]').length).toBe(6)
    expect(container.querySelector('[data-av-cena="1"] .av-cena-body')).toBeTruthy()
    expect(container.querySelector('[data-av-cena="6"] .av-cena-body')).toBeNull()
    fireEvent.click(within(container.querySelector('[data-av-cena="6"]') as HTMLElement).getByRole('button', { name: /Retífica Sertório/ }))
    await waitFor(() => expect(container.querySelectorAll('[data-av-cena="6"] [data-av-combate]').length).toBe(2))
    const f1 = container.querySelector('[data-av-cena="6"] [data-av-combate="1"]') as HTMLElement
    expect(f1.textContent).toContain('Fase 1')
    expect(f1.textContent).toContain('Arruaceiro')
  })

  it('chip de Local/Personagem da cena expande o registro ali mesmo', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-cena="1"] .av-cena-body')).toBeTruthy())
    const cena1 = container.querySelector('[data-av-cena="1"]') as HTMLElement
    const local = within(cena1).getByText('Estádio Beira-Rio e entorno')
    // fechado: o registro não está renderizado dentro da cena
    expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"]')).toBeNull()
    fireEvent.click(local)
    await waitFor(() => expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"]')).toBeTruthy())
    // e o 🔊 do local aparece dentro da cena
    expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"] [data-av-leitura]')!.textContent).toContain('apito final')
    const pers = within(cena1).getByText('Sargento Valdir Brum')
    fireEvent.click(pers)
    await waitFor(() => expect(cena1.querySelector('[data-av-registro="Sargento Valdir Brum"]')).toBeTruthy())
  })

  it('sem sessão viva não há botões de sessão; com mestre + sala, PREPARAR cria encounter por cena (idempotente)', async () => {
    const semSessao = renderDoc()
    await waitFor(() => expect(semSessao.container.querySelector('[data-av-formato]')).toBeTruthy())
    expect(semSessao.container.querySelector('[data-av-iniciar]')).toBeNull()
    cleanup()

    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC123' })
    setLiveSession({ sessionId: sess.id, state: sess.state, gmUserId: 'gm-1', characters: [], members: [], encounters: [] })
    const { container } = renderDoc({ repo })
    await waitFor(() => expect(container.querySelector('[data-av-iniciar]')).toBeTruthy())
    // abre a cena 6 e prepara a Fase 1
    fireEvent.click(within(container.querySelector('[data-av-cena="6"]') as HTMLElement).getByRole('button', { name: /Retífica Sertório/ }))
    const f1 = await waitFor(() => container.querySelector('[data-av-cena="6"] [data-av-combate="1"]') as HTMLElement)
    fireEvent.click(within(f1).getByRole('button', { name: /Preparar na sessão/ }))
    await waitFor(async () => expect((await repo.listEncountersBySession(sess.id)).length).toBe(1))
    const [enc] = await repo.listEncountersBySession(sess.id)
    expect(enc!.status).toBe('prepared')
    expect(enc!.sourceNotePath).toBe(`${ID}#retifica-sertorio#1`)
    expect(enc!.name).toContain('Cena 6')
    expect(enc!.roster.entries.map((e) => `${e.qty}× ${e.label}`)).toEqual(['4× Arruaceiro', '1× Guarda'])
    // de novo → não duplica
    fireEvent.click(within(f1).getByRole('button', { name: /Preparar na sessão/ }))
    await screen.findByText(/já estava preparado/)
    expect((await repo.listEncountersBySession(sess.id)).length).toBe(1)
  })

  it('Iniciar na sessão grava state.aventura; marcar cena atualiza cenaAtual', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC124' })
    setLiveSession({ sessionId: sess.id, state: sess.state, gmUserId: 'gm-1', characters: [], members: [], encounters: [] })
    const { container } = renderDoc({ repo })
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar na sessão/ }))
    await waitFor(async () => expect((await repo.findSessionById(sess.id))!.state.aventura?.docId).toBe(ID))
    expect(getLiveSession()!.state!.aventura!.cenaAtual).toBeNull()
    expect(await screen.findByRole('button', { name: /encerrar aventura/ })).toBeTruthy()
    // marcar a cena 2 como atual
    const cena2 = container.querySelector('[data-av-cena="2"]') as HTMLElement
    fireEvent.click(within(cena2).getByRole('button', { name: /marcar atual/ }))
    await waitFor(async () => expect((await repo.findSessionById(sess.id))!.state.aventura?.cenaAtual).toBe('fuga-subterranea'))
    await waitFor(() => expect(container.querySelector('[data-av-cena="2"].is-atual')).toBeTruthy())
  })
})
