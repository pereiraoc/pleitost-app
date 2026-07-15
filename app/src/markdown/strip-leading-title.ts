/** Remove o PRIMEIRO heading do corpo quando ele repete o título do doc — as
 *  views com header próprio (Regra/Criação/História) já mostram o nome, então
 *  o `# Título`/`# = this.file.name` do corpo vira duplicata feia (#246). Também
 *  usado no corpo da folder-note genérica (#275), pra não repetir o título da
 *  pasta. Fonte única — não reimplementar no call-site. */
export function stripLeadingTitle(body: string, basename: string): string {
  const m = /^\s*#{1,6}\s+(.+?)\s*$/m.exec(body)
  if (!m || body.slice(0, m.index).trim() !== '') return body
  const titulo = m[1].replace(/`?=\s*this\.file\.name`?/g, basename).trim()
  if (titulo !== basename.trim()) return body
  return body.slice(0, m.index) + body.slice(m.index + m[0].length)
}
