import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Server components render per request and intentionally read the clock.
    files: ["app/**/page.tsx", "app/**/layout.tsx", "components/website/cards.tsx", "components/website/blocks.tsx", "components/dashboard/ui.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // Resetting UI state on navigation / mount is intentional in these effects.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
