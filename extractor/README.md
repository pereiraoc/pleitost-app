# extractor/ — extração lossless da vault → `vault-data/`

Lê a vault Obsidian do Pleitost em **read-only** e escreve, em `vault-data/`, uma
árvore JSON **espelhando a estrutura da vault** (um `.json` por `.md`) + manifestos
+ binários de imagem. É a camada de dados canônica (Opção A) que vai alimentar a
base do futuro app — **sem decidir ainda como a ficha é calculada/montada**.

## Rodar

```bash
npm run extract          # lê a vault, reconstrói vault-data/ do zero
npm run test:extractor   # testes (node:test nativo)
```

Configurável por env (defaults apontam pra este setup):

| env | default |
|---|---|
| `PLEITOST_VAULT_ROOT` | `/data/vaults/pleitost` |
| `PLEITOST_PLUGIN_ROOT` | `<vault>/.obsidian/plugins/pleitost-autosheet` |
| `PLEITOST_EXTRACT_OUT` | `<repo>/vault-data` |

## Princípio (Opção A — lossless)

`body` + `frontmatter` reconstroem o documento. `inlineFields`, `ruleElements`,
`links`, `images`, `headings` são **índices derivados** por cima — nunca
substituem a fonte. A DSL de `Elementos_de_Regra` é **estruturada** (via o parser
real do plugin, fonte de verdade da gramática) mas **não avaliada**.

## Re-executável

Cada run faz **rebuild limpo** de `vault-data/` (apaga e recria). Logo: atualizou
no Obsidian → roda de novo → o output reflete adições, edições, renomeações e
**deleções** sem resíduo. Determinístico (sem timestamps, listas ordenadas) →
mesma vault produz o mesmo output → diffs limpos no git.

## Schema de cada registro

```jsonc
{
  "id": "Sistema/Regras/Regras",          // path relativo sem .md (identidade estável)
  "path": "Sistema/Regras/Regras.md",
  "basename": "Regras",                    // alvo de wikilink (como o Obsidian resolve)
  "type": "Regra",                          // = frontmatter.categoria (null se ausente)
  "subtype": "...",                         // = subcategoria
  "grupo": "...",                           // = grupo
  "frontmatter": { ... },                  // YAML parseado (chaves desconhecidas preservadas)
  "inlineFields": { "up": "[[Regras]]" },  // dataview `key:: value` (inclui dentro de %%)
  "ruleElements": [                         // de Elementos_de_Regra (FM)
    { "raw": "Nivel 1 Definir Vida.Vitalidade 15", "parsed": [ /* ParsedRule */ ] }
  ],
  "links": [ { "target": "Atributos", "kind": "wikilink" } ],   // grafo de referências
  "images": [ { "target": "Monge.jpeg", "from": "frontmatter:Imagem" } ],
  "headings": [ { "level": 2, "text": "..." } ],
  "body": "<markdown sem o frontmatter>"   // fonte preservada (%% incluído)
}
```

## Manifestos (raiz de `vault-data/`)

- **`index.json`** — todo doc `{id, path, basename, type, subtype, grupo, kind}` +
  `counts` + `byType`. `kind` é `content` ou `scaffolding` (templates/rascunhos/
  notas de teste/exportação/**Excalidraw** são **listados mas não extraídos** — nada
  some em silêncio; Excalidraw é fonte volátil).
- **`assets.json`** — `counts` + `assets[]` + `missing[]`. **Todas** as imagens da
  vault são copiadas pra `assets/` (referenciadas E órfãs); cada uma tem `path`,
  `basename`, `sha256`, `copiedTo`, `referencedBy` e `orphan`. Referências sem
  arquivo correspondente entram em `missing[]` (sinalizadas, não dropadas).

## Arquivos

| arquivo | papel |
|---|---|
| `extract-vault.mjs` | entry: orquestra walk → parse → escreve árvore + manifestos + copia binários |
| `walk.mjs` | descoberta de `.md`/imagens; classifica content vs scaffolding |
| `parse-doc.mjs` | um `.md` → registro Opção A |
| `parse-frontmatter.mjs` | separa FM/corpo; YAML (preserva cru se falhar) |
| `parse-inline-fields.mjs` | `key:: value` (linha e colchetado, dentro/fora de `%%`) |
| `parse-links.mjs` | wikilinks/embeds/imagens |
| `load-rule-parser.mjs` | carrega read-only o `rule-parser.ts` do plugin (transpile via `typescript`) |
| `paths.mjs` | resolução de caminhos (env-configurável) |
