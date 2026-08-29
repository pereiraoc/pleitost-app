/**
 * Remove artefatos de layout de IMPRESSÃO do body — o template da vault POA
 * separa seções com `<div style="page-break-after: always;"></div>`, que só
 * faz sentido no export em PDF. O react-markdown (sem rehype-raw) vazaria o
 * HTML cru como texto (#519).
 */
export function stripPrintArtifacts(body: string): string {
  return body.replace(
    /<div\s+style="page-break-after:\s*always;?"\s*>\s*<\/div>/gi,
    '',
  )
}

/**
 * Remove linhas que são SÓ tags do Obsidian (`#Pessoa`, `#Contexto` — sem
 * espaço após o #, então não é heading): metadado da vault, não conteúdo; o
 * markdown as vazava como texto literal (report 2026-08-29). Tags no MEIO de
 * uma linha de prosa ficam intactas.
 */
export function stripTagLines(body: string): string {
  return body.replace(/^[ \t]*(#[^\s#]\S*[ \t]*)+$/gm, '')
}
