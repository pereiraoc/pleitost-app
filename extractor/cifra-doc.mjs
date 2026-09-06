// SENHA POR AVENTURA (docs/plano-aventuras-na-sessao.md §2.5, aprovado
// 2026-09-05): um doc com FM `Senha:` sai do extract CIFRADO. O dataset
// publicado (GitHub Pages) é público, então gate por hash seria decorativo —
// aqui a senha é o que de fato guarda o texto.
//
// Esquema (envelope):
//   K            = chave aleatória de 32 bytes por doc
//   privado      = JSON {frontmatter (sem Senha), body, inlineFields, …}
//   cifra        = AES-256-GCM(K, privado)
//   chaves.senha = AES-256-GCM(PBKDF2(senha, salt), K)        ← a senha da aventura
//   chaves.dev   = AES-256-GCM(PBKDF2(senhaDev, SALT_DEV), K) ← Modo Desenvolvedor destrava tudo
// O público mantém só os campos declarados no Contexto Base
// (`aventura.campos_lista_trancada`) + estruturais (categoria, aliases).
// O app (data/doc-lock.ts) desembrulha K com SubtleCrypto (mesmos parâmetros)
// e decifra em memória.
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CIFRA_V = 1;
export const PBKDF2_ITER = 100000;
/** Salt FIXO da chave do dev — o app deriva a chave UMA vez quando a senha do
 *  dev é digitada no Config e guarda a derivada (não a senha). */
export const SALT_DEV = "pleitost-dev-v1";

const b64 = (buf) => Buffer.from(buf).toString("base64");
const unb64 = (s) => Buffer.from(s, "base64");

export function deriveKey(senha, salt) {
  return pbkdf2Sync(String(senha), Buffer.isBuffer(salt) ? salt : Buffer.from(salt, "utf8"), PBKDF2_ITER, 32, "sha256");
}

/** AES-256-GCM: iv (12 bytes) + ciphertext‖tag (base64). */
export function encryptGcm(key, plaintext) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv: b64(iv), cifra: b64(Buffer.concat([ct, c.getAuthTag()])) };
}

export function decryptGcm(key, { iv, cifra }) {
  const buf = unb64(cifra);
  const ct = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, unb64(iv));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Embrulha K com uma senha (salt aleatório de 16 bytes, ou fixo pro dev). */
export function wrapKey(contentKey, senha, saltFixo = null) {
  const salt = saltFixo ? Buffer.from(saltFixo, "utf8") : randomBytes(16);
  const kek = deriveKey(senha, salt);
  return { salt: b64(salt), ...encryptGcm(kek, contentKey) };
}

export function unwrapKey(wrapped, senha) {
  const kek = deriveKey(senha, unb64(wrapped.salt));
  return decryptGcm(kek, wrapped);
}

/** Senha do modo dev pro embrulho da chave: env PLEITOST_DEV_SENHA ou
 *  ~/.secrets/pleitost-dev.key. null = sem chave de dev (o dev não destrava). */
export function senhaDevDoAmbiente() {
  if (process.env.PLEITOST_DEV_SENHA && process.env.PLEITOST_DEV_SENHA.trim()) {
    return process.env.PLEITOST_DEV_SENHA.trim();
  }
  try {
    const s = readFileSync(join(homedir(), ".secrets", "pleitost-dev.key"), "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

/** Chaves do FM que ficam no público SEMPRE (navegação/identidade). */
const ESTRUTURAIS = new Set(["categoria", "aliases", "alias", "dg-publish", "Completo"]);

const norm = (s) => String(s).trim().replace(/[\s_]+/g, "_").toLowerCase();

/**
 * Divide um record parseado em PÚBLICO (campos da lista trancada + envelope
 * cifrado) — a versão privada inteira (FM sem `Senha`, corpo e derivados) vai
 * dentro da cifra.
 * @param {object} record  record do parseDoc
 * @param {object} opts    { camposPublicos: string[] (rótulos), senhaDev: string|null }
 */
export function cifrarDoc(record, { camposPublicos = [], senhaDev = null } = {}) {
  const senha = record.frontmatter?.Senha;
  if (typeof senha !== "string" || !senha.trim()) {
    throw new Error(`cifrarDoc: ${record.id} sem FM Senha`);
  }
  const publicos = new Set(camposPublicos.map(norm));
  const fmPublico = {};
  const fmPrivado = {};
  for (const [k, v] of Object.entries(record.frontmatter ?? {})) {
    if (k === "Senha") continue;
    if (ESTRUTURAIS.has(k) || publicos.has(norm(k))) fmPublico[k] = v;
    fmPrivado[k] = v; // o privado carrega o FM COMPLETO (sem a senha)
  }
  const { id, path, basename, type, subtype, grupo, frontmatter: _fm, ...resto } = record;
  void _fm;
  const privado = Buffer.from(JSON.stringify({ frontmatter: fmPrivado, ...resto }), "utf8");

  const K = randomBytes(32);
  const chaves = { senha: wrapKey(K, senha.trim()) };
  if (senhaDev) chaves.dev = wrapKey(K, senhaDev, SALT_DEV);

  const publico = {
    id,
    path,
    basename,
    type,
    // subcategoria (tipo de missão) só fica no público se estiver na lista
    // trancada — por padrão não está (decisão do user: nada além do declarado).
    subtype: publicos.has("subcategoria") ? subtype : null,
    grupo,
    frontmatter: fmPublico,
    inlineFields: {},
    ruleElements: [],
    links: [],
    images: [],
    headings: [],
    body: "",
    protegido: {
      v: CIFRA_V,
      alg: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iter: PBKDF2_ITER,
      ...encryptGcm(K, privado),
      chaves,
    },
  };
  return publico;
}

/** Inverso (usado nos testes e em ferramentas): devolve o record completo. */
export function decifrarDoc(publico, { senha = null, senhaDev = null } = {}) {
  const p = publico.protegido;
  if (!p) return publico;
  const K = senha != null ? unwrapKey(p.chaves.senha, senha) : unwrapKey(p.chaves.dev, senhaDev);
  const privado = JSON.parse(decryptGcm(K, p).toString("utf8"));
  const { protegido: _p, ...base } = publico;
  void _p;
  return { ...base, ...privado, frontmatter: { ...base.frontmatter, ...privado.frontmatter } };
}
