/**
 * True if a process with this PID is currently alive. Sends signal 0, which
 * the OS validates without actually delivering a signal, and throws if no
 * such process exists.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** How long to wait for a graceful SIGTERM exit before escalating to SIGKILL. */
const GRACEFUL_TIMEOUT_MS = 5000;
/** SIGKILL can't be caught or blocked, so this only needs to cover scheduling delay. */
const KILL_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * Polls the injected `isAlive` check every `intervalMs` until it reports
 * false or `timeoutMs` elapses. Returns true if it exited within the
 * window, false if the timeout was hit while still alive.
 */
export async function waitForExit(
  isAlive: () => boolean,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (isAlive()) {
    if (Date.now() >= deadline) {
      return false;
    }
    await delay(intervalMs);
  }

  return true;
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
    await waitForExit(() => isProcessAlive(pid), KILL_TIMEOUT_MS, POLL_INTERVAL_MS);
  }
}
