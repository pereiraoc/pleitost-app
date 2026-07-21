// @vitest-environment jsdom
// SYNC ENTRE DISPOSITIVOS das COLEÇÕES (report do usuário: "importei heróis no
// tablet e no celular eles não estavam na lista"). Raiz: o espelho por conta
// (user_state) sincroniza POR CHAVE com fill-only-missing nos DOIS sentidos —
// mas os heróis vivem num BLOB ÚNICO (pleitost.localEntities), então qualquer
// device com a chave presente nunca recebia (nem subia) os itens do outro.
// Fix: chaves de COLEÇÃO ganham MERGE POR ENTRADA (união; local vence conflito
// do mesmo id) na hidratação do login — os dois sentidos destravam e o flush
// não apaga mais os itens do outro device da conta.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  connectUserStateSync,
  __resetPersistForTests,
  __setUserStateOpsForTests,
} from '../src/data/remote-persist'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

/** "Servidor" user_state em memória com a MESMA semântica do Supabase ops. */
function fakeServer(initial: Record<string, string> = {}) {
  const rows = new Map<string, Record<string, string>>()
  rows.set('u1', { ...initial })
  return {
    rows,
    ops: {
      async get(userId: string) {
        return rows.get(userId) ?? null
      },
      async put(userId: string, patch: Record<string, string | null>) {
        const cur = { ...(rows.get(userId) ?? {}) }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete cur[k]
          else cur[k] = v
        }
        rows.set(userId, cur)
      },
    },
  }
}

const ENT = 'pleitost.localEntities'
const heroi = (id: string) => ({ id, kind: 'Heroi', basename: id, frontmatter: { subcategoria: 'Heroi' } })

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetPersistForTests()
})
afterEach(() => {
  __resetPersistForTests()
})

describe('espelho por conta: merge POR ENTRADA das coleções', () => {
  it('REPRO: herói do tablet (servidor) chega no celular que JÁ tem o blob local', async () => {
    // conta tem o herói importado no TABLET
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:tablet1': heroi('local:Heroi:tablet1') }),
    })
    __setUserStateOpsForTests(srv.ops)
    // o CELULAR já tem entidade própria → a chave EXISTE localmente (o caso do bug)
    window.localStorage.setItem(ENT, JSON.stringify({ 'local:Heroi:cel1': heroi('local:Heroi:cel1') }))

    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))

    // celular vê a UNIÃO (antes: fill-only-missing pulava e o herói nunca chegava)
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(Object.keys(local).sort()).toEqual(['local:Heroi:cel1', 'local:Heroi:tablet1'])
    expect(added).toContain(ENT) // onHydrated sabe que chegou coisa nova (reload)
    // e a CONTA recebe a união (o herói do celular sobe sem apagar o do tablet)
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(Object.keys(server).sort()).toEqual(['local:Heroi:cel1', 'local:Heroi:tablet1'])
  })

  it('conflito do MESMO id: o LOCAL vence (nunca perde o que está na mão)', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:x': { ...heroi('local:Heroi:x'), basename: 'Versão Remota' } }),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      ENT,
      JSON.stringify({ 'local:Heroi:x': { ...heroi('local:Heroi:x'), basename: 'Versão Local' } }),
    )
    await connectUserStateSync('u1', () => {})
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(local['local:Heroi:x'].basename).toBe('Versão Local')
    // o servidor converge pro vencedor local
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(server['local:Heroi:x'].basename).toBe('Versão Local')
  })

  it('chave só no SERVIDOR continua hidratando (fill preservado)', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:t': heroi('local:Heroi:t') }),
      'pleitost.settings.mestre': 'true',
    })
    __setUserStateOpsForTests(srv.ops)
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(JSON.parse(window.localStorage.getItem(ENT)!)['local:Heroi:t']).toBeTruthy()
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('true')
    expect(added.sort()).toEqual([ENT, 'pleitost.settings.mestre'])
  })

  it('pleitost.sessoes (ARRAY): união por código — mesa do tablet aparece no celular', async () => {
    const srv = fakeServer({
      'pleitost.sessoes': JSON.stringify([{ codigo: 'TAB123', nome: 'Mesa Tablet' }]),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      'pleitost.sessoes',
      JSON.stringify([{ codigo: 'CEL456', nome: 'Mesa Celular' }]),
    )
    await connectUserStateSync('u1', () => {})
    const local = JSON.parse(window.localStorage.getItem('pleitost.sessoes')!) as { codigo: string }[]
    expect(local.map((s) => s.codigo).sort()).toEqual(['CEL456', 'TAB123'])
  })

  it('escalares seguem fill-only-missing (local presente NÃO é sobrescrito)', async () => {
    const srv = fakeServer({ 'pleitost.settings.mestre': 'true' })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem('pleitost.settings.mestre', 'false')
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('false')
    expect(added).toEqual([])
  })
})
