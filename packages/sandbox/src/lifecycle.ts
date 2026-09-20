import type { SandboxEntry } from "./registry.js";

export type UpDecision =
  | { kind: "no-entry" }
  | { kind: "already-running"; port: number; pid: number }
  | { kind: "spawn"; port: number };

/**
 * Pure decision for `sandbox up`, given this worktree's registry entry (if
 * any) and an injected liveness check for its recorded PID.
 */
export function decideUp(entry: SandboxEntry | undefined, isAlive: (pid: number) => boolean): UpDecision {
  if (!entry) {
    return { kind: "no-entry" };
  }
  if (entry.pid !== null && isAlive(entry.pid)) {
    return { kind: "already-running", port: entry.port, pid: entry.pid };
  }
  return { kind: "spawn", port: entry.port };
}

export type DownDecision = { kind: "no-entry" } | { kind: "not-running" } | { kind: "stop"; pid: number };

/**
 * Pure decision for `sandbox down` (also used for the stop step of
 * `sandbox destroy`), given this worktree's registry entry (if any) and an
 * injected liveness check for its recorded PID.
 */
export function decideDown(entry: SandboxEntry | undefined, isAlive: (pid: number) => boolean): DownDecision {
  if (!entry) {
    return { kind: "no-entry" };
  }
  if (entry.pid === null || !isAlive(entry.pid)) {
    return { kind: "not-running" };
  }
  return { kind: "stop", pid: entry.pid };
}

/** Registry mutation for a successful spawn: prepared -> running with a PID. */
export function markRunning(entry: SandboxEntry, pid: number): SandboxEntry {
  return { ...entry, pid, status: "running" };
}

/** Registry mutation for a successful stop: running -> prepared, PID cleared. */
export function markStopped(entry: SandboxEntry): SandboxEntry {
  return { ...entry, pid: null, status: "prepared" };
}
