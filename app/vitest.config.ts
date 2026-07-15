// Config do vitest = o vite.config.ts INTACTO + exclude de e2e/** (F2).
// Motivo: os specs do Playwright também casam com o include default do
// vitest (**/*.spec.ts) — sem este exclude o `vitest run` tentaria executá-los
// e quebraria (test() do @playwright/test não roda fora do runner dele).
// O inverso já é garantido pelo testDir './e2e' do playwright.config.ts.
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // exclude SUBSTITUI os defaults — preservá-los (node_modules, dist, …).
      exclude: [...configDefaults.exclude, 'e2e/**'],
      // #255: paralelismo REATIVADO com isolamento por PROCESSO — cada arquivo de
      // teste roda no seu próprio fork (isolate), então os stores globais de módulo
      // (hero-store, local-entities, session-store, caches de doc, registries de
      // doc-view/leaf-view) NÃO vazam entre arquivos concorrentes. Antes a suite
      // rodava em série (fileParallelism:false) como mitigação; o isolamento por
      // fork resolve a raiz e devolve o paralelismo.
      pool: 'forks',
      poolOptions: { forks: { isolate: true } },
    },
  }),
)
