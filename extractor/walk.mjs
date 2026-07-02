// Descoberta de arquivos na vault (read-only).
//
//  - `.md` de conteúdo  → extraídos pra registro Opção A.
//  - `.md` de scaffolding (templates/rascunhos/etc) → NÃO extraídos, mas listados
//     no índice (kind:"scaffolding"); nada é dropado em silêncio.
//  - imagens (png/jpg/...) → indexadas por basename pra resolver embeds e copiar.

import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const IGNORED_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules"]);

// Pastas cujo conteúdo é andaime (não entra como documento de conteúdo).
// Excalidraw entra aqui: os `.excalidraw.md` são fontes voláteis (o plugin os
// reescreve a cada interação) e poluiriam diffs sem valor de dado.
const SCAFFOLDING_PREFIXES = [
  "Recursos e Mídia/Templates",
  "Recursos e Mídia/Rascunhos",
  "Recursos e Mídia/Notas de Teste",
  "Recursos e Mídia/Exportação",
  "Recursos e Mídia/Excalidraw",
];

const IMG_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;

function toPosix(p) {
  return p.split(sep).join("/");
}

export function isScaffolding(relPosix) {
  return SCAFFOLDING_PREFIXES.some(
    (p) => relPosix === p || relPosix.startsWith(p + "/")
  );
}

export async function walkVault(vaultRoot) {
  const docs = []; // { absPath, relPath(posix), kind }
  const images = []; // { absPath, relPath(posix), basename }

  async function recurse(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (IGNORED_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
        await recurse(join(dir, ent.name));
      } else if (ent.isFile()) {
        const abs = join(dir, ent.name);
        const rel = toPosix(relative(vaultRoot, abs));
        if (/\.md$/i.test(ent.name)) {
          docs.push({ absPath: abs, relPath: rel, kind: isScaffolding(rel) ? "scaffolding" : "content" });
        } else if (IMG_EXT.test(ent.name)) {
          images.push({ absPath: abs, relPath: rel, basename: ent.name });
        }
      }
    }
  }

  await recurse(vaultRoot);
  docs.sort((a, b) => a.relPath.localeCompare(b.relPath));
  images.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { docs, images };
}

// Índice basename → caminho(s) de imagem (Obsidian resolve embeds por basename).
export function indexImagesByBasename(images) {
  const map = new Map();
  for (const img of images) {
    if (!map.has(img.basename)) map.set(img.basename, []);
    map.get(img.basename).push(img);
  }
  return map;
}
