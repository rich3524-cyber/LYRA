import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Default environment for the whole suite stays 'node'. It's what all
    // existing tests (services/, lib/, app/api/**/route.test.ts) run under
    // today — route handlers, pure functions, mocked Prisma — none of which
    // need a DOM, and node is faster/lighter than jsdom.
    //
    // Component tests opt into a DOM environment on a per-file basis with a
    // `// @vitest-environment jsdom` docblock at the top of the test file
    // (Vitest 4's supported mechanism — the config-level
    // `environmentMatchGlobs` option some older setups used was removed and
    // is not available in the installed vitest@4.1.10).
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./vitest.setup.ts'],
    env: {
      OAUTH_STATE_SECRET: 'test-oauth-state-secret',
    },
  },
})
