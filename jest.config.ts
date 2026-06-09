import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  projects: [
    {
      // Node environment — API routes, services, workers, lib utilities
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/node/**/*.test.ts', '**/__tests__/*.test.ts'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }] },
    },
    {
      // jsdom environment — React components
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/components/**/*.test.tsx'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }] },
    },
  ],
}

export default config
