// Extrai wikilinks e embeds de um texto (corpo ou valor de frontmatter).
//
//   [[Alvo]]            → link  { target:"Alvo" }
//   [[Alvo|Apelido]]    → link  { target:"Alvo", alias:"Apelido" }
//   [[Alvo#Seção]]      → link  { target:"Alvo", subpath:"Seção" }
//   ![[Embed]]          → embed { target:"Embed" }     (! = transclusão)
//
// `target` é o alvo cru como escrito (basename, que é como o Obsidian resolve).
// Rotas tipo `[[A]] > [[B]] (Mar)` saem como dois links independentes.

const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;
const IMG_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;

export function parseLinks(text) {
  const links = [];
  if (!text) return links;
  let m;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(text)) !== null) {
    const isEmbed = m[1] === "!";
    let inner = m[2].trim();

    let alias = null;
    const pipe = inner.indexOf("|");
    if (pipe !== -1) {
      alias = inner.slice(pipe + 1).trim();
      inner = inner.slice(0, pipe).trim();
    }

    let subpath = null;
    const hash = inner.indexOf("#");
    if (hash !== -1) {
      subpath = inner.slice(hash + 1).trim();
      inner = inner.slice(0, hash).trim();
    }

    const link = { target: inner, kind: isEmbed ? "embed" : "wikilink" };
    if (alias) link.alias = alias;
    if (subpath) link.subpath = subpath;
    if (IMG_EXT.test(inner)) link.isImage = true;
    links.push(link);
  }
  return links;
}

export function isImageTarget(target) {
  return IMG_EXT.test(target || "");
}
