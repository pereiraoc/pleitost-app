// @vitest-environment node
// GUARDA DE DADOS (2026-10-30, "Animista Adjustments" do sfynz): a troca
// Ventania ↔ Ciclonal deixou a regra da Ciclonal Experiente apontando pra nota
// apagada (Passos do Vento) e as Menores no lugar antigo. Vale nos DOIS mundos:
//  - toda magia que uma essência concede existe no catálogo;
//  - o `resumo::` da nota lista as MESMAS magias que a regra concede;
//  - a Menor concede o mesmo que a principal da mesma essência;
//  - toda magia na ficha de criatura do bestiário existe no catálogo, e a
//    `Regra.[[Essência X]]` dela é de fato quem concede aquela magia.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repo = path.dirname(appDir)

describe.each(['vault-data', 'vault-data-cyberpunk'])('%s', (dataset) => {
  const dir = path.join(repo, dataset)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest
  const catalog = buildCatalog(manifest)
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc
  const alvo = (s: string) => /\[\[([^\]|]+)/.exec(s)?.[1]?.trim() ?? ''
  const notas = manifest.docs.filter((d) => /\/Habilidades\/.*Essências Elementais/.test(d.id) && /^Essência /.test(d.basename ?? ''))
  /** nota de essência → magias que a REGRA concede */
  const concede = new Map<string, string[]>()
  for (const d of notas) {
    const regras = (ler(d.id).frontmatter['Elementos_de_Regra'] ?? []) as unknown[]
    const ms = regras
      .map(String)
      .filter((r) => /Complementar Magias\.(Secundaria\.)?Lista /.test(r))
      .map(alvo)
    if (ms.length) concede.set(d.basename!, ms)
  }

  it('toda magia concedida por essência existe', () => {
    const quebradas = [...concede].flatMap(([e, ms]) =>
      ms.filter((m) => catalog.resolve(m).kind !== 'doc').map((m) => `${e} → ${m}`),
    )
    expect(quebradas).toEqual([])
  })

  it('o resumo da nota lista as mesmas magias que a regra concede', () => {
    const erradas: string[] = []
    for (const d of notas) {
      const ms = concede.get(d.basename!)
      if (!ms) continue
      const doc = ler(d.id)
      const resumo = String((doc.inlineFields as Record<string, unknown> | undefined)?.['resumo'] ?? '')
      const noResumo = [...resumo.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]!.trim())
      if (noResumo.join('|') !== ms.join('|')) erradas.push(`${d.basename}: regra ${ms.join(',')} × resumo ${noResumo.join(',')}`)
    }
    expect(erradas).toEqual([])
  })

  it('o resumo do hub (Essência X) soma as magias das formas dele', () => {
    const erradas: string[] = []
    for (const d of notas) {
      const base = d.basename!
      if (/(Adepta|Experiente|Mestre|Menor)$/.test(base)) continue
      const esperadas = [`${base} Adepta`, `${base} Experiente`].flatMap((n) => concede.get(n) ?? [])
      if (!esperadas.length) continue
      const resumo = String((ler(d.id).inlineFields as Record<string, unknown> | undefined)?.['resumo'] ?? '')
      const noResumo = [...resumo.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]!.trim())
      if (noResumo.join('|') !== esperadas.join('|')) erradas.push(`${base}: ${esperadas.join(',')} × ${noResumo.join(',')}`)
    }
    expect(erradas).toEqual([])
  })

  it('a Menor concede o mesmo que a principal', () => {
    const erradas: string[] = []
    for (const [e, ms] of concede) {
      const m = /^(Essência .+?) (Experiente )?Menor$/.exec(e)
      if (!m) continue
      const principal = concede.get(`${m[1]} ${m[2] ? 'Experiente' : 'Adepta'}`)
      if (principal && principal.join('|') !== ms.join('|')) erradas.push(`${e}: ${ms.join(',')} × ${principal.join(',')}`)
    }
    expect(erradas).toEqual([])
  })

  it('bestiário: implemento e foco nunca soltos em Tesouros (linha de Implementos, com tier)', () => {
    const ehImplemento = (t: string) => {
      const r = catalog.resolve(alvo(t))
      return r.kind === 'doc' && r.id.includes('/Tesouros/Implementos/')
    }
    const erradas: string[] = []
    for (const d of manifest.docs.filter((x) => x.id.startsWith('Sistema/Criaturas/Bestiário/'))) {
      const inv = (ler(d.id).frontmatter as Record<string, any>).Inventario ?? {}
      for (const t of (inv.Tesouros ?? []) as string[]) if (ehImplemento(String(t))) erradas.push(`${d.basename}: ${t}`)
      for (const row of (inv.Implementos ?? []) as Array<Record<string, string>>) {
        if (!alvo(row.Nome ?? '')) erradas.push(`${d.basename}: foco sem implemento`)
        if (!/Adepto|Experiente|Mestre/.test(row.Categoria ?? '')) erradas.push(`${d.basename}: implemento sem tier`)
      }
    }
    expect(erradas).toEqual([])
  })

  it('bestiário: magia existe e vem da essência que a ficha diz', () => {
    const erradas: string[] = []
    for (const d of manifest.docs.filter((x) => x.id.startsWith('Sistema/Criaturas/Bestiário/'))) {
      const fm = ler(d.id).frontmatter as Record<string, any>
      for (const escola of (fm.Magias?.Lista ?? []) as Array<Record<string, any>>) {
        for (const row of (escola.Lista ?? []) as Array<Record<string, unknown>>) {
          const [k, v] = Object.entries(row)[0] ?? []
          if (!k) continue
          const magia = alvo(k)
          if (catalog.resolve(magia).kind !== 'doc') erradas.push(`${d.basename}: ${magia} não existe`)
          const fonte = /^Regra\.\[\[(Essência [^\]|]+)/.exec(String(v))?.[1]
          if (fonte && !concede.get(fonte)?.includes(magia)) erradas.push(`${d.basename}: ${fonte} não concede ${magia}`)
        }
      }
    }
    expect(erradas).toEqual([])
  })
})
