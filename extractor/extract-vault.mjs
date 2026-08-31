// Entry do extractor (Opção A). Lê a vault em READ-ONLY e escreve, em OUT_DIR,
// uma árvore JSON espelhando a vault + manifestos + binários de imagem.
//
//   npm run extract
//
// Determinístico e re-executável: limpa OUT_DIR e reconstrói do zero, então
// deleções/renomeações na vault se refletem sem resíduo. Sem timestamps no
// output — EXCETO db-version.json, o stamp de versão da database (#190).

import { rm, mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { VAULT_ROOT, OUT_DIR, WORLD_ID } from "./paths.mjs";
import { walkVault, indexImagesByBasename } from "./walk.mjs";
import { parseDoc } from "./parse-doc.mjs";
import { compileContexto } from "./compile-contexto.mjs";
import { gmSplit, gmConfigFromBase } from "./gm-split.mjs";

// Subárvores CONGELADAS (pedido 2026-08-15): personagens (Heróis) e grupos
// são geridos NO APP e o vault-data deles está MAIS atualizado que os .md da
// vault. O extract NÃO re-extrai essas pastas: preserva os JSONs e as
// entradas de índice da extração ANTERIOR (o rebuild é limpo — sem o
// snapshot, o rm os deletaria).
export const FROZEN_PREFIXES = [
  "Sistema/Criaturas/Heróis",
  "Sistema/Criaturas/Grupos de Criaturas",
  "Sistema/Criaturas/Companheiros Animais",
];
export function isFrozenPath(relPosix) {
  return FROZEN_PREFIXES.some((p) => relPosix === p || relPosix.startsWith(p + "/"));
}

async function writeJson(absPath, obj) {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function sha256(absPath) {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function extractVault({ vaultRoot = VAULT_ROOT, outDir = OUT_DIR } = {}) {
  // 0. Snapshot das subárvores congeladas da extração ANTERIOR (antes do wipe).
  const frozen = [];
  try {
    const oldIndex = JSON.parse(await readFile(join(outDir, "index.json"), "utf8"));
    for (const d of oldIndex.docs ?? []) {
      if (d.kind !== "content" || !isFrozenPath(d.path)) continue;
      const raw = await readFile(join(outDir, d.path.replace(/\.md$/i, ".json")), "utf8");
      frozen.push({ entry: d, raw });
    }
  } catch {
    // sem extração anterior (OUT_DIR vazio/corrompido) — nada a preservar
  }

  // 1. Rebuild limpo.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 2. Descoberta.
  const { docs, images } = await walkVault(vaultRoot);
  const imgIndex = indexImagesByBasename(images);

  // 2b. Config MESTRE×JOGADOR da Contexto-Def base (gm-split precisa dela
  //     ANTES do loop de escrita). Descoberta por FM; caminho conhecido
  //     primeiro, varredura completa como fallback.
  let gmConfig = gmConfigFromBase(null);
  {
    const candidatos = [
      ...docs.filter((d) => d.kind !== "scaffolding" && d.relPath.includes("Configurações de Contextos")),
      ...docs.filter((d) => d.kind !== "scaffolding" && !d.relPath.includes("Configurações de Contextos")),
    ];
    for (const d of candidatos) {
      const raw = await readFile(d.absPath, "utf8");
      if (!/^---[\s\S]*?\bid:\s*base\b/.test(raw)) continue;
      const rec = await parseDoc({ raw, relPath: d.relPath });
      if (rec.frontmatter?.Contexto?.id === "base") {
        gmConfig = gmConfigFromBase(rec.frontmatter.Contexto);
        break;
      }
    }
  }

  // 3. Extrai docs de conteúdo; lista scaffolding sem extrair.
  const index = [];
  const gmEspelho = { notas: [], docs: {} }; // espelho do MESTRE (gm.json)
  const assetRefs = new Map(); // target → Set(ids)
  const docLinks = new Map(); // id → targets crus dos wikilinks

  let frozenSkipped = 0;
  const contextoDefs = []; // notas com FM `Contexto:` (Contexto-Def, #519)
  const typeByBasename = new Map(); // agrupamento das tabelas auto (contexto-doc)
  const contentBasenames = new Set();
  for (const doc of docs) {
    if (doc.kind === "scaffolding") {
      index.push({ id: doc.relPath.replace(/\.md$/i, ""), path: doc.relPath, kind: "scaffolding" });
      continue;
    }
    // Pasta congelada: a fonte é o app — o .md da vault é ignorado e a versão
    // preservada (passo 3b) entra no lugar.
    if (isFrozenPath(doc.relPath)) {
      frozenSkipped += 1;
      continue;
    }
    const raw = await readFile(doc.absPath, "utf8");
    const record = await parseDoc({ raw, relPath: doc.relPath });

    // Corte mestre×jogador (2026-08-31): o JSON público sai SEM segredos; o
    // espelho gm.json guarda a versão completa (só docs afetados).
    const { publico, gmDoc, notaGm } = gmSplit(record, gmConfig);
    if (gmDoc) gmEspelho.docs[record.id] = gmDoc;
    if (notaGm) {
      // Nota inteira do mestre: fora do índice e da árvore públicos.
      gmEspelho.notas.push({
        id: record.id,
        path: record.path,
        basename: record.basename,
        type: record.type,
        subtype: record.subtype,
        grupo: record.grupo,
        kind: "content",
      });
      contentBasenames.add(record.basename);
      typeByBasename.set(record.basename, record.type ?? "Outros");
      if (record.frontmatter?.Contexto && typeof record.frontmatter.Contexto === "object") {
        contextoDefs.push({ relPath: doc.relPath, contexto: record.frontmatter.Contexto, body: record.body });
      }
      continue;
    }
    await writeJson(join(outDir, doc.relPath.replace(/\.md$/i, ".json")), publico);

    contentBasenames.add(record.basename);
    typeByBasename.set(record.basename, record.type ?? "Outros");
    if (record.frontmatter?.Contexto && typeof record.frontmatter.Contexto === "object") {
      contextoDefs.push({ relPath: doc.relPath, contexto: record.frontmatter.Contexto, body: record.body });
    }

    // #519: aliases do FM no índice — `alias` (o primeiro) alimenta displays
    // baratos (dropdown de classes); `aliases` (todos) alimenta o RESOLVE de
    // wikilink do app (report 2026-08-31: [[Brigada Militar]] etc. resolvem
    // por alias no Obsidian e ficavam mortos no app).
    const aliasRaw = record.frontmatter?.aliases ?? record.frontmatter?.alias;
    const aliases = (Array.isArray(aliasRaw) ? aliasRaw : [aliasRaw])
      .filter((a) => typeof a === "string" && a.trim() !== "")
      .map((a) => a.trim());
    const alias = aliases[0] ?? null;

    index.push({
      id: record.id,
      path: record.path,
      basename: record.basename,
      type: record.type,
      subtype: record.subtype,
      grupo: record.grupo,
      ...(alias ? { alias } : {}),
      ...(aliases.length ? { aliases } : {}),
      // #544: mãos da arma no índice — o filtro de arma do Empregado
      // (regras.companheiro_animal.arma.maos) lê daqui sem carregar o doc.
      ...(record.subtype === "Arma" && typeof record.frontmatter?.["mãos"] === "number"
        ? { maos: record.frontmatter["mãos"] }
        : {}),
      kind: "content",
    });

    for (const img of record.images) {
      if (!assetRefs.has(img.target)) assetRefs.set(img.target, new Set());
      assetRefs.get(img.target).add(record.id);
    }

    docLinks.set(record.id, record.links.map((l) => l.target));
  }

  // 3b. Restaura as subárvores congeladas: JSON + entrada de índice + refs de
  //     imagem + links (assets.json/links.json seguem consistentes com os
  //     docs preservados — retratos de herói não viram "orphan").
  for (const f of frozen) {
    const abs = join(outDir, f.entry.path.replace(/\.md$/i, ".json"));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, f.raw, "utf8");
    index.push(f.entry);
    const record = JSON.parse(f.raw);
    for (const img of record.images ?? []) {
      if (!assetRefs.has(img.target)) assetRefs.set(img.target, new Set());
      assetRefs.get(img.target).add(record.id);
    }
    docLinks.set(record.id, (record.links ?? []).map((l) => l.target));
  }
  console.log(
    `Congeladas (Heróis/Grupos): ${frozen.length} doc(s) preservados da extração anterior; ` +
      `${frozenSkipped} .md da vault ignorados.`,
  );
  if (!frozen.length && frozenSkipped) {
    console.warn(
      "AVISO: pastas congeladas SEM snapshot anterior — Heróis/Grupos ficarão fora do output.",
    );
  }

  // 3c. Contexto do mundo (#519): compila e valida a Contexto-Def do WORLD_ID
  //     (basenames incluem os docs congelados). Def inválida QUEBRA o extract.
  for (const f of frozen) {
    if (f.entry.basename) contentBasenames.add(f.entry.basename);
  }
  const contexto = compileContexto({
    typeByBasename,
    worldId: WORLD_ID,
    defs: contextoDefs,
    basenames: contentBasenames,
  });
  // 3d. Espelho do MESTRE: gm.json (docs completos dos que tiveram corte +
  //     índice das notas GM:true). O app só o busca em Modo Mestre.
  await writeJson(join(outDir, "gm.json"), gmEspelho);
  console.log(
    `GM: ${Object.keys(gmEspelho.docs).length} docs com corte, ` +
      `${gmEspelho.notas.length} notas só-mestre → gm.json`,
  );

  if (contexto) {
    await writeJson(join(outDir, "contexto.json"), contexto);
    console.log(
      `Contexto "${WORLD_ID}" compilado de ${contexto.fonte}: ` +
        `${Object.keys(contexto.reskin.notas).length} renames de nota, ` +
        `${Object.keys(contexto.reskin.termos).length} termos, ` +
        `${contexto.disponibilidade.indisponiveis.length} indisponíveis, ` +
        `${contexto.base.sempreDisponiveis.length} sempre-disponíveis (Base).`,
    );
  } else {
    console.warn(`AVISO: nenhuma nota de Contexto-Def com id "${WORLD_ID}" — contexto.json não gerado.`);
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

  // 6. Grafo de wikilinks resolvidos (edges id → ids). Resolução estrita:
  //    path exato, senão basename único; ambíguo/inexistente fica de fora.
  //    Consumido pelo app pra backlinks (dataview `FROM [[]]` / `outgoing()`).
  const idSet = new Set(contentDocs.map((d) => d.id));
  const idsByBasename = new Map();
  for (const d of contentDocs) {
    if (!idsByBasename.has(d.basename)) idsByBasename.set(d.basename, []);
    idsByBasename.get(d.basename).push(d.id);
  }
  const resolveTarget = (target) => {
    const clean = target.split("#")[0].trim();
    if (!clean) return null;
    if (clean.includes("/")) {
      const id = clean.replace(/\.md$/i, "");
      if (idSet.has(id)) return id;
      const suffix = "/" + id;
      const matches = contentDocs.filter((d) => d.id.endsWith(suffix));
      return matches.length === 1 ? matches[0].id : null;
    }
    const ids = idsByBasename.get(clean) || [];
    return ids.length === 1 ? ids[0] : null;
  };
  const edges = {};
  let edgeCount = 0;
  for (const id of [...docLinks.keys()].sort((a, b) => a.localeCompare(b))) {
    const out = [...new Set(docLinks.get(id).map(resolveTarget).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    if (out.length) {
      edges[id] = out;
      edgeCount += out.length;
    }
  }
  await writeJson(join(outDir, "links.json"), {
    counts: { docs: Object.keys(edges).length, edges: edgeCount },
    edges,
  });

  // 7. Stamp de versão da database (#190) — o ÚNICO arquivo com timestamp do
  //    output. O app lê em /vault-data/db-version.json e mostra no CONFIG
  //    (rodapé): de quando é a database publicada e quantos docs ela tem.
  await writeJson(join(outDir, "db-version.json"), {
    extractedAt: new Date().toISOString(),
    docCount: contentDocs.length,
  });

  return {
    content: contentDocs.length,
    frozenPreserved: frozen.length,
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
