// Entry do extractor (Opção A). Lê a vault em READ-ONLY e escreve, em OUT_DIR,
// uma árvore JSON espelhando a vault + manifestos + binários de imagem.
//
//   npm run extract
//
// Determinístico e re-executável: limpa OUT_DIR e reconstrói do zero, então
// deleções/renomeações na vault se refletem sem resíduo. Sem timestamps no output.

import { rm, mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { VAULT_ROOT, OUT_DIR } from "./paths.mjs";
import { walkVault, indexImagesByBasename } from "./walk.mjs";
import { parseDoc } from "./parse-doc.mjs";

async function writeJson(absPath, obj) {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function sha256(absPath) {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function extractVault({ vaultRoot = VAULT_ROOT, outDir = OUT_DIR } = {}) {
  // 1. Rebuild limpo.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 2. Descoberta.
  const { docs, images } = await walkVault(vaultRoot);
  const imgIndex = indexImagesByBasename(images);

  // 3. Extrai docs de conteúdo; lista scaffolding sem extrair.
  const index = [];
  const assetRefs = new Map(); // target → Set(ids)

  for (const doc of docs) {
    if (doc.kind === "scaffolding") {
      index.push({ id: doc.relPath.replace(/\.md$/i, ""), path: doc.relPath, kind: "scaffolding" });
      continue;
    }
    const raw = await readFile(doc.absPath, "utf8");
    const record = await parseDoc({ raw, relPath: doc.relPath });
    await writeJson(join(outDir, doc.relPath.replace(/\.md$/i, ".json")), record);

    index.push({
      id: record.id,
      path: record.path,
      basename: record.basename,
      type: record.type,
      subtype: record.subtype,
      grupo: record.grupo,
      kind: "content",
    });

    for (const img of record.images) {
      if (!assetRefs.has(img.target)) assetRefs.set(img.target, new Set());
      assetRefs.get(img.target).add(record.id);
    }
  }

  // 4. Copia TODOS os binários de imagem da vault (referenciados E órfãos) e monta
  //    o manifesto. Referências sem arquivo correspondente viram `missing` (sinalizadas).
  const refByBasename = (b) =>
    assetRefs.has(b) ? [...assetRefs.get(b)].sort((x, y) => x.localeCompare(y)) : [];

  const assets = [];
  for (const img of images) {
    const destRel = join("assets", img.relPath);
    await mkdir(dirname(join(outDir, destRel)), { recursive: true });
    await copyFile(img.absPath, join(outDir, destRel));
    const referencedBy = refByBasename(img.basename);
    assets.push({
      path: img.relPath,
      basename: img.basename,
      copiedTo: destRel.split(/[\\/]/).join("/"),
      sha256: await sha256(img.absPath),
      referencedBy,
      orphan: referencedBy.length === 0,
      ambiguous: (imgIndex.get(img.basename) || []).length > 1,
    });
  }
  assets.sort((a, b) => a.path.localeCompare(b.path));

  const missing = [];
  for (const target of [...assetRefs.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!imgIndex.has(target)) {
      missing.push({ target, referencedBy: [...assetRefs.get(target)].sort((x, y) => x.localeCompare(y)) });
    }
  }

  // 5. Manifestos.
  index.sort((a, b) => a.id.localeCompare(b.id));
  const contentDocs = index.filter((d) => d.kind === "content");
  const byType = {};
  for (const d of contentDocs) byType[d.type ?? "(sem categoria)"] = (byType[d.type ?? "(sem categoria)"] || 0) + 1;

  const orphan = assets.filter((a) => a.orphan).length;
  const referenced = assets.length - orphan;

  await writeJson(join(outDir, "index.json"), {
    vaultRoot,
    counts: {
      content: contentDocs.length,
      scaffolding: index.length - contentDocs.length,
      imagesCopied: assets.length,
      imagesReferenced: referenced,
      imagesOrphan: orphan,
      imagesMissing: missing.length,
    },
    byType,
    docs: index,
  });
  await writeJson(join(outDir, "assets.json"), {
    counts: { total: assets.length, referenced, orphan, missing: missing.length },
    assets,
    missing,
  });

  return {
    content: contentDocs.length,
    scaffolding: index.length - contentDocs.length,
    imagesCopied: assets.length,
    imagesReferenced: referenced,
    imagesOrphan: orphan,
    imagesMissing: missing.length,
    byType,
  };
}

// Execução direta.
if (import.meta.url === `file://${process.argv[1]}`) {
  extractVault()
    .then((summary) => {
      console.log("Extract concluído:");
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((err) => {
      console.error("Falha no extract:", err);
      process.exit(1);
    });
}
