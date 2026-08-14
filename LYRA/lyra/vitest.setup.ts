// Global Vitest setup. Runs for every test file regardless of environment.
//
// Importing jest-dom here just registers extra `expect` matchers
// (toBeInTheDocument, toHaveTextContent, etc.) via `expect.extend()`.
// It does not touch the DOM at import time, so it is safe to load for
// the existing `environment: 'node'` tests as well as the `jsdom`
// component tests that opt in via a `// @vitest-environment jsdom`
// docblock at the top of the test file.
import '@testing-library/jest-dom/vitest'
