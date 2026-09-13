// COBERTURA E COMPATIBILIDADE DE EQUIPAMENTO NO BESTIÁRIO (pedido do mestre,
// 2026-09-12): "se eu procurar nas criaturas eu vou achar pelo menos uma pra
// cada tipo de arma e pelo menos uma com cada tipo de módulo… cuidado que tem
// limitações de combinações de armas e módulos".
//
// Duas guardas, as duas sobre o dataset REAL da POA:
//  1. COMPATIBILIDADE — todo módulo/premium que uma criatura carrega passa no
//     `AplicavelA` do próprio tesouro contra a arma/armadura/escudo hospedeira.
//     Usa `tesouroAplicavelAoItem` (a implementação do app, que espelha o
//     plugin) — nada de reimplementar a semântica aqui.
//  2. COBERTURA — cada arma, cada módulo, cada equipamento e cada consumível do
//     catálogo aparece em pelo menos uma criatura.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { tesouroAplicavelAoItem } from '../src/rules/aplicavel-a'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

/** Itens que ninguém "carrega": são o estado padrão de quem não tem nada. */
const SEM_DONO = new Set(['Ataque Desarmado', 'Sem Armadura'])

/** O que o MUNDO declara que não existe nele (contexto.json → disponibilidade)
 *  não entra na cobertura — a POA 1987 não tem as Garras do Rei-Mago. */
function indisponiveisDoMundo(): Set<string> {
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as {
    disponibilidade?: { indisponiveis?: string[] }
  }
  return new Set(def.disponibilidade?.indisponiveis ?? [])
}

type Fm = Record<string, any>

function lerDoc(id: string): VaultDoc {
  return JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc
}

function dataset() {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const criaturas = manifest.docs
    .filter((d) => d.type === 'Criatura' && d.subtype === 'Monstro' && d.basename)
    .map((d) => ({ nome: d.basename!, fm: lerDoc(d.id).frontmatter as Fm }))
  const itens = new Map<string, VaultDoc>()
  for (const d of manifest.docs) {
    if (d.type === 'Item' && d.basename && !itens.has(d.basename)) itens.set(d.basename, lerDoc(d.id))
  }
  return { manifest, criaturas, itens }
}

/** Basename de um wikilink de FM ("[[Adaga|faca]]" → "Adaga"); '' se vazio. */
function alvo(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(s)
  return (m ? m[1]! : s).trim()
}

/** Pares (tesouro, hospedeiro) que uma criatura declara. */
function hospedagens(fm: Fm): { host: string; tesouro: string; onde: string }[] {
  const out: { host: string; tesouro: string; onde: string }[] = []
  const inv = fm['Inventario'] ?? {}
  for (const a of (inv['Armas']?.['Lista'] ?? []) as Fm[]) {
    const t = alvo(a?.['Propriedade'])
    if (t) out.push({ host: alvo(a?.['Nome']), tesouro: t, onde: 'arma' })
  }
  for (const slot of ['Armadura', 'Escudo'] as const) {
    const t = alvo(inv[slot]?.['Propriedade'])
    if (t) out.push({ host: alvo(inv[slot]?.['Nome']), tesouro: t, onde: slot.toLowerCase() })
  }
  return out
}

/** Tudo que a criatura "tem", pra contar cobertura. */
function carregados(fm: Fm): string[] {
  const inv = fm['Inventario'] ?? {}
  const nomes: string[] = []
  for (const a of (inv['Armas']?.['Lista'] ?? []) as Fm[]) {
    nomes.push(alvo(a?.['Nome']), alvo(a?.['Propriedade']))
  }
  for (const slot of ['Armadura', 'Escudo'] as const) {
    nomes.push(alvo(inv[slot]?.['Nome']), alvo(inv[slot]?.['Propriedade']))
  }
  for (const t of (inv['Tesouros'] ?? []) as unknown[]) nomes.push(alvo(t))
  for (const c of (inv['Consumiveis'] ?? []) as unknown[]) nomes.push(alvo(c))
  return nomes.filter(Boolean)
}

let _escolas: Map<string, string> | null = null
/** Magia → escola no vocabulário da POA, pela PASTA (é ela que separa Branca de
 *  Negra de Essencial). `Magia Especial` fica de fora: vem de habilidade. */
function escolaDaMagia(): Map<string, string> {
  if (_escolas) return _escolas
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const porPasta: [string, string][] = [
    ['/Magia Anima/', 'Lênica'], ['/Magia Arcana Branca/', 'Positrônica'],
    ['/Magia Arcana Negra/', 'Negatrônica'], ['/Magia Arcana Essencial/', 'Utilitrônica'],
  ]
  _escolas = new Map()
  for (const d of manifest.docs) {
    if (d.type !== 'Magia' || !d.basename) continue
    const achou = porPasta.find(([p]) => d.path?.includes(p))
    if (achou) _escolas.set(d.basename, achou[1])
  }
  return _escolas
}

let _essencias: Map<string, string> | null = null
/** `Essência Flamejante Adepta` → `Fogo`, lido do frontmatter da própria nota
 *  de essência. A universal (de Criação) devolve '' — serve a qualquer Fator. */
function elementoDaEssencia(nome: string): string {
  if (!_essencias) {
    const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    _essencias = new Map()
    for (const d of manifest.docs) {
      if (!d.basename?.startsWith('Essência ')) continue
      const doc = JSON.parse(fs.readFileSync(path.join(cyberDir, `${d.id}.json`), 'utf8')) as VaultDoc
      _essencias.set(d.basename, String(doc.frontmatter?.['elemento'] ?? ''))
    }
  }
  return _essencias.get(nome) ?? ''
}

/** Toda tecnologia que ALGUMA classe de bestiário alcança. Fora: `Magia
 *  Especial`, que só vem de habilidade de herói. */
function magiasDoCatalogo(): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  return manifest.docs
    .filter((d) => d.type === 'Magia' && d.basename && !d.path?.includes('/Magia Especial/'))
    .map((d) => d.basename!)
    .sort()
}

/** Tecnologias que a ficha lista — as da escola E as que o tesouro concede. */
function magiasDe(fm: Fm): string[] {
  const out: string[] = []
  const blocos = [fm['Magias'] ?? {}, fm['Magias']?.['Secundaria'] ?? {}]
  for (const bloco of blocos) {
    for (const linha of ((bloco['Lista'] ?? []) as Fm[])) {
      for (const item of ((linha['Lista'] ?? []) as unknown[])) {
        const chave = typeof item === 'object' && item ? Object.keys(item)[0] : String(item)
        const nome = alvo(chave ?? '')
        if (nome) out.push(nome)
      }
    }
  }
  return out
}

describe.skipIf(!temDataset)('equipamento do bestiário', () => {
  const { manifest, criaturas, itens } = temDataset
    ? dataset()
    : { manifest: { docs: [] } as unknown as IndexManifest, criaturas: [], itens: new Map<string, VaultDoc>() }

  it('todo módulo/premium é aplicável ao item que hospeda', () => {
    const erros: string[] = []
    for (const { nome, fm } of criaturas) {
      for (const { host, tesouro, onde } of hospedagens(fm)) {
        const hostDoc = itens.get(host)
        const tesouroDoc = itens.get(tesouro)
        if (!hostDoc) { erros.push(`${nome}: ${onde} "${host}" não existe no catálogo`); continue }
        if (!tesouroDoc) { erros.push(`${nome}: tesouro "${tesouro}" não existe no catálogo`); continue }
        if (!tesouroAplicavelAoItem(tesouroDoc, hostDoc)) {
          erros.push(`${nome}: ${tesouro} não é aplicável a ${host} (${onde})`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('toda arma do catálogo está com alguma criatura', () => {
    const usadas = new Set(criaturas.flatMap((c) => carregados(c.fm)))
    const fora = indisponiveisDoMundo()
    const faltando = manifest.docs
      .filter((d) => d.type === 'Item' && d.subtype === 'Arma' && d.basename)
      .map((d) => d.basename!)
      .filter((n) => !SEM_DONO.has(n) && !fora.has(n) && !usadas.has(n))
    expect(faltando).toEqual([])
  })

  it('todo tesouro do catálogo (módulo, equipamento, consumível) está com alguma criatura', () => {
    const usadas = new Set(criaturas.flatMap((c) => carregados(c.fm)))
    const fora = indisponiveisDoMundo()
    const faltando = manifest.docs
      .filter((d) => d.type === 'Item' && d.subtype !== 'Arma' && d.basename)
      .map((d) => d.basename!)
      .filter((n) => !SEM_DONO.has(n) && !fora.has(n) && !usadas.has(n))
    expect(faltando).toEqual([])
  })

  // TECNOLOGIA (pedido do mestre, 2026-09-13): "no mínimo pelo menos 1 criatura
  // pra cada arma, implemento, equipamento, tecnologia". Tecnologia na POA é a
  // Magia do sistema — e o bestiário cobria 31 de 99: todo conjurador do mesmo
  // elemento saía com o MESMO prefixo da lista, e a Utilitrônica inteira não
  // estava na mão de ninguém.
  it('toda tecnologia do catálogo está com alguma criatura', () => {
    const usadas = new Set(criaturas.flatMap((c) => magiasDe(c.fm)))
    const faltando = magiasDoCatalogo()
      .filter((m) => !usadas.has(m))
    expect(faltando).toEqual([])
  })

  // AS ESCOLAS NÃO SE MISTURAM (regra que o mestre apontou em 2026-09-13, e que
  // está escrita nas classes de herói): branca só branca, negra só negra — o
  // Mago é a exceção e não existe Mago no bestiário —, quem roda Anima não roda
  // Arcana, e ESSENCIAL exige ser Arcanista. A porta é a habilidade
  // [[Princípios Arcanos]], que diz que essenciais contam como magias da escola.
  it('cada conjuradora só conhece tecnologia da própria escola', () => {
    const escola = escolaDaMagia()
    const erros: string[] = []
    for (const { nome, fm } of criaturas) {
      const habilidades = ((fm['Habilidades']?.['Lista'] ?? []) as Fm[])
        .map((d) => alvo(Object.keys(d)[0] ?? ''))
      const arcanista = habilidades.includes('Princípios Arcanos')
      for (const linha of ((fm['Magias']?.['Lista'] ?? []) as Fm[])) {
        if (linha['Nome'] === 'Tesouros') continue   // item concede a quem quer que carregue
        const minha = { 'Arcana Branca': 'Positrônica', 'Arcana Negra': 'Negatrônica', Anima: 'Lênica' }[
          String(linha['Nome'])
        ]
        for (const item of ((linha['Lista'] ?? []) as unknown[])) {
          const chave = typeof item === 'object' && item ? Object.keys(item)[0] : String(item)
          const magia = alvo(chave ?? '')
          const dela = escola.get(magia)
          if (!dela) continue                        // Magia Especial, que vem de habilidade
          if (dela === 'Utilitrônica') {
            if (!arcanista) erros.push(`${nome}: ${magia} é Utilitrônica e ela não tem Princípios Arcanos`)
          } else if (dela !== minha) {
            erros.push(`${nome}: ${magia} é ${dela} e está no bloco ${linha['Nome']}`)
          }
        }
      }
    }
    expect(erros).toEqual([])
  })

  // O Fator do sangue tranca o elemento OPOSTO (Fogo↔Água, Vento↔Terra), a forma
  // Mestre é obrigatoriamente do próprio Fator (Avatar) e ao menos uma essência
  // também (Magias Anima). Sem esta guarda, o repartidor podia dar Essência
  // Congelante pra uma Artilharia de Fator Fogo e ninguém veria.
  it('nenhuma Artilharia tem essência do elemento oposto ao Fator dela', () => {
    const OPOSTO: Record<string, string> = { Fogo: 'Água', 'Água': 'Fogo', Vento: 'Terra', Terra: 'Vento' }
    const ELEMENTO: Record<string, string> = {
      'Traço Elemental do Fogo': 'Fogo', 'Traço Elemental da Terra': 'Terra',
      'Traço Elemental do Vento': 'Vento', 'Traço Elemental da Água': 'Água',
    }
    const erros: string[] = []
    for (const { nome, fm } of criaturas) {
      const fator = ELEMENTO[alvo(fm['Sintonia'])]
      if (!fator) continue
      const essencias = ((fm['Habilidades']?.['Lista'] ?? []) as Fm[])
        .map((d) => alvo(Object.keys(d)[0] ?? ''))
        .filter((h) => h.startsWith('Essência '))
      if (!essencias.length) continue
      const elementoDe = elementoDaEssencia
      const elementos = essencias.map(elementoDe)
      if (elementos.includes(OPOSTO[fator])) {
        erros.push(`${nome}: Fator ${fator} e essência de ${OPOSTO[fator]}`)
      }
      if (!elementos.includes(fator)) erros.push(`${nome}: nenhuma essência do Fator ${fator}`)
      for (const h of essencias.filter((h) => h.endsWith(' Mestre'))) {
        if (elementoDe(h) !== fator) erros.push(`${nome}: essência Mestre "${h}" não é do Fator ${fator}`)
      }
    }
    expect(erros).toEqual([])
  })

  // `Magia Especial` fica de fora e isso é DECLARADO, não esquecido: as quatro
  // vêm de habilidade de herói (Raio Arcano de Princípios Arcanos, as três do
  // Bardo de Estilo de Combate (Arte Mágica)) e nenhuma das oito classes de
  // bestiário as alcança. Se um dia alguma virar alcançável, este teste cai.
  it('as tecnologias fora do alcance do bestiário são só as de habilidade de herói', () => {
    const especiais = manifest.docs
      .filter((d) => d.type === 'Magia' && d.basename && d.path?.includes('/Magia Especial/'))
      .map((d) => d.basename!)
      .sort()
    expect(especiais).toEqual([
      'Palavras Cortantes', 'Projétil Telecinético', 'Raio Arcano', 'Ruído Estridente',
    ])
  })

  // REQUISITO DA ARMA (report do mestre: "não quero coisas bizarras"): `Força X`
  // cobra −1 cumulativo em ataque e dano de quem fica abaixo — −2 e −5 de
  // alcance no arco, recarga dobrada na besta — e `Inteligência X` simplesmente
  // IMPEDE o ataque. Eram 18 casos: sete Artilharias com FOR 0 carregando rifle
  // e arco, Batedores com arpão de Força 3, o Despachante com a katana.
  it('nenhuma criatura carrega arma que não consegue usar', () => {
    const erros: string[] = []
    for (const { nome, fm } of criaturas) {
      const at = (fm['Atributos'] ?? {}) as Record<string, number>
      for (const a of ((fm['Inventario']?.['Armas']?.['Lista'] ?? []) as Fm[])) {
        const arma = alvo(a?.['Nome'])
        const doc = itens.get(arma)
        if (!doc) continue
        for (const prop of ((doc.frontmatter?.['propriedades'] ?? []) as unknown[])) {
          const texto = String(prop)
          const f = /Força\s+(\d+)/.exec(texto)
          if (f && Number(at['FOR'] ?? 0) < Number(f[1])) {
            erros.push(`${nome}: ${arma} pede Força ${f[1]} e ela tem FOR ${at['FOR'] ?? 0}`)
          }
          const i = /Intelig[êe]ncia\s+(\d+)/.exec(texto)
          if (i && Number(at['INT'] ?? 0) < Number(i[1])) {
            erros.push(`${nome}: ${arma} pede Inteligência ${i[1]} e ela tem INT ${at['INT'] ?? 0}`)
          }
        }
      }
    }
    expect(erros).toEqual([])
  })
})
