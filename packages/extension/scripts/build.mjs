/**
 * Bundles the extension into `dist/`, pointed at one backend address.
 *
 * The address is, in order: `BACKEND_URL` from the shell (the Railway build in
 * `docs/deployment.md`); else `BACKEND_URL` from the `.env` at the git worktree
 * root, the same file the backend loads, so a sandbox on any port builds an
 * extension that talks to it; else `http://localhost:3210`, for a fresh clone.
 *
 * The service worker can only reach hosts the manifest grants, and the backend
 * sends no CORS headers. So a localhost address on another port replaces the
 * source manifest's `http://localhost:3210/*` grant in `dist/`: that one
 * origin, not every localhost port.
 *
 * `--watch` keeps esbuild rebuilding on change, for `pnpm dev`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import * as esbuild from "esbuild";

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(PACKAGE_DIR, "dist");
const DEFAULT_BACKEND_URL = "http://localhost:3210";
const DEFAULT_LOCAL_GRANT = "http://localhost:3210/*";

/** The worktree's `.env`, parsed, or null outside a checkout or without one. */
function readWorktreeEnv() {
  let worktreeRoot;
  try {
    worktreeRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }

  const envPath = join(worktreeRoot, ".env");
  return existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : null;
}

/** An empty value counts as unset, as `${BACKEND_URL:-…}` treated it. */
function resolveBackendUrl() {
  return process.env.BACKEND_URL || readWorktreeEnv()?.BACKEND_URL || DEFAULT_BACKEND_URL;
}

/** The source manifest, with its localhost grant moved to `backendUrl`'s origin if local. */
function manifestFor(backendUrl) {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "manifest.json"), "utf8"));
  const address = new URL(backendUrl);
  if (address.hostname !== "localhost") return manifest;

  const grant = `${address.origin}/*`;
  manifest.host_permissions = manifest.host_permissions.map((pattern) =>
    pattern === DEFAULT_LOCAL_GRANT ? grant : pattern,
  );
  return manifest;
}

const watch = process.argv.includes("--watch");
const backendUrl = resolveBackendUrl();

mkdirSync(DIST, { recursive: true });
for (const file of ["popup.html", "popup.css"]) {
  cpSync(join(PACKAGE_DIR, file), join(DIST, file));
}
for (const dir of ["icons", "fonts"]) {
  cpSync(join(PACKAGE_DIR, dir), join(DIST, dir), { recursive: true });
}
writeFileSync(
  join(DIST, "manifest.json"),
  JSON.stringify(manifestFor(backendUrl), null, 2) + "\n",
);

const options = {
  entryPoints: ["src/content-script.ts", "src/background.ts", "src/popup.ts"].map((entry) =>
    join(PACKAGE_DIR, entry),
  ),
  bundle: true,
  outdir: DIST,
  format: "iife",
  platform: "browser",
  define: { __BACKEND_URL__: JSON.stringify(backendUrl) },
  logLevel: "info",
};

console.log(`extension backend: ${backendUrl}`);
if (watch) {
  await (await esbuild.context(options)).watch();
} else {
  await esbuild.build(options);
}
