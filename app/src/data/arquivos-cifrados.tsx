// FIGURAS DA CAMPANHA (2026-09-08c) — as imagens que SÓ um doc trancado embute
// viajam no dataset como blob CIFRADO com a chave do doc (extractor: passo 3e
// do extract-vault + cifrarBytes). Aqui: o doc DESTRAVADO publica a tabela
// `arquivos` (alvo → blob) num contexto, e quem renderiza uma imagem (o
// VaultImage, ponto único de embed) pergunta por alvo. Sem a chave — aventura
// trancada e sem Modo Desenvolvedor — não há URL: a figura simplesmente não
// existe pro app, como o resto do doc.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ArquivoCifrado, VaultDoc } from './types'
import { decryptBytes, isUnlocked, keyFor, useDocLockVersion } from './doc-lock'
import { vaultUrl } from './base-url'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
}

function mimeDe(path: string): string {
  return MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

/** URL local pros bytes já decifrados: blob quando o ambiente tem (navegador),
 *  senão data: (jsdom dos testes não implementa createObjectURL). */
function urlDosBytes(bytes: Uint8Array, mime: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  }
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:${mime};base64,${btoa(bin)}`
}

const cache = new Map<string, Promise<string>>() // `${docId}|${copiedTo}` → URL

/** Baixa e decifra um arquivo do doc (uma vez por aparelho/sessão de página). */
export function urlDoArquivoCifrado(docId: string, arq: ArquivoCifrado): Promise<string> {
  const chave = keyFor(docId)
  if (!chave) return Promise.reject(new Error(`arquivo cifrado de "${docId}": doc trancado`))
  const key = `${docId}|${arq.copiedTo}`
  let p = cache.get(key)
  if (!p) {
    p = fetch(vaultUrl(arq.copiedTo.split('/').map(encodeURIComponent).join('/')))
      .then((res) => {
        if (!res.ok) throw new Error(`${arq.copiedTo}: HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then((buf) => decryptBytes(chave, buf))
      .then((bytes) => urlDosBytes(bytes, mimeDe(arq.path)))
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

interface ArquivosCtx {
  docId: string
  porAlvo: Map<string, ArquivoCifrado>
}
const Ctx = createContext<ArquivosCtx | null>(null)

/** Publica os arquivos cifrados do doc pra árvore abaixo. Doc sem `arquivos`
 *  (público, ou trancado ainda) não cria contexto — nada muda pro resto. */
export function ArquivosCifradosProvider({ doc, children }: { doc: VaultDoc; children: ReactNode }) {
  const value = useMemo<ArquivosCtx | null>(() => {
    const arquivos = doc.arquivos ?? []
    if (!arquivos.length) return null
    const porAlvo = new Map<string, ArquivoCifrado>()
    for (const a of arquivos) {
      porAlvo.set(a.target.trim().normalize('NFC'), a)
      porAlvo.set(a.path.trim().normalize('NFC'), a)
    }
    return { docId: doc.id, porAlvo }
  }, [doc])
  if (!value) return <>{children}</>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export interface AlvoCifrado {
  /** O alvo pertence a um doc trancado deste contexto (mesmo sem URL ainda). */
  conhecido: boolean
  /** URL local da imagem decifrada, quando já pronta. */
  url: string | null
  /** Pede o download+decifra. As figuras de uma aventura são pesadas (mapas
   *  de mesa em PNG): quem renderiza só chama quando a imagem entra em tela. */
  pedir: () => void
}

/** Resolve um alvo de embed pelos arquivos cifrados do doc em contexto. */
export function useArquivoCifrado(target: string): AlvoCifrado {
  const ctx = useContext(Ctx)
  const versao = useDocLockVersion() // trancar de volta esconde a figura
  const [url, setUrl] = useState<string | null>(null)
  const [querido, setQuerido] = useState(false)
  const arq = ctx?.porAlvo.get(target.trim().normalize('NFC')) ?? null
  useEffect(() => {
    if (!querido || !ctx || !arq || !isUnlocked(ctx.docId)) {
      setUrl(null)
      return
    }
    let vivo = true
    urlDoArquivoCifrado(ctx.docId, arq).then(
      (u) => vivo && setUrl(u),
      (err: unknown) => console.warn(`[arquivos] figura cifrada indisponível: ${arq.path}`, err),
    )
    return () => {
      vivo = false
    }
  }, [ctx, arq, versao, querido])
  const pedir = useCallback(() => setQuerido(true), [])
  return { conhecido: !!arq, url, pedir }
}

/** SÓ testes. */
export function __resetArquivosCifradosForTests(): void {
  cache.clear()
}
