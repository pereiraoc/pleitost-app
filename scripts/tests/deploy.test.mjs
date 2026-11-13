// Testes de infra de deploy (issues #189/#190 + deploy no NAS) — node --test
// (npm run test:infra).
//
// Validam os ARTEFATOS e a EXISTÊNCIA dos scripts, não o deploy real:
// publicar no gh-pages exige rede/credenciais e o NAS exige SSH — são
// operações manuais locais (docs/deploy.md). Aqui: 404.html no dist,
// .nojekyll, scripts no package.json, a guarda do dist (check-dist.sh) num
// dist falso, e a forma do deploy-nas.sh.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(REPO_ROOT, "app", "dist");
const read = (...p) => readFileSync(join(REPO_ROOT, ...p), "utf8");

const rootPkg = JSON.parse(read("package.json"));

test("#189: scripts de deploy existem no package.json raiz", () => {
  // #207: o deploy é o script com trava (deploy.sh), que builda e chama o
  // deploy-pages.sh (plumbing do git, sem o pacote gh-pages).
  assert.equal(rootPkg.scripts.deploy, "bash scripts/deploy.sh");
  const sh = read("scripts", "deploy.sh");
  assert.match(sh, /VITE_BASE=\/pleitost-app\/ npm run build/, "deploy builda com a base do Pages de projeto");
  assert.match(sh, /scripts\/deploy-pages\.sh/, "deploy publica via deploy-pages.sh");
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

/* ── guarda do dist (check-dist.sh), compartilhada pelos dois deploys ───── */

function fakeDist({ docs = 3, withIndex = true, worlds = ["vault-data", "vault-data-cyberpunk"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pleitost-dist-"));
  if (withIndex) writeFileSync(join(dir, "index.html"), "<html></html>");
  for (const w of worlds) {
    mkdirSync(join(dir, w), { recursive: true });
    writeFileSync(join(dir, w, "index.json"), JSON.stringify({ docs: Array.from({ length: docs }, (_, i) => ({ id: i })) }));
  }
  return dir;
}
const checkDist = (dir) =>
  spawnSync("bash", ["scripts/check-dist.sh", dir], { cwd: REPO_ROOT, encoding: "utf8" });

test("check-dist: passa com build + os dois datasets com docs", () => {
  const dir = fakeDist();
  try {
    const r = checkDist(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /dataset ok: vault-data \(3 docs\)/);
    assert.match(r.stdout, /dataset ok: vault-data-cyberpunk \(3 docs\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check-dist: para sem build, sem dataset ou com 0 docs (report 2026-09-12)", () => {
  const cases = [
    [fakeDist({ withIndex: false }), /não tem build/],
    [fakeDist({ worlds: ["vault-data"] }), /vault-data-cyberpunk\/index\.json faltando/],
    [fakeDist({ docs: 0 }), /publicaria com 0 docs/],
  ];
  try {
    for (const [dir, re] of cases) {
      const r = checkDist(dir);
      assert.equal(r.status, 1, `deveria falhar: ${dir}`);
      assert.match(r.stdout, re);
    }
  } finally {
    for (const [dir] of cases) rmSync(dir, { recursive: true, force: true });
  }
});

test("check-dist: para com dataset em symlink (o rsync publicaria o link; incidente 12/11/2026)", () => {
  const real = fakeDist();
  const dir = fakeDist({ worlds: ["vault-data-cyberpunk"] });
  try {
    symlinkSync(join(real, "vault-data"), join(dir, "vault-data"));
    const r = checkDist(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /vault-data é symlink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test("check-dist: deploy-pages.sh e deploy-nas.sh usam a MESMA guarda", () => {
  assert.match(read("scripts", "deploy-pages.sh"), /bash scripts\/check-dist\.sh/);
  assert.match(read("scripts", "deploy-nas.sh"), /bash scripts\/check-dist\.sh/);
});

/* ── deploy no NAS ──────────────────────────────────────────────────────── */

test("nas: script deploy:nas no package.json e deploy-nas.sh com a mesma trava", () => {
  assert.equal(rootPkg.scripts["deploy:nas"], "bash scripts/deploy-nas.sh");
  const nas = read("scripts", "deploy-nas.sh");
  const pages = read("scripts", "deploy.sh");
  // Mesmo arquivo de trava: Pages e NAS nunca limpam o app/dist um do outro.
  const lock = (s) => s.match(/^LOCK=.*$/m)?.[0];
  assert.ok(lock(nas), "deploy-nas.sh define LOCK");
  assert.equal(lock(nas), lock(pages), "deploy-nas.sh usa a mesma trava do deploy.sh");
  assert.match(nas, /flock -n 9/);
  assert.match(nas, /^set -euo pipefail$/m);
});

test("nas: build em modo nas na raiz, thumbs, guarda e rsync sem o .nojekyll", () => {
  const nas = read("scripts", "deploy-nas.sh");
  assert.match(nas, /VITE_BASE=\/ npm run build -w app -- --mode nas/, "base / e --mode nas (carrega app/.env.nas)");
  assert.match(nas, /npm run gen-thumbs/);
  assert.match(nas, /rsync -a --delete --chmod=D755,F644 --exclude='\.nojekyll'/, "rsync espelha o dist sem o .nojekyll");
  assert.match(nas, /--rsync-path='sudo rsync'/, "a pasta no NAS é do root");
  assert.match(nas, /app\/dist\/ "\$NAS_HOST:\$NAS_DIR\/"/);
  assert.match(nas, /PLEITOST_NAS_HOST:-nas/);
  assert.match(nas, /PLEITOST_NAS_DIR:-\/srv\/appdata\/pleitost\/www/);
  // Ordem: build → thumbs → guarda → rsync (a guarda depois dos thumbs, antes de publicar)
  const idx = (re) => nas.search(re);
  assert.ok(idx(/npm run build/) < idx(/gen-thumbs/) && idx(/gen-thumbs/) < idx(/check-dist/) && idx(/check-dist/) < idx(/rsync -a/));
});

test("nas: app/.env.nas aponta pro Supabase do NAS e o deploy recusa o placeholder", () => {
  const env = read("app", ".env.nas");
  assert.match(env, /^VITE_SUPABASE_URL=https:\/\/supabase\.nas\.local$/m);
  assert.match(env, /^VITE_SUPABASE_ANON_KEY=\S+$/m, "anon key presente (placeholder ou real)");
  // Enquanto a chave for o placeholder, o deploy-nas.sh tem que parar antes do build.
  const nas = read("scripts", "deploy-nas.sh");
  assert.match(nas, /grep -q '__PREENCHIDO' app\/\.env\.nas/);
  assert.ok(nas.search(/grep -q '__PREENCHIDO'/) < nas.search(/npm run build/), "a checagem vem antes do build");
  // O .env do cloud continua intocado (Pages).
  assert.match(read("app", ".env"), /^VITE_SUPABASE_URL=https:\/\/dfrcrvzvnvdvhtzvyudp\.supabase\.co$/m);
});
