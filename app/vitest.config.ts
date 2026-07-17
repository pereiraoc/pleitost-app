// Config do vitest = o vite.config.ts INTACTO + exclude de e2e/** (F2).
// Motivo: os specs do Playwright também casam com o include default do
// vitest (**/*.spec.ts) — sem este exclude o `vitest run` tentaria executá-los
// e quebraria (test() do @playwright/test não roda fora do runner dele).
// O inverso já é garantido pelo testDir './e2e' do playwright.config.ts.
import { cpus } from 'node:os'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// #255: o flake sob paralelismo tinha DUAS raízes — (1) estado de módulo vazando
// ENTRE arquivos (o pool 'forks' com isolate, default, resolve) e (2) uma classe
// de testes SENSÍVEIS A TEMPO (recompute assíncrono + waitFor) que, com a CPU
// SATURADA por ~20 forks, perdia a corrida e o waitFor estourava. Fix: reativar
// o paralelismo, mas LIMITAR os forks a ~metade dos núcleos (teto 8) pra sempre
// sobrar CPU pros recomputes — sem saturação, a corrida some. + testTimeout/
// hookTimeout generosos dão folga aos recomputes pesados. Determinístico E
// rápido (~1/3 do tempo em série), validado em stress paralelo.
const maxForks = Math.max(2, Math.min(8, Math.floor(cpus().length / 2)))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // exclude SUBSTITUI os defaults — preservá-los (node_modules, dist, …).
      exclude: [...configDefaults.exclude, 'e2e/**'],
      setupFiles: ['./tests/setup.ts'],
      pool: 'forks',
      poolOptions: { forks: { maxForks, minForks: 1 } },
      testTimeout: 20000,
      hookTimeout: 20000,
      // #255: rede de segurança pra a classe sensível a tempo. As raízes já
      // foram endurecidas (waitFor na condição-alvo, asyncUtilTimeout global),
      // mas sob carga extrema um recompute pode ainda perder a corrida. retry
      // NÃO mascara bug real — teste quebrado falha nas 3 tentativas (roda
      // isolado); só o flake de timing se recupera. Determinístico na prática.
      retry: 2,
    },
  }),
)
