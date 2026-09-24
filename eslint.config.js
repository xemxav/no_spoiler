// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  {
    // Build-time scripts run under Node, not in a browser or a service worker.
    files: ["**/scripts/*.mjs"],
    languageOptions: {
      globals: { Buffer: "readonly", console: "readonly", process: "readonly" },
    },
  },
);
