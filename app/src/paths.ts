/** Rotas do app — ids/tipos têm espaços e acentos, sempre escapar por segmento. */

export function compendiumFolderPath(path: string): string {
  if (!path) return '/compendio'
  return '/compendio/' + path.split('/').map(encodeURIComponent).join('/')
}

export function docPath(id: string): string {
  return '/doc/' + id.split('/').map(encodeURIComponent).join('/')
}

/** Ficha do herói (rota /heroi/<id do doc>, aba via ?tab=). */
export function heroPath(id: string, tab?: string): string {
  const base = '/heroi/' + id.split('/').map(encodeURIComponent).join('/')
  return tab ? `${base}?tab=${tab}` : base
}
