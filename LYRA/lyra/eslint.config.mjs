import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactPackageJson from "react/package.json" with { type: "json" };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next bundles eslint-plugin-react with `settings.react.version:
    // "detect"`, which auto-detects React's version via the rule context's
    // `getFilename()` method. ESLint 10 removed that legacy Context API method
    // (no replacement is called by eslint-plugin-react's detector), so "detect"
    // now crashes the linter with "contextOrFilename.getFilename is not a
    // function" before it even reaches user rules. eslint-plugin-react has not
    // published an ESLint-10-compatible release yet, so as a stopgap we pin the
    // version explicitly (read from the installed react package) to skip the
    // broken auto-detection path entirely. Safe to remove once eslint-plugin-react
    // ships a fix.
    settings: {
      react: {
        version: reactPackageJson.version,
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
