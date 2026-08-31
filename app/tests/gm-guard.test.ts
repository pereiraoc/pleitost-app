// GUARDA DO CORTE MESTRE×JOGADOR (2026-08-31): o dataset PÚBLICO publicado
// no gh-pages não pode conter segredo nenhum — nem callout [!gm], nem seção
// "Contexto Oculto", nem os campos fora da whitelist do Contexto Base nas
// categorias de mundo. Varre os JSONs REAIS dos dois mundos (skip se não
// extraídos). Se isto quebrar, o extract deixou vazar — conserta o
// gm-split, não o teste.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)

const CAMPOS_MESTRE = [
  'Objetivo_de_Longo_Prazo',
  'Objetivo_Imediato',
  'Influência_em_Porto_Alegre',
  'Personalidade',
]
const CORPO_MESTRE = [
  '[!gm]',
  '**Objetivo de Longo Prazo:**',
  '**Objetivo Imediato:**',
  '**Influência:**',
  '**Influências:**',
  '**Acontecimento Recente:**',
  '**Personalidade:**',
]
const CATEGORIAS = new Set(['Organização', 'Pessoa', 'Localização'])

function varre(worldDir: string): string[] {
  const idx = JSON.parse(fs.readFileSync(path.join(worldDir, 'index.json'), 'utf8'))
  const vazados: string[] = []
  for (const d of idx.docs) {
    if (d.kind !== 'content') continue
    const p = path.join(worldDir, `${d.id}.json`)
    if (!fs.existsSync(p)) continue
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
    // Inline code fica de fora: a doc do Contexto Base MENCIONA `> [!gm]`.
    const body: string = (doc.body ?? '').replace(/`[^`\n]*`/g, '')
    if (body.includes('[!gm]')) vazados.push(`${d.id}: callout [!gm] no público`)
    if (/^#{1,6}\s.*contexto oculto/im.test(body)) {
      vazados.push(`${d.id}: seção Contexto Oculto no público`)
    }
    if (!CATEGORIAS.has(doc.type ?? '')) continue
    for (const k of CAMPOS_MESTRE) {
      const v = doc.frontmatter?.[k]
      if (v != null && v !== '') vazados.push(`${d.id}: FM ${k} no público`)
    }
    for (const marca of CORPO_MESTRE) {
      if (body.includes(marca)) vazados.push(`${d.id}: "${marca}" no corpo público`)
    }
  }
  return vazados
}

for (const world of ['vault-data', 'vault-data-cyberpunk']) {
  const dir = path.join(repoDir, world)
  describe.skipIf(!fs.existsSync(path.join(dir, 'gm.json')))(`dataset público limpo — ${world}`, () => {
    it('nenhum segredo de mestre no público', () => {
      expect(varre(dir)).toEqual([])
    })

    it('o espelho gm.json existe e carrega os cortes', () => {
      const gm = JSON.parse(fs.readFileSync(path.join(dir, 'gm.json'), 'utf8'))
      expect(Object.keys(gm.docs).length).toBeGreaterThan(0)
    })
  })
}
