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
//
// MASCARAMENTO DE FRONTMATTER (#283): alguns .webp de item na vault têm um bloco
// YAML `---\ndg-publish: true\n---` COLADO no início do binário (imagem real nunca
// começa com "---"). Como a vault é READ-ONLY, mascaramos NO BUILD: removemos esse
// frontmatter do arquivo COPIADO no dist (stripLeadingFrontmatter) — nunca em
// ../vault-data. Isso corrige qualquer imagem que só teve frontmatter prependado.
//
// CAVEAT (dado): os 18 arquivos atuais foram, ALÉM disso, re-encodados como TEXTO
// UTF-8 em algum ponto, o que trocou todo byte ≥0x80 pelo caractere de
// substituição � (ef bf bd) — os PIXELS foram destruídos de forma IRREVERSÍVEL.
// Depois do strip o `file` reconhece o container WebP, mas o sharp ainda não
// decodifica (dados corrompidos). Esses 18 só voltam re-salvando as imagens
// originais na vault (fora do escopo read-only) — segue rastreado na #283. O
// gerador loga o erro e NÃO derruba o deploy; o app cai no fallback do slot.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THUMB_MAX_WIDTH = 384
const WEBP_QUALITY = 72

// IMAGEM CHEIA EM WEBP (2026-09-13) — o site publicado tinha chegado a 3,1 GB,
// contra o limite de 1 GB do GitHub Pages, e o deploy parou de entrar: 2,7 GB
// eram PNG original em `assets/`. Reencodar pra webp na MESMA resolução corta
// ~10× sem perder um pixel (3,4 MB → 214 KB num retrato de 1024×1536).
//
// A vault segue intocada: isto roda no DIST, como os thumbs. O que muda no
// manifest é só o `copiedTo` (o caminho SERVIDO); o `path` — que é a chave de
// busca do app (`byPath`) — fica com o nome original da vault.
//
// Roda ANTES dos thumbs de propósito: o thumb é derivado do copiedTo, nos dois
// lados (aqui por thumbDestFor, no app por thumbCopiedTo). Converter depois
// deixaria o app pedindo `foo.webp.webp` e o arquivo escrito em `foo.png.webp`.
const FULL_QUALITY = 82
/** Formatos que valem reencodar no cheio. `.webp` já está no formato e `.svg`/
 *  `.gif` não são raster (vetorial / animação). */
const FULL_CONVERT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.avif'])

/** `assets/<p>.png` → `assets/<p>.webp`; null pro que não se converte. */
export function fullWebpDestFor(copiedTo) {
  if (!copiedTo?.startsWith('assets/')) return null
  const ext = path.extname(copiedTo).toLowerCase()
  if (!FULL_CONVERT_EXTS.has(ext)) return null
  return `${copiedTo.slice(0, -ext.length)}.webp`
}
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

/**
 * #283: remove um bloco de frontmatter YAML colado no INÍCIO de um arquivo de
 * imagem (`---\n…\n---\n<binário>`). Retorna o buffer LIMPO, ou o MESMO buffer
 * (identidade preservada) quando não há frontmatter — o call-site usa `!==` pra
 * detectar mudança. Seguro: imagem raster real nunca começa com os bytes "---"
 * (PNG=\x89PNG, JPEG=\xFF\xD8, WEBP=RIFF, GIF=GIF8…), então só mexe no caso
 * corrompido; sem delimitador de fechamento, não arrisca e devolve o original.
 * Puro/exportado — base dos testes.
 */
export function stripLeadingFrontmatter(buf) {
  const opensLF = buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from('---\n'))
  const opensCRLF = buf.length >= 5 && buf.subarray(0, 5).equals(Buffer.from('---\r\n'))
  if (!opensLF && !opensCRLF) return buf
  const closeLF = buf.indexOf(Buffer.from('\n---\n'))
  const closeCRLF = buf.indexOf(Buffer.from('\n---\r\n'))
  let end = -1
  let len = 0
  if (closeLF !== -1) {
    end = closeLF
    len = 5
  }
  if (closeCRLF !== -1 && (end === -1 || closeCRLF < end)) {
    end = closeCRLF
    len = 6
  }
  if (end === -1) return buf // sem fechamento → não arrisca cortar
  return buf.subarray(end + len)
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
  // #519 C8: thumbs pros DOIS datasets — fantasia (obrigatório) e cyberpunk
  // (quando publicado). Cada um espelha assets/ → assets-thumb/ no próprio dir.
  const datasets = ['vault-data', 'vault-data-cyberpunk']
    .map((d) => path.join(repoRoot, 'app', 'dist', d))
    .filter((dir, i) => {
      const ok = fs.existsSync(path.join(dir, 'assets'))
      if (!ok && i === 0) {
        console.error(
          `[gen-thumbs] ${dir}/assets não existe — rode \`npm run build\` (o build copia vault-data pro dist).`,
        )
        process.exit(1)
      }
      return ok
    })

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

  // 1) CHEIAS → webp (antes dos thumbs; ver o comentário em FULL_QUALITY)
  let convertidas = 0
  let antes = 0
  let depois = 0
  for (const datasetDir of datasets) {
    const manifestPath = path.join(datasetDir, 'assets.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    for (const entry of manifest.assets ?? []) {
      const destRel = fullWebpDestFor(entry.copiedTo)
      if (!destRel) continue
      const abs = path.join(datasetDir, entry.copiedTo)
      if (!fs.existsSync(abs)) continue
      const bruto = fs.readFileSync(abs)
      // #283: o frontmatter colado no binário sai aqui, antes de decodificar
      const src = stripLeadingFrontmatter(bruto)
      antes += src.length
      try {
        const out = await sharp(src).webp({ quality: FULL_QUALITY }).toBuffer()
        fs.writeFileSync(path.join(datasetDir, destRel), out)
        fs.unlinkSync(abs)
        entry.copiedTo = destRel
        depois += out.length
        convertidas++
      } catch (err) {
        // corrompida (#283) ou formato exótico: fica o original, e o copiedTo
        // não muda — o app segue servindo o arquivo que está lá.
        console.warn(`[gen-thumbs] cheia falhou em ${entry.copiedTo}: ${err.message}`)
        if (src !== bruto) fs.writeFileSync(abs, src)
        depois += src.length
      }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }
  const mb = (n) => (n / 1024 / 1024).toFixed(0)
  console.log(
    `[gen-thumbs] cheias: ${convertidas} em webp q${FULL_QUALITY} (mesma resolução) — ` +
      `${mb(antes)} MB → ${mb(depois)} MB no dist.`,
  )

  // 2) THUMBS
  let generated = 0
  let skipped = 0
  let passed = 0 // não-raster (svg/gif) — sem thumb, seguem no cheio
  let stripped = 0 // #283: imagens com frontmatter mascarado no dist

  const files = datasets.flatMap((dir) =>
    walk(path.join(dir, 'assets')).map((abs) => ({ abs, datasetDir: dir })),
  )
  for (const { abs, datasetDir } of files) {
    const relFromVaultData = path.relative(datasetDir, abs)
    const destRel = thumbDestFor(relFromVaultData)
    if (!destRel) {
      passed++
      continue
    }
    const destAbs = path.join(datasetDir, destRel)

    // #283: mascara o frontmatter colado no binário — reescreve o cheio LIMPO no
    // dist (nunca na vault) ANTES de tudo, pra a imagem cheia renderizar e o sharp
    // conseguir ler. Roda a cada build (o dist é cópia fresca, com o frontmatter).
    let srcBuf = fs.readFileSync(abs)
    const cleaned = stripLeadingFrontmatter(srcBuf)
    if (cleaned !== srcBuf) {
      fs.writeFileSync(abs, cleaned)
      srcBuf = cleaned
      stripped++
    }

    // Idempotência: thumb já existe e é ≥ recente que o original → pula.
    if (fs.existsSync(destAbs) && fs.statSync(destAbs).mtimeMs >= fs.statSync(abs).mtimeMs) {
      skipped++
      continue
    }

    try {
      // withoutEnlargement: imagem menor que o alvo não é AMPLIADA (mantém a
      // resolução), só reencodada em webp — o thumb sempre existe, então a URL
      // derivada no app nunca 404a (background-image não tem onError).
      const buf = await sharp(srcBuf)
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
      `${passed} sem thumb (svg/gif/erro), ${stripped} com frontmatter mascarado (#283). ` +
      `Alvo: ≤${THUMB_MAX_WIDTH}px webp q${WEBP_QUALITY}.`,
  )
}

// Só roda o main quando executado direto (não quando importado por testes).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[gen-thumbs] erro:', err)
    process.exit(1)
  })
}
