// ESLint flat config (#291) — o valor principal é o eslint-plugin-react-hooks:
// rules-of-hooks (erro) pega hook chamado condicionalmente/fora de componente e
// immutability (erro) pega mutação de estado de módulo durante o render — a
// classe de bug que o tsc não vê. typescript-eslint (não type-aware, pra ficar
// rápido) adiciona correção básica.
//
// react-hooks v7 traz também as regras "React-Compiler-forward" (refs,
// set-state-in-effect, preserve-manual-memoization). Este app NÃO usa o React
// Compiler, então elas são ADVISORY aqui: ficam em `warn` (visíveis como dívida,
// não bloqueiam) em vez de forçar um refactor amplo de risco. no-explicit-any e
// react-refresh idem (estilísticos/Fast-Refresh). Arquivos GERADOS (espelho do
// plugin) e artefatos ficam de fora — lintá-los é ruído sem dono.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

// regras react-hooks v7 avançadas rebaixadas a warn (advisory sem React Compiler)
const COMPILER_FORWARD_WARN = {
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/refs': 'warn',
  'react-hooks/preserve-manual-memoization': 'warn',
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'test-results',
      'playwright-report',
      'src/generated/**', // gen-tokens / gen-parsers (espelho do plugin)
      'src/data/plugin-parsers.ts', // gen-parsers (espelho do plugin)
    ],
  },
  // fonte do app (browser)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...COMPILER_FORWARD_WARN,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // tsc já cobre variáveis/params não usados (noUnusedLocals/Parameters);
      // desliga o duplo pra não brigar com o padrão _prefixado.
      '@typescript-eslint/no-unused-vars': 'off',
      // estilístico — testes/mocks legitimamente usam any; visível como aviso.
      '@typescript-eslint/no-explicit-any': 'warn',
      // dead-store: os poucos casos atuais são fidelidade a algoritmo de
      // referência (cube-round) / espelho do plugin (slot-accounting) — advisory.
      'no-useless-assignment': 'warn',
    },
  },
  // testes: jsdom + globals de teste importados explicitamente (sem globals:true)
  {
    files: ['tests/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  // configs .ts (vite/vitest/playwright): parser TS + globals node
  {
    files: ['*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // scripts de build/geração e o próprio eslint.config (node, JS puro)
  {
    files: ['scripts/**/*.{js,mjs}', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
)
