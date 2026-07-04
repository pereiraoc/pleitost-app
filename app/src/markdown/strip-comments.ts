/**
 * Remove blocos de comentário Obsidian (%% ... %%) do body. Os inline fields
 * que vivem dentro deles já estão estruturados em doc.inlineFields.
 */
export function stripComments(body: string): string {
  return body.replace(/%%[\s\S]*?%%/g, '').replace(/%%[\s\S]*$/, '')
}
