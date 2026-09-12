#!/usr/bin/env node
// Ingest da leva de PRÓTESES (2026-09-12) — 75 imagens: 24 equipamentos × 3
// versões `(A)/(E)/(M)` + 3 armaduras.
//
// Por que um script à parte e não o `--ingest` do gen-context-figures: aquele
// roteia pelo manifest e pelo esquema de sufixo por extenso ("… Adepto"). Esta
// leva já nasce com o NOME FINAL no arquivo, então o trabalho é só normalizar o
// tamanho e mover — e, no fim, apagar a arte antiga que ficou órfã (é o que
// impede o app de continuar mostrando a peça velha pelo fallback sem tier).
//
//   node scripts/ingest-proteses.mjs           # confere e mostra o que faria
//   node scripts/ingest-proteses.mjs --aplicar # move, redimensiona e limpa
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const VAULT = process.env.PLEITOST_VAULT_ROOT ?? '/data/vaults/POA 1987'
const INBOX = join(VAULT, 'Recursos e Mídia/Rascunhos/Inbox de Imagens')
const FINAL = join(VAULT, 'Recursos e Mídia/Recursos de Contextos')
const PASTAS = ['Equipamentos', 'Implementos', 'Armaduras']
const W = 590
const H = 420
const APLICAR = process.argv.includes('--aplicar')

/** Arte antiga fica órfã quando existe pelo menos uma versão `(A|E|M)` da mesma
 *  peça. Enquanto não existir, ela é o fallback e NÃO pode ser apagada. */
const semTier = (n) => n.replace(/ \((?:A|E|M)\)\.png$/, '.png').replace(/ (?:Adepto|Experiente|Mestre)\.png$/, '.png')

let movidas = 0
const apagar = []

for (const pasta of PASTAS) {
  const de = join(INBOX, pasta)
  const para = join(FINAL, pasta)
  if (!existsSync(de)) continue
  const novas = readdirSync(de).filter((f) => f.toLowerCase().endsWith('.png'))
  if (!novas.length) continue
  if (APLICAR) mkdirSync(para, { recursive: true })

  for (const f of novas) {
    console.log(`${pasta}/${f}`)
    if (!APLICAR) { movidas++; continue }
    await sharp(join(de, f))
      .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(para, f))
    rmSync(join(de, f))
    movidas++
  }

  // órfãs: a peça ganhou versão com tier, então a antiga sem tier sai
  const finais = existsSync(para) ? readdirSync(para).filter((f) => f.endsWith('.png')) : []
  const comTier = new Set(finais.filter((f) => / \((?:A|E|M)\)\.png$/.test(f)).map(semTier))
  for (const f of finais) {
    if (/ \((?:A|E|M)\)\.png$/.test(f)) continue
    if (comTier.has(semTier(f))) apagar.push(join(para, f))
  }
}

console.log(`\n${movidas} imagem(ns) ${APLICAR ? 'ingeridas' : 'a ingerir'}.`)
if (apagar.length) {
  console.log(`\nARTE ANTIGA ÓRFÃ (${apagar.length}) — a peça já tem versão com tier:`)
  for (const p of apagar) console.log('  ' + p.replace(FINAL + '/', ''))
  if (APLICAR) {
    for (const p of apagar) rmSync(p)
    console.log('apagadas.')
  } else {
    console.log('(rode com --aplicar pra apagar)')
  }
}
