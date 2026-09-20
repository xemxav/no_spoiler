import { getWorktreeRoot } from "./git.js";
import { decideDown, markStopped } from "./lifecycle.js";
import { isProcessAlive, waitForExit } from "./process.js";
import { getRegistryPath, readRegistry, writeRegistry } from "./registry.js";

/** How long to wait for a graceful SIGTERM exit before escalating to SIGKILL. */
const GRACEFUL_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

export interface DownResult {
  worktreeRoot: string;
  stopped: boolean;
  pid: number | null;
}

/**
 * Sends SIGTERM to the whole process group rooted at `pid` (negative PID
 * signals the group, valid because the child was spawned detached and is
 * therefore its own group leader), waits briefly for it to exit, then
 * escalates to SIGKILL if it's still alive.
 */
export async function stopProcessGroup(pid: number): Promise<void> {
  process.kill(-pid, "SIGTERM");
  const exited = await waitForExit(() => isProcessAlive(pid), GRACEFUL_TIMEOUT_MS, POLL_INTERVAL_MS);
  if (!exited) {
    process.kill(-pid, "SIGKILL");
    await waitForExit(() => isProcessAlive(pid), GRACEFUL_TIMEOUT_MS, POLL_INTERVAL_MS);
  }
}

/**
 * Runs `sandbox down` for the worktree containing `cwd`: no-ops if nothing
 * is running, otherwise stops the recorded process group and clears the
 * PID, leaving the port and .env untouched.
 */
export async function downSandbox(cwd: string): Promise<DownResult> {
  const worktreeRoot = getWorktreeRoot(cwd);
  const registryPath = getRegistryPath(cwd);
  const registry = readRegistry(registryPath);
  const entry = registry[worktreeRoot];

  const decision = decideDown(entry, isProcessAlive);

  if (decision.kind !== "stop") {
    return { worktreeRoot, stopped: false, pid: null };
  }

  await stopProcessGroup(decision.pid);

  registry[worktreeRoot] = markStopped(entry!);
  writeRegistry(registryPath, registry);

  return { worktreeRoot, stopped: true, pid: decision.pid };
}
