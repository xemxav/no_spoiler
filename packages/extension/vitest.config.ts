import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
  /**
   * `background.ts` reads its backend URL from a global that esbuild
   * substitutes at build time (see `scripts/build.mjs`). Vitest
   * imports the module directly, with no esbuild pass, so the same default
   * has to be supplied here or the import throws a ReferenceError.
   */
  define: {
    __BACKEND_URL__: JSON.stringify(process.env.BACKEND_URL ?? "http://localhost:3210"),
  },
});
