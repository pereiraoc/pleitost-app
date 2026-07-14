// Gera src/generated/{rule-parser,display-names,parse-condition-rule}.ts a
// partir da FONTE DE VERDADE (plugin pleitost-autosheet) — o MESMO reuso
// read-only que o extractor faz em node, agora empacotado pro BROWSER. Habilita
// a validação viva do editor de regras (F9, épico #243) sem reimplementar a DSL
// (no_invented_strings): editar um elemento → re-parsear com o parser real.
//
// Determinístico: cópia verbatim + reescrita mínima de imports. `// @ts-nocheck`
// porque é código do plugin (tsconfig do app é mais estrito); a superfície
// tipada fica na fachada src/data/plugin-parsers.ts. Rode `npm run parsers`
// quando o parser do plugin mudar; os arquivos gerados são commitados (o build
// não depende da vault).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RULE_PARSER_TS, CONDITION_PARSER_TS, DISPLAY_NAMES_TS } from '../../extractor/paths.mjs'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(appDir, 'src', 'generated')
fs.mkdirSync(outDir, { recursive: true })

const banner = (srcName) =>
  `// @ts-nocheck\n` +
  `// GERADO por app/scripts/gen-parsers.mjs a partir do plugin pleitost-autosheet\n` +
  `// (fonte da verdade: src/.../${srcName}). NÃO EDITAR À MÃO — rode \`npm run parsers\`.\n` +
  `// Reuso READ-ONLY da gramática, igual ao extractor; habilita validação viva no browser (F9).\n\n`

function emit(srcPath, outName, transform = (s) => s) {
  const src = fs.readFileSync(srcPath, 'utf8')
  fs.writeFileSync(path.join(outDir, outName), banner(path.basename(srcPath)) + transform(src))
  console.log(`[gen-parsers] ${outName} ←`, path.basename(srcPath))
}

// rule-parser.ts: parser puro, zero imports → verbatim.
emit(RULE_PARSER_TS, 'rule-parser.ts')

// display-names.ts: autocontido → verbatim (dep runtime `slugify` do condition).
emit(DISPLAY_NAMES_TS, 'display-names.ts')

// parse-condition-rule.ts: dropa os `import type` do plugin (erasados no runtime,
// ignorados pelo @ts-nocheck) e aponta o único import runtime (slugify) pro
// display-names gerado ao lado.
emit(CONDITION_PARSER_TS, 'parse-condition-rule.ts', (s) =>
  s
    .replace(/^\s*import\s+type\s+.*$/gm, '')
    .replace(/(from\s+['"])\.\.\/\.\.\/util\/display-names(['"])/g, '$1./display-names$2'),
)
