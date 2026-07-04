/** Rotas do app — ids/tipos têm espaços e acentos, sempre escapar por segmento. */

export function compendiumTypePath(type: string): string {
  return `/compendio/${encodeURIComponent(type)}`
}

export function docPath(id: string): string {
  return '/doc/' + id.split('/').map(encodeURIComponent).join('/')
}
