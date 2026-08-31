// Regenera o bloco <!-- auto:contexto --> das notas Contexto-Def a partir do
// FM (report 2026-09-01 — corpo auditável, fonte única). Uso:
//   npm run contexto:doc              (vault fantasia)
//   npm run contexto:doc:cyberpunk    (vault POA 1987)
// O compile-contexto confere o bloco no extract e FALHA se estiver
// desatualizado — edite o FM, rode este script, pronto.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VAULT_ROOT, OUT_DIR } from "./paths.mjs";
import { walkVault } from "./walk.mjs";
import { parseDoc } from "./parse-doc.mjs";
import { renderContextoDoc, aplicarBlocoAuto, AUTO_INI } from "./contexto-doc.mjs";

const { docs } = await walkVault(VAULT_ROOT);

// tipo por basename (agrupamento das tabelas) — do índice extraído se houver,
// senão do parse ao vivo.
const typeByBasename = new Map();
try {
  const idx = JSON.parse(await readFile(join(OUT_DIR, "index.json"), "utf8"));
  for (const d of idx.docs) if (d.kind === "content" && d.basename) typeByBasename.set(d.basename, d.type ?? "Outros");
} catch {
  /* sem extração anterior — tabelas agrupam em "Outros" */
}

let n = 0;
for (const d of docs) {
  if (d.kind === "scaffolding" || !d.relPath.includes("Configurações de Contextos")) continue;
  const raw = await readFile(d.absPath, "utf8");
  const rec = await parseDoc({ raw, relPath: d.relPath });
  const ctx = rec.frontmatter?.Contexto;
  if (!ctx || typeof ctx !== "object") continue;
  if (!raw.includes(AUTO_INI)) {
    console.log(`(sem bloco auto) ${d.relPath}`);
    continue;
  }
  const bloco = renderContextoDoc(ctx, typeByBasename);
  const fmFim = raw.indexOf("\n---", 4) + 4;
  const body = raw.slice(fmFim);
  const novo = aplicarBlocoAuto(body, bloco);
  if (novo == null) continue;
  if (novo !== body) {
    await writeFile(d.absPath, raw.slice(0, fmFim) + novo, "utf8");
    console.log(`regenerado: ${d.relPath}`);
    n += 1;
  } else {
    console.log(`em dia: ${d.relPath}`);
  }
}
console.log(`${n} nota(s) atualizadas.`);
