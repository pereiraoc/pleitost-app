// SENHA POR AVENTURA (docs/plano-aventuras-na-sessao.md §2.5, aprovado
// 2026-09-05): um doc com FM `Senha:` sai do extract CIFRADO. O dataset
// publicado (GitHub Pages) é público, então gate por hash seria decorativo —
// aqui a senha é o que de fato guarda o texto.
//
// Esquema (envelope):
//   K            = chave de 32 bytes DERIVADA da senha e do id do doc
//   privado      = JSON {frontmatter (sem Senha), body, inlineFields, …}
//   cifra        = AES-256-GCM(K, privado)
//   chaves.senha = AES-256-GCM(PBKDF2(senha, salt), K)        ← a senha da aventura
//   chaves.dev   = AES-256-GCM(PBKDF2(senhaDev, SALT_DEV), K) ← Modo Desenvolvedor destrava tudo
//
// TUDO DETERMINÍSTICO (report 2026-09-08: "não salva que eu liberei a
// aventura"): K vinha de randomBytes a cada extract, então o aparelho que
// guardou a chave ("lembrar neste aparelho") perdia o acesso a cada
// publicação — senha de novo a cada deploy. Agora K = PBKDF2(senha, id do
// doc), o salt do embrulho sai do id e cada iv sai do hash do próprio
// conteúdo. Duas extrações da MESMA nota com a MESMA senha dão bytes
// idênticos: a chave lembrada continua valendo, o dataset não muda à toa (o
// cache do navegador aproveita) e a promessa de extract reproduzível volta a
// valer. Trade consciente: sem rotação de chave por extract — a chave só muda
// quando a senha (ou o id da nota) muda. O iv NUNCA repete pra conteúdos
// diferentes, porque deriva do hash do conteúdo.
// O público mantém só os campos declarados no Contexto Base
// (`aventura.campos_lista_trancada`) + estruturais (categoria, aliases).
// O app (data/doc-lock.ts) desembrulha K com SubtleCrypto (mesmos parâmetros)
// e decifra em memória.
//
// FIGURAS DA CAMPANHA (2026-09-08c): imagem embutida SÓ por docs trancados é
// segredo do doc — sai cifrada com o MESMO K (cifrarBytes: iv ‖ ct ‖ tag) num
// arquivo de nome opaco (nomeCifrado), e a tabela alvo → arquivo viaja DENTRO
// da cifra do doc (`privadoExtra.arquivos`). O app decifra os bytes em memória
// depois de destravar (data/arquivos-cifrados.ts).
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
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

/** iv DETERMINÍSTICO de 12 bytes: hash do contexto (quem/onde) + do conteúdo.
 *  Mesmo conteúdo → mesmo iv (saída reproduzível); conteúdo diferente → iv
 *  diferente (nunca reusa iv com a mesma chave). */
export function ivDeterministico(contexto, plaintext) {
  return createHash("sha256").update(`iv-v1:${contexto}\n`).update(plaintext).digest().subarray(0, 12);
}

/** AES-256-GCM: iv (12 bytes) + ciphertext‖tag (base64). Sem `contexto` o iv é
 *  aleatório; o extract SEMPRE passa contexto (saída reproduzível). */
export function encryptGcm(key, plaintext, contexto = null) {
  const iv = contexto == null ? randomBytes(12) : ivDeterministico(contexto, plaintext);
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

/** Salt do embrulho pela senha: sai do id do doc (determinístico, público). */
export function saltDoDoc(docId) {
  return createHash("sha256").update(`wrap-v1:${docId}`).digest().subarray(0, 16);
}

/** CHAVE DO DOC: derivada da senha + id da nota. Estável entre extrações — é o
 *  que faz "lembrar neste aparelho" sobreviver a uma publicação nova. */
export function chaveDeterministica(senha, docId) {
  return pbkdf2Sync(String(senha), Buffer.from(`chave-v1:${docId}`, "utf8"), PBKDF2_ITER, 32, "sha256");
}

/** Embrulha K com uma senha, com o salt dado (do doc, ou o fixo do dev). */
export function wrapKey(contentKey, senha, salt) {
  const s = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, "utf8");
  const kek = deriveKey(senha, s);
  return { salt: b64(s), ...encryptGcm(kek, contentKey, `wrap:${b64(s)}`) };
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

/** Bytes de um ARQUIVO (imagem) cifrados com a chave K do doc: iv (12) ‖
 *  ciphertext ‖ tag (16) — um único blob, o app lê o iv do próprio arquivo.
 *  Com `contexto` (doc + caminho) o blob é reproduzível: arquivo inalterado sai
 *  byte a byte igual e o cache do navegador aproveita. */
export function cifrarBytes(K, bytes, contexto = null) {
  const iv = contexto == null ? randomBytes(12) : ivDeterministico(contexto, bytes);
  const c = createCipheriv("aes-256-gcm", K, iv);
  const ct = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

export function decifrarBytes(K, blob) {
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", K, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Nome OPACO do arquivo cifrado no dataset público: sha1 de (doc, caminho).
 *  Determinístico (extract reproduzível), sem o nome real (spoiler) no ar. */
export function nomeCifrado(docId, relPath) {
  return createHash("sha1").update(`${docId}\n${relPath}`).digest("hex");
}

/** K do doc a partir do envelope público (senha da aventura OU do dev). */
export function chaveDoDoc(publico, { senha = null, senhaDev = null } = {}) {
  const p = publico.protegido;
  return senha != null ? unwrapKey(p.chaves.senha, senha) : unwrapKey(p.chaves.dev, senhaDev);
}

/** Chaves do FM que ficam no público SEMPRE (navegação/identidade). */
const ESTRUTURAIS = new Set(["categoria", "aliases", "alias", "dg-publish", "Completo"]);

const norm = (s) => String(s).trim().replace(/[\s_]+/g, "_").toLowerCase();

/**
 * Divide um record parseado em PÚBLICO (campos da lista trancada + envelope
 * cifrado) — a versão privada inteira (FM sem `Senha`, corpo e derivados) vai
 * dentro da cifra.
 * @param {object} record  record do parseDoc
 * @param {object} opts    { camposPublicos: string[] (rótulos), senhaDev: string|null,
 *                           chave?: Buffer (K já usado pra cifrar os arquivos do doc),
 *                           privadoExtra?: object (campos extras SÓ dentro da cifra, ex.: arquivos) }
 */
export function cifrarDoc(record, { camposPublicos = [], senhaDev = null, chave = null, privadoExtra = null } = {}) {
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
  const privado = Buffer.from(JSON.stringify({ frontmatter: fmPrivado, ...resto, ...(privadoExtra ?? {}) }), "utf8");

  const K = chave ?? chaveDeterministica(senha.trim(), id);
  const chaves = { senha: wrapKey(K, senha.trim(), saltDoDoc(id)) };
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
      ...encryptGcm(K, privado, `doc:${id}`),
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
