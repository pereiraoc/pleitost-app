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
      // #255: arquivos de teste rodam em SÉRIE. A suite tem stores globais
      // (hero-store, local-entities, session-store, caches de doc) resetados
      // POR arquivo mas não isolados ENTRE arquivos paralelos — em paralelo um
      // teste às vezes "perde a corrida" e falha de forma não-determinística
      // (isolado sempre passa). Serial deixa a suite 100% determinística
      // (~68s vs ~13s); a raiz (isolar o estado global) é dívida rastreada.
      fileParallelism: false,
    },
  }),
)
