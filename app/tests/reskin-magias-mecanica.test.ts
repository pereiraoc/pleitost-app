// Corpo do mundo de MAGIA (reskin.descricoes) troca o cenário, nunca a regra:
// a convenção da POA é "frase de cena na frente e a nota canônica copiada
// verbatim" (Contexto POA 1987 §4). A guarda confere, no dataset real, que toda
// linha de grau da nota (Sucesso / Sucesso Decisivo / Falha / Falha Decisiva)
// aparece IDÊNTICA no corpo do mundo — nasceu com as quatro magias Mestre de
// 2026-11-22 (Chuva de Escória, Asfalto Fervente, Cápsula Criogênica, Muro de
// Cacos), que trocam pedra e magma por concreto e asfalto no texto corrido.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json'))

const GRAU = /^\*\*(Sucesso|Sucesso Decisivo|Falha|Falha Decisiva):\*\*/

describe.skipIf(!temDataset)('corpo do mundo das magias preserva a mecânica (POA 1987)', () => {
  const ctx = temDataset
    ? (JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as {
        reskin?: { descricoes?: Record<string, string>; notas?: Record<string, string> }
      })
    : {}
  const desc = ctx.reskin?.descricoes ?? {}
  const manifest = temDataset
    ? (JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest)
    : ({ docs: [] } as unknown as IndexManifest)
  const magias = manifest.docs.filter(
    (d) => d.type === 'Magia' && d.basename && desc[d.basename] !== undefined,
  )

  it('as quatro magias Mestre de 2026-11-22 têm nome e corpo do mundo', () => {
    const notas = ctx.reskin?.notas ?? {}
    expect(notas['Chuva de Meteoritos']).toBe('Chuva de Escória')
    expect(notas['Erupção']).toBe('Asfalto Fervente')
    expect(notas['Criogenia']).toBe('Cápsula Criogênica')
    expect(notas['Parede Espinhosa']).toBe('Muro de Cacos')
    const comCorpo = magias.map((d) => d.basename)
    for (const n of ['Chuva de Meteoritos', 'Erupção', 'Criogenia', 'Parede Espinhosa']) {
      expect(comCorpo).toContain(n)
    }
  })

  it.each(magias.map((d) => [d.basename!, d.id] as const))(
    '%s: toda linha de grau da nota está idêntica no corpo do mundo',
    (nome, id) => {
      const doc = JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
      const graus = String(doc.body ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => GRAU.test(l))
      const mundo = new Set(desc[nome]!.split('\n').map((l) => l.trim()))
      for (const linha of graus) expect(mundo, `${nome}: ${linha}`).toContain(linha)
    },
  )
})
