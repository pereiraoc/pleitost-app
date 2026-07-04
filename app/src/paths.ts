/** Rotas do app — ids/tipos têm espaços e acentos, sempre escapar por segmento. */

export function compendiumFolderPath(path: string): string {
  if (!path) return '/compendio'
  return '/compendio/' + path.split('/').map(encodeURIComponent).join('/')
}

export function docPath(id: string): string {
  return '/doc/' + id.split('/').map(encodeURIComponent).join('/')
}
