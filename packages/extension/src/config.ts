/**
 * Build-time config, injected by esbuild `define` (see `scripts/build.mjs`,
 * which reads `BACKEND_URL` from the shell, else from the worktree's `.env`).
 * It defaults to the local sandbox backend; point it at the deployed Railway
 * URL to build against that instead.
 *
 * This is only the *default*. The address actually used is read from settings
 * per request, and falls back here when the user has never set one.
 */
declare const __BACKEND_URL__: string;

export const DEFAULT_BACKEND_URL: string = __BACKEND_URL__;
