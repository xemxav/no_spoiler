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
