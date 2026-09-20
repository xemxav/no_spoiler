import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getGitCommonDir } from "./git.js";

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
