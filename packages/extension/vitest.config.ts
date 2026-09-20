import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
  /**
   * `background.ts` reads its backend config from globals that esbuild
   * substitutes at build time (see this package's `build` script). Vitest
   * imports the module directly, with no esbuild pass, so the same defaults
   * have to be supplied here or the import throws a ReferenceError.
   */
  define: {
    __BACKEND_URL__: JSON.stringify(process.env.BACKEND_URL ?? "http://localhost:3210"),
    __BACKEND_AUTH_TOKEN__: JSON.stringify(process.env.BACKEND_AUTH_TOKEN ?? ""),
  },
});
