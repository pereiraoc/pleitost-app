// URLs de DADOS sob a BASE do Vite (#209) — em GitHub Pages de projeto o app
// vive em /pleitost-app/, e caminho absoluto ('/vault-data/...') resolve fora
// da base (404 no site publicado). Registro central: todo fetch de dados passa
// por aqui; nenhum call site concatena base na mão. Em dev/raiz BASE_URL é '/'
// e as URLs ficam idênticas às de antes.

/** Prefixa um caminho relativo (sem barra inicial) com a base do build. */
export function withBase(rel: string, base: string = import.meta.env.BASE_URL): string {
  return (base.endsWith('/') ? base : `${base}/`) + rel
}

/** URL de um arquivo do vault-data (rel já com segmentos encodados). */
export function vaultUrl(rel: string): string {
  return withBase(`vault-data/${rel}`)
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
