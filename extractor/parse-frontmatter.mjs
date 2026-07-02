// Separa o frontmatter YAML do corpo markdown.
//
// Lossless: o `body` retornado é o arquivo MENOS o bloco de frontmatter — junto
// com `frontmatter` reconstrói o documento. Se o YAML falhar ao parsear, o texto
// cru do frontmatter é preservado em `frontmatterRaw` (nada se perde).

import { parse as parseYaml } from "yaml";

// Frontmatter = bloco `---\n...\n---` no TOPO do arquivo (após BOM opcional).
const FM_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function parseFrontmatter(raw) {
  const m = raw.match(FM_RE);
  if (!m) {
    return { hadFrontmatter: false, frontmatter: {}, body: raw };
  }
  const fmText = m[1];
  const body = raw.slice(m[0].length);
  try {
    const parsed = parseYaml(fmText);
    // YAML vazio (`--- \n ---`) → null; normaliza pra objeto.
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { hadFrontmatter: true, frontmatter, body };
  } catch (err) {
    return {
      hadFrontmatter: true,
      frontmatter: {},
      frontmatterRaw: fmText,
      frontmatterError: String(err && err.message ? err.message : err),
      body,
    };
  }
}
