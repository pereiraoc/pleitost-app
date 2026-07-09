import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

// PERSISTÊNCIA SERVER-SIDE do estado do usuário (#84) — caminhos de grupo,
// edições de ficha e personagens criados vivem hoje no localStorage do
// navegador (por-origem: some quando o endereço do túnel muda). Este endpoint
// espelha esse estado num ARQUIVO no disco (`app-state.json`), pra os dados
// SOBREVIVEREM a restart do servidor e troca de URL. Fonte da durabilidade: o
// arquivo; o cliente hidrata dele ao abrir e espelha cada gravação de volta.
//
// Formato do arquivo: { [chaveLocalStorage]: valorString }. NÃO toca a vault
// (intocável) — é um store à parte do app.
//
// Contrato HTTP:
//   GET  /app-state        → o mapa inteiro {chave: valor} (ou {})
//   PUT  /app-state        → body {chave: valor|null} — merge (null apaga)

const MAX_BODY = 32 * 1024 * 1024 // 32 MB de guarda

function readState(file: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    /* arquivo ausente/corrompido → estado vazio */
  }
  return {}
}

function writeState(file: string, state: Record<string, string>): void {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, file) // troca atômica — evita arquivo meio-escrito num crash
}

function appStateMiddleware(file: string) {
  return (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    next: () => void,
  ) => {
    const method = (req.method ?? 'GET').toUpperCase()
    if (method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(readState(file)))
      return
    }
    if (method === 'PUT' || method === 'POST') {
      let body = ''
      let aborted = false
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > MAX_BODY) {
          aborted = true
          res.statusCode = 413
          res.end()
          req.destroy()
        }
      })
      req.on('end', () => {
        if (aborted) return
        try {
          const patch = JSON.parse(body || '{}') as Record<string, unknown>
          const cur = readState(file)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined) delete cur[k]
            else if (typeof v === 'string') cur[k] = v
          }
          writeState(file, cur)
          res.statusCode = 204
          res.end()
        } catch {
          res.statusCode = 400
          res.end()
        }
      })
      return
    }
    next()
  }
}

/** Plugin: expõe /app-state (GET/PUT) no dev E no preview, gravando em `file`. */
export function appState(file: string): Plugin {
  const mw = appStateMiddleware(file)
  return {
    name: 'pleitost:app-state',
    configResolved() {
      const dir = path.dirname(file)
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {
        /* noop */
      }
    },
    configureServer(server) {
      server.middlewares.use('/app-state', mw)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/app-state', mw)
    },
  }
}
