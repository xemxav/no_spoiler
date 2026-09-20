import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Absolute root of the worktree containing `cwd`. */
export function getWorktreeRoot(cwd: string): string {
  return runGit(["rev-parse", "--show-toplevel"], cwd);
}

/** Absolute path to the .git dir shared by every worktree of this repo. */
export function getGitCommonDir(cwd: string): string {
  const raw = runGit(["rev-parse", "--git-common-dir"], cwd);
  return resolve(cwd, raw);
}

/** Absolute paths of every worktree registered with this repo, main checkout included. */
export function listWorktrees(cwd: string): string[] {
  const output = runGit(["worktree", "list", "--porcelain"], cwd);
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.slice("worktree ".length).trim());
    }
  }
  return paths;
}
