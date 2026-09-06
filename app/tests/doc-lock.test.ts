// SENHA POR AVENTURA — ida-e-volta REAL: o extractor cifra (Node crypto) e o
// app decifra (SubtleCrypto) com a senha da aventura E com a chave do dev;
// senha errada não abre; lembrar/trancar por aparelho.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cifrarDoc } from '../../extractor/cifra-doc.mjs'
import {
  __resetDocLocksForTests,
  clearDevKey,
  isUnlocked,
  lock,
  setDevSenha,
  unlockWithDev,
  unlockWithSenha,
  unlockedDoc,
} from '../src/data/doc-lock'
import type { VaultDoc } from '../src/data/types'

const record = {
  id: 'Campanhas/Aventuras/X',
  path: 'Campanhas/Aventuras/X.md',
  basename: 'X',
  type: 'Aventura',
  subtype: 'Resgate',
  grupo: null,
  frontmatter: { categoria: 'Aventura', rank: 'C', Chamada: 'teaser', Senha: 'abc123', Contato: 'spoiler' },
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [],
  headings: [],
  body: '# 1. Resumo\nSEGREDO',
}
const camposPublicos = ['Chamada', 'rank']

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

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = makeStorage()
  __resetDocLocksForTests()
})
afterEach(() => __resetDocLocksForTests())

describe('doc-lock', () => {
  it('senha da aventura destrava e o doc completo volta (sem Senha, sem envelope)', async () => {
    const pub = cifrarDoc(record, { camposPublicos, senhaDev: 'dev!' }) as unknown as VaultDoc
    expect(pub.body).toBe('')
    expect(await unlockWithSenha(pub, 'errada', false)).toBe(false)
    expect(isUnlocked(pub.id)).toBe(false)
    expect(await unlockWithSenha(pub, 'abc123', true)).toBe(true)
    const full = await unlockedDoc(pub)
    expect(full.body).toBe('# 1. Resumo\nSEGREDO')
    expect(full.frontmatter['Contato']).toBe('spoiler')
    expect('Senha' in full.frontmatter).toBe(false)
    expect(full.protegido).toBeUndefined()
    // lembrado neste aparelho
    expect(JSON.parse(localStorage.getItem('pleitost.docLocks')!)).toHaveProperty(pub.id)
    lock(pub.id)
    expect(isUnlocked(pub.id)).toBe(false)
    expect((await unlockedDoc(pub)).body).toBe('')
  })

  it('chave do dev (derivada da senha do Config) destrava sem a senha da aventura', async () => {
    const pub = cifrarDoc(record, { camposPublicos, senhaDev: 'dev!' }) as unknown as VaultDoc
    expect(await unlockWithDev(pub)).toBe(false) // sem chave guardada
    await setDevSenha('dev!')
    expect(await unlockWithDev(pub)).toBe(true)
    expect((await unlockedDoc(pub)).body).toContain('SEGREDO')
    clearDevKey()
    lock(pub.id)
    await setDevSenha('outra')
    expect(await unlockWithDev(pub)).toBe(false)
  })

  it('doc extraído SEM senha de dev não abre pelo dev', async () => {
    const pub = cifrarDoc(record, { camposPublicos, senhaDev: null }) as unknown as VaultDoc
    await setDevSenha('dev!')
    expect(await unlockWithDev(pub)).toBe(false)
  })
})
