import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/**
 * Conteúdo da vault no modelo "empacotado no build" (como o Cyberpunk RED
 * Companion faz com o livro): em dev serve `root` (a pasta vault-data/ do
 * repo, gerada por `npm run extract`) sob /vault-data; no build copia o
 * diretório inteiro para dentro de outDir.
 */
/** Middleware que serve `root` sob /vault-data DECODIFICANDO a URL e lendo o
 *  arquivo literal — funciona pra nomes com vírgula/acentos/espaços. O estático
 *  do `vite preview` (sirv) NÃO serve `%2C`, então o retrato de grupo
 *  "Carlos, Dante, …" caía no fallback SPA. Usado no DEV e no PREVIEW. */
function serveVaultData(root: string) {
  return (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    next: () => void,
  ) => {
    let urlPath: string
    try {
      urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const filePath = path.normalize(path.join(root, urlPath))
    if (!filePath.startsWith(root + path.sep)) {
      res.statusCode = 403
      res.end()
      return
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next()
      res.setHeader(
        'Content-Type',
        MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      )
      fs.createReadStream(filePath).pipe(res)
    })
  }
}

export function vaultData(root: string): Plugin {
  let outDir = ''
  let isBuild = false

  return {
    name: 'pleitost:vault-data',

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      // vitest também carrega este config (command=serve): nunca copiar lá
      isBuild = config.command === 'build'
    },

    configureServer(server) {
      if (!fs.existsSync(root)) {
        server.config.logger.warn(
          `[vault-data] ${root} não existe — rode \`npm run extract\` na raiz do repo`,
        )
      }
      server.middlewares.use('/vault-data', serveVaultData(root))
    },

    // PREVIEW (build servido): o estático do sirv NÃO serve nomes com vírgula
    // (%2C) — usa o mesmo middleware do dev, que decodifica e lê o arquivo.
    configurePreviewServer(server) {
      server.middlewares.use('/vault-data', serveVaultData(root))
    },

    closeBundle() {
      if (!isBuild) return
      if (!fs.existsSync(path.join(root, 'index.json'))) {
        throw new Error(
          `[vault-data] ${root} sem index.json — rode \`npm run extract\` antes do build`,
        )
      }
      const dest = path.join(outDir, 'vault-data')
      fs.cpSync(root, dest, { recursive: true })
      console.log(`[vault-data] copiado para ${dest}`)
    },
  }
}
