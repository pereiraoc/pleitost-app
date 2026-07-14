// Resolução de caminhos do extractor — mesma convenção do gerador de
// design-system (env-configurável, default aponta pra este setup).
//
//   PLEITOST_VAULT_ROOT    → raiz da vault Obsidian (default: /data/vaults/pleitost)
//   PLEITOST_PLUGIN_ROOT   → raiz do plugin autosheet (default: <vault>/.obsidian/plugins/pleitost-autosheet)
//   PLEITOST_EXTRACT_OUT   → pasta de saída (default: <repo>/vault-data)
//
// A vault é lida em READ-ONLY. Nada é escrito fora de OUT_DIR.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");

export const VAULT_ROOT = process.env.PLEITOST_VAULT_ROOT
  ? resolve(process.env.PLEITOST_VAULT_ROOT)
  : "/data/vaults/pleitost";

export const PLUGIN_ROOT = process.env.PLEITOST_PLUGIN_ROOT
  ? resolve(process.env.PLEITOST_PLUGIN_ROOT)
  : resolve(VAULT_ROOT, ".obsidian", "plugins", "pleitost-autosheet");

export const OUT_DIR = process.env.PLEITOST_EXTRACT_OUT
  ? resolve(process.env.PLEITOST_EXTRACT_OUT)
  : resolve(REPO_ROOT, "vault-data");

// Caminho do parser de DSL (fonte de verdade da gramática de rule elements).
export const RULE_PARSER_TS = resolve(PLUGIN_ROOT, "src", "extract", "rule-parser.ts");

// Parser das `Elementos_de_Regra` das notas de Condição (subsistema próprio do
// plugin — Escalavel/Derivar/Somar Condicao.X). Reusado read-only, igual ao
// rule-parser genérico. `display-names.ts` é a única dep runtime dele (slugify).
export const CONDITION_PARSER_TS = resolve(
  PLUGIN_ROOT,
  "src",
  "runtime",
  "condicoes",
  "parse-condition-rule.ts",
);
export const DISPLAY_NAMES_TS = resolve(PLUGIN_ROOT, "src", "util", "display-names.ts");
