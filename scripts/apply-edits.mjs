// Aplica um bundle de edições do app (pleitost-compendio-edits-*.json, gerado
// pelo "Exportar pro Obsidian" do Modo Dev) de volta na vault — round-trip
// app→Obsidian do épico #243. A vault é do USUÁRIO; este script só escreve
// quando VOCÊ o roda:
//
//   node scripts/apply-edits.mjs <bundle.json>
//   PLEITOST_VAULT_ROOT=/caminho/da/vault node scripts/apply-edits.mjs <bundle.json>
//
// Depois, `npm run extract` re-sincroniza o vault-data do app.
import fs from 'node:fs'
import path from 'node:path'

const VAULT_ROOT = path.resolve(process.env.PLEITOST_VAULT_ROOT ?? '/data/vaults/pleitost')
const file = process.argv[2]
if (!file) {
  console.error('uso: node scripts/apply-edits.mjs <bundle.json>')
  process.exit(1)
}

const bundle = JSON.parse(fs.readFileSync(file, 'utf8'))
let n = 0
for (const [rel, md] of Object.entries(bundle)) {
  const dest = path.resolve(VAULT_ROOT, rel)
  // Guarda: nunca escrever fora da raiz da vault.
  if (dest !== VAULT_ROOT && !dest.startsWith(VAULT_ROOT + path.sep)) {
    console.warn('IGNORADO (fora da vault):', rel)
    continue
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, md)
  console.log('escrito:', rel)
  n++
}
console.log(`\n${n} nota(s) aplicada(s). Rode \`npm run extract\` pra re-sincronizar o app.`)
