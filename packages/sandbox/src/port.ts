import type { Registry } from "./registry.js";

export interface AllocatePortInput {
  /** Absolute path of the worktree requesting a port. */
  worktreePath: string;
  /** Current shared registry state (worktree path -> entry). */
  registry: Registry;
  /** Fixed port to start scanning upward from. */
  basePort: number;
  /** Live TCP bind check for a candidate port. */
  isPortFree: (port: number) => Promise<boolean>;
}

/**
 * Allocates a port for `worktreePath`, reusing its existing registry
 * assignment if one is already recorded. Otherwise scans upward from
 * `basePort`, skipping ports already claimed as a value in the registry
 * and ports that fail the injected live bind check.
 */
export async function allocatePort(input: AllocatePortInput): Promise<number> {
  const { worktreePath, registry, basePort, isPortFree } = input;

  const existing = registry[worktreePath];
  if (existing) {
    return existing.port;
  }

  const claimed = new Set(Object.values(registry).map((entry) => entry.port));

  let candidate = basePort;
  while (claimed.has(candidate) || !(await isPortFree(candidate))) {
    candidate += 1;
  }

  return candidate;
}
