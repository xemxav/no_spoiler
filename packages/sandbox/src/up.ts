import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

import { decideUp, markRunning } from "./lifecycle.js";
import { isProcessAlive } from "./process.js";
import { loadEntry, writeRegistry } from "./registry.js";

export interface UpResult {
  worktreeRoot: string;
  port: number;
  pid: number;
  logPath: string;
  alreadyRunning: boolean;
}

/**
 * Runs `sandbox up` for the worktree containing `cwd`: no-ops if already
 * running, otherwise spawns `pnpm dev` (which fans out via turbo) detached
 * in its own process group, logging to `.sandbox/dev.log`, and records the
 * PID in the shared registry with status "running".
 */
export async function upSandbox(cwd: string): Promise<UpResult> {
  const { worktreeRoot, registryPath, registry, entry } = loadEntry(cwd);

  const decision = decideUp(entry, isProcessAlive);

  if (decision.kind === "no-entry") {
    throw new Error(`No sandbox registered for ${worktreeRoot}. Run \`sandbox prepare\` first.`);
  }

  const logPath = join(worktreeRoot, ".sandbox", "dev.log");

  if (decision.kind === "already-running") {
    return {
      worktreeRoot,
      port: decision.port,
      pid: decision.pid,
      logPath,
      alreadyRunning: true,
    };
  }

  if (!entry) {
    throw new Error("unreachable: decideUp returned spawn without a registry entry");
  }

  mkdirSync(join(worktreeRoot, ".sandbox"), { recursive: true });
  const logFd = openSync(logPath, "a");

  const child = spawn("pnpm", ["dev"], {
    cwd: worktreeRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("Failed to spawn dev process: no PID assigned");
  }

  registry[worktreeRoot] = markRunning(entry, pid);
  writeRegistry(registryPath, registry);

  return { worktreeRoot, port: decision.port, pid, logPath, alreadyRunning: false };
}
