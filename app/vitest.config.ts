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
    },
  }),
)
