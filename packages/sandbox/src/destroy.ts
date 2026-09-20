import { rmSync } from "node:fs";
import { join } from "node:path";

import { decideDown } from "./lifecycle.js";
import { isProcessAlive, stopProcessGroup } from "./process.js";
import { loadEntry, writeRegistry } from "./registry.js";

export interface DestroyResult {
  worktreeRoot: string;
  stopped: boolean;
}

/**
 * Runs `sandbox destroy` for the worktree containing `cwd`: stops the
 * sandbox if running (same logic as `sandbox down`), frees its port by
 * removing its registry entry entirely, and deletes .env, node_modules,
 * and the .sandbox log directory. Never touches the underlying git
 * worktree.
 */
export async function destroySandbox(cwd: string): Promise<DestroyResult> {
  const { worktreeRoot, registryPath, registry, entry } = loadEntry(cwd);

  const decision = decideDown(entry, isProcessAlive);
  const stopped = decision.kind === "stop";
  if (decision.kind === "stop") {
    await stopProcessGroup(decision.pid);
  }

  delete registry[worktreeRoot];
  writeRegistry(registryPath, registry);

  rmSync(join(worktreeRoot, ".env"), { force: true });
  rmSync(join(worktreeRoot, "node_modules"), { recursive: true, force: true });
  rmSync(join(worktreeRoot, ".sandbox"), { recursive: true, force: true });

  return { worktreeRoot, stopped };
}
