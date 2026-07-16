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
      // #255: arquivos em SÉRIE (mitigação determinística, ~80s). O flake sob
      // paralelismo NÃO é só vazamento de estado entre arquivos (isso o pool
      // 'forks'+isolate resolve) — é uma classe de testes SENSÍVEIS A TEMPO que,
      // sob CPU saturada por N forks, perdem a corrida de recompute assíncrono
      // (waitFor estoura o timeout): rules-ui, rules-perf, combate-toggles-import
      // e provavelmente outros. Já endurecidos na raiz: rules-ui CLASSE INICIAL
      // (waitFor no persist do overlay) e rules-perf BFS (prova estrutural via
      // maxInFlight, não wall-clock). Reativar o paralelismo exige endurecer o
      // resto (waitFor/timeouts) — rastreado na #255. Em série é 100% verde.
      fileParallelism: false,
    },
  }),
)
