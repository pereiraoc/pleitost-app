// #466 — GUARDA DE COBERTURA sobre o dataset real: toda frase de FÓRMULA com
// potência ("…×potência", "potência×…") precisa ser reconhecida pelo
// interpolador. Prosa sobre potência ("sua potência mágica para magias de X
// é 4", "Aumenta potência mágica") fica de fora de propósito. Frase nova fora
// do padrão quebra aqui — e a correção é padronizar a nota, não o parser.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { interpolarFormulas, ocorrenciasNaoReconhecidas } from '../src/interativa/formulas'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const TIPOS = new Set(['Magia', 'Habilidade', 'Técnica', 'Regra', 'Ação'])
const FORMULA_LIKE = /(?:[×x*]\s*pot[êe]ncia|pot[êe]ncia\s*[×x*])/iu

describe('#466 — cobertura das fórmulas com potência no dataset', () => {
  const docs = manifest.docs.filter((e) => TIPOS.has(e.type))
  it('nenhuma frase de fórmula fica fora do interpolador', () => {
    const faltando: string[] = []
    let reconhecidas = 0
    for (const e of docs) {
      const d = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${e.id}.json`), 'utf8')) as {
        body?: string
        inlineFields?: Record<string, unknown>
      }
      const texto = `${d.body ?? ''}\n${String(d.inlineFields?.['resumo'] ?? '')}`
      if (!/pot[êe]ncia/iu.test(texto)) continue
      reconhecidas += interpolarFormulas(texto, { potencia: 4, mod: 3 }).substituicoes.length
      for (const s of ocorrenciasNaoReconhecidas(texto)) if (FORMULA_LIKE.test(s)) faltando.push(`${e.basename} :: ${s}`)
    }
    expect(faltando).toEqual([])
    // sanidade: o dataset tem dezenas de fórmulas reconhecidas
    expect(reconhecidas).toBeGreaterThan(40)
  })
})
