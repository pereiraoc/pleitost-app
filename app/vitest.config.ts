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
      // #255: arquivos rodam em SÉRIE (mitigação determinística). Tentei devolver
      // o paralelismo com pool 'forks' + isolate (cada arquivo no próprio
      // processo), mas alguns testes SENSÍVEIS A TEMPO (rules-ui CLASSE INICIAL,
      // rules-perf BFS) ainda "perdem a corrida" sob carga paralela (~1 em 4-7
      // runs) — o isolamento por processo não cobre races INTRA-arquivo/de timing.
      // Em série a suite é 100% determinística (~80s); a raiz (tornar esses testes
      // robustos a timing) segue rastreada na #255.
      fileParallelism: false,
    },
  }),
)
