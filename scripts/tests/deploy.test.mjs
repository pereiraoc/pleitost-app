// Testes de infra de deploy (issues #189/#190) — node --test (npm run test:infra).
//
// Validam os ARTEFATOS e a EXISTÊNCIA dos scripts, não o deploy real:
// publicar no gh-pages exige rede/credenciais e é operação manual local
// (docs/deploy.md). Aqui: 404.html no dist, .nojekyll, scripts no
// package.json e o binário gh-pages instalado (--help).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(REPO_ROOT, "app", "dist");

const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

test("#189: scripts de deploy existem no package.json raiz", () => {
  assert.ok(rootPkg.scripts.deploy, "script `deploy` ausente");
  assert.match(rootPkg.scripts.deploy, /gh-pages -d app\/dist/, "deploy publica app/dist via gh-pages");
  assert.match(rootPkg.scripts.deploy, /--dotfiles/, "deploy precisa de --dotfiles (.nojekyll)");
  assert.match(rootPkg.scripts.deploy, /npm run build/, "deploy builda antes de publicar");
});

test("#190: publish-db = extract + deploy numa tacada", () => {
  assert.equal(rootPkg.scripts["publish-db"], "npm run extract && npm run deploy");
});

test("#189: gh-pages instalado e responde --help (sem deploy real)", () => {
  const out = execFileSync("npx", ["--no-install", "gh-pages", "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(out, /--dist/, "help do gh-pages lista as opções");
});

test("#189: .nojekyll versionado em app/public (Pages sem Jekyll)", () => {
  assert.ok(existsSync(join(REPO_ROOT, "app", "public", ".nojekyll")));
});

test("#189: dist do build tem 404.html (cópia do index) e .nojekyll", (t) => {
  // Usa o dist existente; se ainda não houve build, builda aqui (lento, mas
  // é exatamente o artefato que o deploy publica).
  if (!existsSync(join(DIST, "index.html"))) {
    t.diagnostic("dist ausente — rodando npm run build");
    execFileSync("npm", ["run", "build"], { cwd: REPO_ROOT, encoding: "utf8" });
  }
  const index = readFileSync(join(DIST, "index.html"), "utf8");
  const notFound = readFileSync(join(DIST, "404.html"), "utf8");
  assert.equal(notFound, index, "404.html deve ser cópia exata do index.html (SPA fallback)");
  assert.ok(existsSync(join(DIST, ".nojekyll")), ".nojekyll deve chegar ao dist (public/)");
  assert.ok(
    existsSync(join(DIST, "vault-data", "index.json")),
    "vault-data embutida no dist (deploy leva a database junto)",
  );
});
