// GUARDA DE REGRA DO BESTIÁRIO (report do mestre, 2026-09-12): "revisa se
// alguma criatura está com alguma coisa fora de regra — qualidade, item bônus,
// atributo, qualidade de tesouro, perícia". Este teste varre TODAS as criaturas
// do dataset da POA contra as regras que as notas de `Sistema/Regras/Bestiário`
// declaram. Foi ele que pegou o crash do COMBATE: arma sem `Atributo` fazia
// `attacks.breakdowns.byAttr[undefined]` estourar a tela.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

const ATRIBS = ['FOR', 'AGI', 'INT', 'PRE'] as const
const PRINCIPAL: Record<string, string | null> = {
  Soldado: 'FOR', Bruto: 'FOR', Batedor: 'AGI', Assassino: 'AGI',
  Artilharia: 'PRE', Encantador: 'INT', Supressor: 'INT', 'Líder': null,
}
const VIDA: Record<string, number[]> = {
  Soldado: [25, 45, 67, 90], Bruto: [25, 45, 67, 90],
  Batedor: [21, 36, 54, 72], Assassino: [21, 36, 54, 72], 'Líder': [21, 36, 54, 72],
  Artilharia: [18, 30, 45, 60], Encantador: [18, 30, 45, 60], Supressor: [18, 30, 45, 60],
}
const COM_TECNOLOGIA = new Set(['Artilharia', 'Encantador', 'Supressor'])
const QUALIDADE: Record<number, string> = { 1: 'Adepto', 2: 'Experiente', 3: 'Mestre' }

type Fm = Record<string, any>

function criaturas(): { nome: string; fm: Fm }[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  return manifest.docs
    .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
    .map((d) => ({
      nome: d.basename!,
      fm: (JSON.parse(fs.readFileSync(path.join(cyberDir, `${d.id}.json`), 'utf8')) as VaultDoc).frontmatter as Fm,
    }))
}

function papelEMod(fm: Fm): { papel: string; mod: string | null } {
  const m = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(String(fm['Classe'] ?? ''))
  const papel = (m?.[1] ?? '').trim()
  const alias = (m?.[2] ?? papel).trim()
  const mod = /Elite/.test(alias) ? 'Elite' : /Solo/.test(alias) ? 'Solo' : /Competente/.test(alias) ? 'Competente' : null
  return { papel, mod }
}

describe.skipIf(!temDataset)('toda criatura do bestiário obedece à regra de monstro', () => {
  const todas = temDataset ? criaturas() : []

  it('tem criatura pra valer no dataset', () => {
    expect(todas.length).toBeGreaterThan(50)
  })

  it('atributos: soma 6 e principal travado pela classe', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const { papel } = papelEMod(fm)
      const a = fm['Atributos'] ?? {}
      const soma = ATRIBS.reduce((s, k) => s + (Number(a[k]) || 0), 0)
      if (soma !== 6) erros.push(`${nome}: soma ${soma}`)
      const alvo = PRINCIPAL[papel]
      if (alvo !== undefined && alvo !== null && Number(a[alvo]) !== 3) erros.push(`${nome}: ${papel} exige ${alvo}=3`)
      if (alvo === null && Math.max(...ATRIBS.map((k) => Number(a[k]) || 0)) !== 3) erros.push(`${nome}: Líder sem nenhum 3`)
      if (a['Principal'] && alvo && a['Principal'] !== alvo) erros.push(`${nome}: Principal ${a['Principal']} ≠ ${alvo}`)
    }
    expect(erros).toEqual([])
  })

  it('vida: a escada da classe, dobrada no Elite e triplicada no Solo', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const { papel, mod } = papelEMod(fm)
      const escada = VIDA[papel]
      if (!escada) continue
      const esperado = escada[Number(fm['Tier']) || 0]! * (mod === 'Elite' ? 2 : mod === 'Solo' ? 3 : 1)
      const tem = Number(fm['Vida']?.['Vitalidade'])
      if (tem !== esperado) erros.push(`${nome}: Vitalidade ${tem}, esperado ${esperado}`)
    }
    expect(erros).toEqual([])
  })

  it('bônus de item: Tier−1 no comum, Tier com modificador — em defesa, ataque e arma', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const { mod } = papelEMod(fm)
      const tier = Number(fm['Tier']) || 0
      const esperado = tier - 1 + (mod ? 1 : 0)
      const defesa = (fm['Defesas_Resistencias']?.['Lista'] ?? []).find((d: Fm) => d['Nome'] === 'Defesa')
      if (defesa && Number(defesa['Bonus_Item']) !== esperado) erros.push(`${nome}: Defesa +${defesa['Bonus_Item']} ≠ +${esperado}`)
      for (const at of fm['Ataques']?.['Lista'] ?? []) {
        if (Number(at['Bonus_Item']) !== esperado) erros.push(`${nome}: ataque ${at['Nome']} +${at['Bonus_Item']} ≠ +${esperado}`)
      }
      for (const w of fm['Inventario']?.['Armas']?.['Lista'] ?? []) {
        if (Number(w['Bonus_Item']) !== esperado) erros.push(`${nome}: arma ${w['Nome']} +${w['Bonus_Item']} ≠ +${esperado}`)
      }
    }
    expect(erros).toEqual([])
  })

  it('toda arma e todo ataque declaram Atributo válido (o crash do COMBATE)', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const linhas = [...(fm['Ataques']?.['Lista'] ?? []), ...(fm['Inventario']?.['Armas']?.['Lista'] ?? [])]
      for (const l of linhas) {
        if (!ATRIBS.includes(l['Atributo'])) erros.push(`${nome}: ${l['Nome']} com Atributo ${JSON.stringify(l['Atributo'])}`)
      }
      for (const w of fm['Inventario']?.['Armas']?.['Lista'] ?? []) {
        if (!w['Fonte']) erros.push(`${nome}: arma ${w['Nome']} sem Fonte`)
      }
    }
    expect(erros).toEqual([])
  })

  it('qualidade do tesouro: arma com propriedade declara a Categoria que dá o bônus', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const { mod } = papelEMod(fm)
      const bonus = (Number(fm['Tier']) || 0) - 1 + (mod ? 1 : 0)
      for (const w of fm['Inventario']?.['Armas']?.['Lista'] ?? []) {
        if (!w['Propriedade']) continue
        const esperada = QUALIDADE[bonus]
        if (!esperada) { erros.push(`${nome}: ${w['Nome']} tem propriedade mas o bônus é ${bonus}`); continue }
        if (!String(w['Categoria'] ?? '').includes(esperada)) {
          erros.push(`${nome}: ${w['Nome']} Categoria ${JSON.stringify(w['Categoria'])} ≠ ${esperada}`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('perícias: o número marcado bate com os slots do tier', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const tier = Number(fm['Tier']) || 0
      const intel = Number(fm['Atributos']?.['INT']) || 0
      const slots = fm['Pericias']?.['Slots'] ?? {}
      const espA = intel + (tier === 0 ? 3 : 4)
      const espE = tier === 2 ? 2 : tier === 3 ? 4 : 0
      const espM = tier === 3 ? 2 : 0
      if (Number(slots['A']) !== espA) erros.push(`${nome}: slots A ${slots['A']} ≠ ${espA}`)
      if (Number(slots['E']) !== espE) erros.push(`${nome}: slots E ${slots['E']} ≠ ${espE}`)
      if (Number(slots['M']) !== espM) erros.push(`${nome}: slots M ${slots['M']} ≠ ${espM}`)
      const lista = fm['Pericias']?.['Lista'] ?? []
      const marcadas = lista.filter((l: Fm) => l['Proficiencia'] !== 'N')
      const nE = lista.filter((l: Fm) => l['Proficiencia'] === 'E' || l['Proficiencia'] === 'M').length
      const nM = lista.filter((l: Fm) => l['Proficiencia'] === 'M').length
      if (marcadas.length !== espA) erros.push(`${nome}: ${marcadas.length} perícias marcadas, slots A ${espA}`)
      if (nE !== espE) erros.push(`${nome}: ${nE} acima de Adepto, slots E ${espE}`)
      if (nM !== espM) erros.push(`${nome}: ${nM} Mestre, slots M ${espM}`)
    }
    expect(erros).toEqual([])
  })

  it('tecnologia só nas três classes que a regra dá, e com magias nomeadas', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const { papel } = papelEMod(fm)
      const linhas = fm['Magias']?.['Lista'] ?? []
      const comMagia = linhas.filter((l: Fm) => (l['Lista'] ?? []).length > 0)
      const deveria = COM_TECNOLOGIA.has(papel)
      if (deveria && comMagia.length === 0) erros.push(`${nome}: ${papel} sem magia nenhuma`)
      if (!deveria && comMagia.length > 0) erros.push(`${nome}: ${papel} não tem tecnologia mas lista magia`)
      if (deveria && Number(fm['Magias']?.['Potencia']) <= 0) erros.push(`${nome}: potência mágica zerada`)
    }
    expect(erros).toEqual([])
  })

  it('proficiência de armas usa as chaves do sistema, e arcanônica entra em Especificas', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      const prof = fm['Inventario']?.['Armas']?.['Proficiencia'] ?? {}
      for (const k of ['Simples', 'Marciais', 'Especificas']) {
        if (!(k in prof)) erros.push(`${nome}: proficiência sem ${k}`)
      }
      if ('Arcanonicas' in prof) erros.push(`${nome}: chave Arcanonicas não existe no sistema`)
      const arcanonicas = (fm['Inventario']?.['Armas']?.['Lista'] ?? [])
        .map((w: Fm) => String(w['Nome'] ?? ''))
        .filter((n: string) => /Bacamarte Arcanônico|Pistola Arcanônica/.test(n))
      for (const a of arcanonicas) {
        if (!(prof['Especificas'] ?? []).some((e: string) => String(e) === a)) {
          erros.push(`${nome}: ${a} sem proficiência específica`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('toda criatura tem descrição e ao menos um bairro', () => {
    const erros: string[] = []
    for (const { nome, fm } of todas) {
      if (!String(fm['Descrição'] ?? '').trim()) erros.push(`${nome}: sem Descrição`)
      if (!(fm['Bairros'] ?? []).length) erros.push(`${nome}: sem Bairros`)
    }
    // as 4 herdadas do bestiário base ainda não têm — são o resto a migrar
    expect(erros.filter((e) => !/Arruaceiro|^Guarda|Guarda Oficial|Sargento Valdir Brum/.test(e))).toEqual([])
  })
})

// Pedido do mestre: "garante que tu vai ter criado também um encontro pronto
// pelo menos pra cada criatura". O roster do Combate é a fonte.
describe.skipIf(!temDataset)('encontros prontos cobrem o bestiário', () => {
  it('toda criatura do bestiário aparece em pelo menos um encontro', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    const usadas = new Set<string>()
    // Combates prontos E os rosters que vivem dentro de uma Aventura (a Pós
    // Grenal traz o Arruaceiro e o Sargento Valdir Brum nos fences dela).
    for (const e of manifest.docs.filter((d) => d.type === 'Combate' || d.type === 'Aventura')) {
      const doc = JSON.parse(fs.readFileSync(path.join(cyberDir, `${e.id}.json`), 'utf8')) as VaultDoc
      for (const m of String(doc.body ?? '').matchAll(/- \d+ \[\[([^\]|]+)/g)) usadas.add(m[1]!.trim())
    }
    const semEncontro = manifest.docs
      .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
      .map((d) => d.basename!)
      .filter((n) => !usadas.has(n))
      // as 4 herdadas do bestiário base entram nos encontros quando forem migradas
      .filter((n) => !['Guarda', 'Guarda Oficial'].includes(n))
    expect(semEncontro).toEqual([])
  })
})
