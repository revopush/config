import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Only src/test are part of a tsconfig project, which type-aware rules (no-floating-promises)
    // need; tsup.config.ts still gets the non-type-aware rules above via the default file match.
    files: ["packages/*/src/**/*.ts", "packages/*/test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An async config loader that drops a rejection silently is exactly the failure mode this
      // library exists to avoid, so an unhandled promise is an error, not a lint warning.
      "@typescript-eslint/no-floating-promises": "error",
      // Recommended's default already flags unused vars; this only adds the leading-underscore
      // escape hatch for intentionally-unused parameters (e.g. an interface a source must satisfy).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Disabled, not duplicated by Prettier: convict's own types don't line up with this
      // library's Schema type, and a couple of tests deliberately pass a mistyped key to assert
      // the runtime rejects it. Both are intentional escape hatches, not oversights.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
