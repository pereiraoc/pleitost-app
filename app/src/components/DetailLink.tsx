import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { docPath } from '../paths'
import { useDetail } from '../data/detail-context'

/** id do doc a partir de um caminho /doc/<segmentos codificados> (inverso do docPath). */
function docIdFromPath(to: string): string | undefined {
  if (!to.startsWith('/doc/')) return undefined
  return to
    .slice('/doc/'.length)
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
    .join('/')
}

/**
 * Link pra um doc do compêndio (#88). Se há sidebar de DETALHES ativa
 * (DetailContext), o clique abre o doc NELA — sem sair da tela atual (ex.: fico
 * na ficha e vejo a imbuição na direita). Fora dela, navega pro /doc/* de
 * sempre. Aceita `id` (do doc) OU `to` (/doc/...).
 */
export function DetailLink({
  id,
  to,
  className,
  children,
  dataLinkIcon,
}: {
  id?: string
  to?: string
  className?: string
  children: ReactNode
  /** #303: emoji supercharged do doc-alvo → vai como data-link-icon no <a> (o CSS
   *  a[data-link-icon]::before o prepende). Sem repassar isto, o ícone se perdia
   *  no render dos wikilinks (o override do MarkdownBody só passava href/children). */
  dataLinkIcon?: string
}) {
  const detail = useDetail()
  const docId = id ?? (to ? docIdFromPath(to) : undefined)
  // `to` é HREF, `id` é ID DE DOC. Passar um id cru em `to` gera href RELATIVO,
  // que o navegador gruda no caminho da página aberta — foi assim que o
  // "Batida Grande" da aba Bestiário de Porto Alegre virou
  // `/compendio/Atlas/Porto Alegre/Campanhas/Combates/Batida Grande`
  // (2026-09-13). Dentro do app o clique disfarçava, porque o onClick abre o
  // painel; o estrago aparecia em nova aba, ao recarregar e ao compartilhar.
  const href = to ?? (id ? docPath(id) : '#')
  if (detail && docId) {
    return (
      <a
        href={href}
        className={className}
        data-link-icon={dataLinkIcon || undefined}
        onClick={(e) => {
          e.preventDefault()
          detail.open({ kind: 'doc', id: docId })
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={className} data-link-icon={dataLinkIcon || undefined}>
      {children}
    </Link>
  )
}
