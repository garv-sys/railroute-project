import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".scratch/**",
    "prisma/client/**",
    "debug-rapid.js",
    "scratch.js",
    "scratch.ts",
    "test-*.js",
    "test-*.ts",
    "next-env.d.ts",
    "railroute-project/**",
    "railroute-project 2/**",
  ]),
]);

export default eslintConfig;
