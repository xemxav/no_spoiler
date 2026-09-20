import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getGitCommonDir, getWorktreeRoot } from "./git.js";

export interface SandboxEntry {
  port: number;
  pid: number | null;
  status: "prepared" | "running";
}

export type Registry = Record<string, SandboxEntry>;

/** Absolute path to the shared registry file for the repo containing `cwd`. */
export function getRegistryPath(cwd: string): string {
  return join(getGitCommonDir(cwd), "sandboxes.json");
}

export function readRegistry(registryPath: string): Registry {
  if (!existsSync(registryPath)) {
    return {};
  }
  return JSON.parse(readFileSync(registryPath, "utf8")) as Registry;
}

export function writeRegistry(registryPath: string, registry: Registry): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

export interface LoadedEntry {
  worktreeRoot: string;
  registryPath: string;
  registry: Registry;
  entry: SandboxEntry | undefined;
}

/** Resolves the worktree for `cwd` and loads its registry entry, if any. */
export function loadEntry(cwd: string): LoadedEntry {
  const worktreeRoot = getWorktreeRoot(cwd);
  const registryPath = getRegistryPath(cwd);
  const registry = readRegistry(registryPath);
  return { worktreeRoot, registryPath, registry, entry: registry[worktreeRoot] };
}
