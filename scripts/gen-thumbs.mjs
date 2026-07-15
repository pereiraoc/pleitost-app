// THUMBNAILS DO DEPLOY (#280) — gera versões reduzidas das imagens da vault
// PARA OS CONTEXTOS PEQUENOS do app (retratos em listas, miniaturas de item),
// que carregavam a imagem CHEIA (retratos de 1200px+ / 2MB+ num avatar de 34px).
//
// Roda DEPOIS do build, sobre `app/dist/vault-data/assets/**` já copiado, e
// escreve os thumbs DENTRO do dist em `app/dist/vault-data/assets-thumb/**`
// (espelho do caminho + `.webp` no fim). NUNCA toca em ../vault-data (symlink,
// READ-ONLY) nem na pasta assets/ original — a imagem cheia continua servida
// pros contextos grandes (ficha, hero, lightbox).
//
// A regra de derivação de caminho é a MESMA de thumbCopiedTo() em
// src/data/assets.ts (o app monta a URL do thumb; este script escreve o arquivo
// nesse exato caminho) — as duas precisam concordar. Idempotente: pula o thumb
// que já existe e está mais novo que o original.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THUMB_MAX_WIDTH = 384
const WEBP_QUALITY = 72
// Espelha THUMB_RASTER_EXTENSIONS de src/data/assets.ts. svg (vetorial) e gif
// (anima; reencode perde o loop) ficam SÓ na imagem cheia.
const RASTER_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp'])

/**
 * Caminho de destino do thumb DENTRO de dist/vault-data, relativo a
 * dist/vault-data — espelha thumbCopiedTo(): `assets/<p>.<ext>` →
 * `assets-thumb/<p>.<ext>.webp`. Retorna null pra caminhos que não ganham thumb
 * (fora de assets/ ou extensão não-raster). Puro — a base dos testes.
 */
export function thumbDestFor(relFromVaultData) {
  const rel = relFromVaultData.split(path.sep).join('/')
  const ext = path.extname(rel).toLowerCase()
  if (!rel.startsWith('assets/') || !RASTER_EXTS.has(ext)) return null
  return `assets-thumb/${rel.slice('assets/'.length)}.webp`
}

/** Lista recursiva de arquivos (caminhos absolutos) sob `dir`. */
function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.dirname(scriptDir)
  const vaultDataDir = path.join(repoRoot, 'app', 'dist', 'vault-data')
  const assetsDir = path.join(vaultDataDir, 'assets')

  if (!fs.existsSync(assetsDir)) {
    console.error(
      `[gen-thumbs] ${assetsDir} não existe — rode \`npm run build\` (o build copia vault-data pro dist).`,
    )
    process.exit(1)
  }

  // sharp fica em node_modules (devDependency do app, hoisted pro root pelo
  // workspace). Import dinâmico pra dar uma mensagem clara se faltar.
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch (err) {
    console.error(
      `[gen-thumbs] sharp não disponível (${err.message}). Instale com \`npm i -D sharp -w app\`.`,
    )
    process.exit(1)
  }

  const files = walk(assetsDir)
  let generated = 0
  let skipped = 0
  let passed = 0 // não-raster (svg/gif) — sem thumb, seguem no cheio

  for (const abs of files) {
    const relFromVaultData = path.relative(vaultDataDir, abs)
    const destRel = thumbDestFor(relFromVaultData)
    if (!destRel) {
      passed++
      continue
    }
    const destAbs = path.join(vaultDataDir, destRel)

    // Idempotência: thumb já existe e é ≥ recente que o original → pula.
    if (fs.existsSync(destAbs) && fs.statSync(destAbs).mtimeMs >= fs.statSync(abs).mtimeMs) {
      skipped++
      continue
    }

    try {
      // withoutEnlargement: imagem menor que o alvo não é AMPLIADA (mantém a
      // resolução), só reencodada em webp — o thumb sempre existe, então a URL
      // derivada no app nunca 404a (background-image não tem onError).
      const buf = await sharp(abs)
        .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
      fs.mkdirSync(path.dirname(destAbs), { recursive: true })
      fs.writeFileSync(destAbs, buf)
      generated++
    } catch (err) {
      // Imagem corrompida/formato exótico: não derruba o deploy — o app cai no
      // cheio (VaultImage onError) ou mostra o fallback do slot.
      console.warn(`[gen-thumbs] falhou em ${relFromVaultData}: ${err.message}`)
      passed++
    }
  }

  console.log(
    `[gen-thumbs] thumbs: ${generated} gerado(s), ${skipped} já existente(s), ` +
      `${passed} sem thumb (svg/gif/erro). Alvo: ≤${THUMB_MAX_WIDTH}px webp q${WEBP_QUALITY}.`,
  )
}

// Só roda o main quando executado direto (não quando importado por testes).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[gen-thumbs] erro:', err)
    process.exit(1)
  })
}
