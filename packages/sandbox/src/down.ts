import { decideDown, markStopped } from "./lifecycle.js";
import { isProcessAlive, stopProcessGroup } from "./process.js";
import { loadEntry, writeRegistry } from "./registry.js";

export interface DownResult {
  worktreeRoot: string;
  stopped: boolean;
  pid: number | null;
}

/**
 * Runs `sandbox down` for the worktree containing `cwd`: no-ops if nothing
 * is running, otherwise stops the recorded process group and clears the
 * PID, leaving the port and .env untouched.
 */
export async function downSandbox(cwd: string): Promise<DownResult> {
  const { worktreeRoot, registryPath, registry, entry } = loadEntry(cwd);

  const decision = decideDown(entry, isProcessAlive);

  if (decision.kind !== "stop") {
    return { worktreeRoot, stopped: false, pid: null };
  }
  if (!entry) {
    throw new Error("unreachable: decideDown returned stop without a registry entry");
  }

  await stopProcessGroup(decision.pid);

  registry[worktreeRoot] = markStopped(entry);
  writeRegistry(registryPath, registry);

  return { worktreeRoot, stopped: true, pid: decision.pid };
}
