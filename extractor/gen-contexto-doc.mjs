// Regenera o bloco <!-- auto:contexto --> das notas Contexto-Def a partir do
// FM (report 2026-09-01 — corpo auditável, fonte única). Uso:
//   npm run contexto:doc              (vault fantasia)
//   npm run contexto:doc:cyberpunk    (vault POA 1987)
// O compile-contexto confere o bloco no extract e FALHA se estiver
// desatualizado — edite o FM, rode este script, pronto.
import { readFile, writeFile } from "node:fs/promises";
import { VAULT_ROOT } from "./paths.mjs";
import { walkVault } from "./walk.mjs";
import { parseDoc } from "./parse-doc.mjs";
import { renderContextoDoc, aplicarBlocoAuto, AUTO_INI } from "./contexto-doc.mjs";

const { docs } = await walkVault(VAULT_ROOT);

// tipo por basename (agrupamento das tabelas) — lido AO VIVO da vault
// (usar o índice extraído criava galinha-e-ovo: nota nova ainda sem extract
// agrupava errado e a auditoria do compile reprovava o bloco recém-gerado).
const typeByBasename = new Map();
for (const d of docs) {
  if (d.kind === "scaffolding") continue;
  const raw = await readFile(d.absPath, "utf8");
  const m = /^---\r?\n[\s\S]*?\bcategoria:\s*([^\r\n#]+)/.exec(raw);
  const base = d.relPath.split("/").pop().replace(/\.md$/i, "");
  typeByBasename.set(base, m ? m[1].trim().replace(/^["']|["']$/g, "") : "Outros");
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
