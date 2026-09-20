import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import { buildEnv } from "./env.js";
import { getWorktreeRoot, listWorktrees } from "./git.js";
import { allocatePort } from "./port.js";
import { getRegistryPath, readRegistry, writeRegistry } from "./registry.js";

/** Fixed base port to scan upward from; matches .env.example's own default. */
const BASE_PORT = 3210;

/** Live TCP bind check: true if `port` can be bound right now. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => {
      resolvePromise(false);
    });
    server.listen(port, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

/**
 * Finds an existing .env to source values from: this worktree's own .env
 * takes priority (so re-running `prepare` reuses already-filled-in secrets
 * instead of re-bootstrapping over them), else the first other worktree
 * that already has one.
 */
function findSourceEnv(worktreeRoot: string, worktrees: string[]): string | null {
  const ownEnvPath = join(worktreeRoot, ".env");
  if (existsSync(ownEnvPath)) {
    return readFileSync(ownEnvPath, "utf8");
  }

  for (const candidate of worktrees) {
    if (resolve(candidate) === resolve(worktreeRoot)) {
      continue;
    }
    const envPath = join(candidate, ".env");
    if (existsSync(envPath)) {
      return readFileSync(envPath, "utf8");
    }
  }
  return null;
}

export interface PrepareResult {
  worktreeRoot: string;
  port: number;
  envPath: string;
  bootstrapped: boolean;
  registryPath: string;
}

/**
 * Runs `sandbox prepare` for the worktree containing `cwd`: allocates a port,
 * builds/bootstraps `.env`, runs `pnpm install`, and registers the sandbox
 * in the shared registry with status "prepared".
 */
export async function prepareSandbox(cwd: string): Promise<PrepareResult> {
  const worktreeRoot = getWorktreeRoot(cwd);
  const registryPath = getRegistryPath(cwd);
  const registry = readRegistry(registryPath);

  const port = await allocatePort({
    worktreePath: worktreeRoot,
    registry,
    basePort: BASE_PORT,
    isPortFree,
  });

  const exampleEnvPath = join(worktreeRoot, ".env.example");
  const exampleEnv = readFileSync(exampleEnvPath, "utf8");

  const worktrees = listWorktrees(cwd);
  const sourceEnv = findSourceEnv(worktreeRoot, worktrees);

  const { content, bootstrapped } = buildEnv({
    exampleEnv,
    sourceEnv,
    port,
  });

  const envPath = join(worktreeRoot, ".env");
  writeFileSync(envPath, content);

  execFileSync("pnpm", ["install"], { cwd: worktreeRoot, stdio: "inherit" });

  registry[worktreeRoot] = { port, pid: null, status: "prepared" };
  writeRegistry(registryPath, registry);

  return { worktreeRoot, port, envPath, bootstrapped, registryPath };
}
