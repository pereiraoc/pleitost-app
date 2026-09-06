/** Slug estável de um título (chave de cena/registro em state e URLs):
 *  sem acento, minúsculo, hífens. Ignora aspas curvas e emojis. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
