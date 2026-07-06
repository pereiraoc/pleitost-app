// Gera design/preview/index.html a partir de design/pulled/Companion App.dc.html
// para QA visual (issue #20). Carrega React UMD 18 local antes do support.js
// (o dc-runtime usa window.React/window.ReactDOM se já presentes) e corrige os
// caminhos relativos do helmet (a página vive em preview/, os assets em pulled/).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'pulled', 'Companion App.dc.html'), 'utf8')

let out = src.replace(
  '<script src="./support.js"></script>',
  [
    '<script src="./vendor/react.production.min.js"></script>',
    '<script src="./vendor/react-dom.production.min.js"></script>',
    '<script src="../pulled/support.js"></script>',
  ].join('\n'),
)
// image-slot.js não foi puxado (infra do canvas, ver image-slot.js.note.md) — stub local.
out = out.replace('<script src="./image-slot.js"></script>', '<script src="./image-slot-stub.js"></script>')
out = out.replace('<script src="grupo-tips.js"></script>', '<script src="../pulled/grupo-tips.js"></script>')

if (out === src) throw new Error('nenhuma substituição aplicada — dc.html mudou?')
writeFileSync(join(here, 'index.html'), out)
console.log('ok: design/preview/index.html gerado (%d bytes)', out.length)
