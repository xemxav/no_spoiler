import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "./app.js";

/**
 * .env lives at the worktree root (one per sandbox), not this package's
 * directory. `process.loadEnvFile()` resolves relative to `process.cwd()`,
 * which is `packages/backend/` when run via `pnpm`/`turbo` scripts, so it
 * must be pointed at the actual worktree root explicitly.
 */
const worktreeRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
process.loadEnvFile(join(worktreeRoot, ".env"));

const port = Number(process.env.PORT ?? 3210);
const client = new TypeSafeClient();
const app = createApp(client);

app.listen(port, "0.0.0.0", () => {
  console.log(`backend listening on 0.0.0.0:${port}`);
});
