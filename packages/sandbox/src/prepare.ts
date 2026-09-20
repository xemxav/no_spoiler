import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

import { buildEnv } from "./env.js";
import { allocatePort } from "./port.js";
import type { Registry } from "./registry.js";

/** Fixed base port to scan upward from; matches .env.example's own default. */
const BASE_PORT = 3210;

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Absolute root of the worktree containing `cwd`. */
export function getWorktreeRoot(cwd: string): string {
  return runGit(["rev-parse", "--show-toplevel"], cwd);
}

/** Absolute path to the .git dir shared by every worktree of this repo. */
function getGitCommonDir(cwd: string): string {
  const raw = runGit(["rev-parse", "--git-common-dir"], cwd);
  return resolve(cwd, raw);
}

/** Absolute paths of every worktree registered with this repo, main checkout included. */
function listWorktrees(cwd: string): string[] {
  const output = runGit(["worktree", "list", "--porcelain"], cwd);
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.slice("worktree ".length).trim());
    }
  }
  return paths;
}

function readRegistry(registryPath: string): Registry {
  if (!existsSync(registryPath)) {
    return {};
  }
  return JSON.parse(readFileSync(registryPath, "utf8")) as Registry;
}

function writeRegistry(registryPath: string, registry: Registry): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

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

/** Finds the first other worktree (besides `worktreeRoot`) that already has an .env, if any. */
function findSourceEnv(
  worktreeRoot: string,
  worktrees: string[],
): { path: string; content: string } | null {
  for (const candidate of worktrees) {
    if (resolve(candidate) === resolve(worktreeRoot)) {
      continue;
    }
    const envPath = join(candidate, ".env");
    if (existsSync(envPath)) {
      return { path: envPath, content: readFileSync(envPath, "utf8") };
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
  const registryPath = join(getGitCommonDir(cwd), "sandboxes.json");
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
  const source = findSourceEnv(worktreeRoot, worktrees);

  const { content, bootstrapped } = buildEnv({
    exampleEnv,
    sourceEnv: source?.content ?? null,
    port,
  });

  const envPath = join(worktreeRoot, ".env");
  writeFileSync(envPath, content);

  if (bootstrapped) {
    console.log(
      "No .env found in any worktree yet — bootstrapped .env from .env.example. " +
        "Fill in real secrets (e.g. TYPESAFE_API_KEY) before running `sandbox up`.",
    );
  }

  execFileSync("pnpm", ["install"], { cwd: worktreeRoot, stdio: "inherit" });

  registry[worktreeRoot] = { port, pid: null, status: "prepared" };
  writeRegistry(registryPath, registry);

  return { worktreeRoot, port, envPath, bootstrapped, registryPath };
}
