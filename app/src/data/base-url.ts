// URLs de DADOS sob a BASE do Vite (#209) — em GitHub Pages de projeto o app
// vive em /pleitost-app/, e caminho absoluto ('/vault-data/...') resolve fora
// da base (404 no site publicado). Registro central: todo fetch de dados passa
// por aqui; nenhum call site concatena base na mão. Em dev/raiz BASE_URL é '/'
// e as URLs ficam idênticas às de antes.

import { dataDirFor, stampForDir } from './world-dataset'

/** Prefixa um caminho relativo (sem barra inicial) com a base do build. */
export function withBase(rel: string, base: string = import.meta.env.BASE_URL): string {
  return (base.endsWith('/') ? base : `${base}/`) + rel
}

/** URL de um arquivo de DADOS no mundo ativo (#519): rel presente no dataset
 *  do mundo resolve pro diretório dele; ausente cai na FANTASIA (fallback em
 *  camadas — vale pra docs E imagens). Fantasia = comportamento de sempre.
 *  `?v=<carimbo>` (2026-09-02): asset substituído NO LUGAR (mesmos nome/path,
 *  bytes novos) sobrevivia no cache HTTP do navegador mesmo após o purge do
 *  SW — a URL versionada pelo carimbo do dataset fura TODOS os caches quando
 *  um extract novo chega. Sem carimbo visto (1ª visita) → URL limpa. */
export function vaultUrl(rel: string): string {
  const dir = dataDirFor(rel)
  const stamp = stampForDir(dir)
  const v = stamp ? `?v=${stamp.replace(/\D/g, '')}` : ''
  return withBase(`${dir}/${rel}${v}`)
}

/** Endpoint da persistência server-side (#84) — só existe no dev server. */
export function appStateUrl(): string {
  return withBase('app-state')
}

/** basename do react-router (#210): BASE do Vite sem a barra final (o router
 *  não casa rotas com basename terminado em '/'); base raiz vira '/'. */
export function routerBasename(base: string = import.meta.env.BASE_URL): string {
  return base.replace(/\/+$/, '') || '/'
}
