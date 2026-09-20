import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp, resolveListenOptions } from "./app.js";

/**
 * Local sandbox: .env lives at the worktree root (one per sandbox), not this
 * package's directory. `process.loadEnvFile()` resolves relative to
 * `process.cwd()`, which is `packages/backend/` when run via `pnpm`/`turbo`
 * scripts, so it must be pointed at the actual worktree root explicitly.
 *
 * Deployed (Railway): there is no git checkout and no .env file, and the
 * platform injects its variables into `process.env` directly. Both lookups
 * are therefore allowed to come up empty instead of throwing.
 */
function loadWorktreeEnvFile(): void {
  let worktreeRoot: string;
  try {
    worktreeRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return;
  }

  const envPath = join(worktreeRoot, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

loadWorktreeEnvFile();

const { port, host } = resolveListenOptions();
const client = new TypeSafeClient();
const app = createApp(client, { authToken: process.env.BACKEND_AUTH_TOKEN });

app.listen(port, host, () => {
  console.log(`backend listening on ${host}:${port}`);
});
