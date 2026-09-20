import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isProcessAlive, waitForExit } from "./process.js";

describe("isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false once a spawned child has exited", async () => {
    const child = spawn("true", [], { stdio: "ignore" });
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("expected spawned child to have a PID");
    }
    await new Promise((resolveExit) => child.once("exit", resolveExit));

    expect(isProcessAlive(pid)).toBe(false);
  });
});

describe("waitForExit", () => {
  it("resolves true as soon as isAlive reports false", async () => {
    let calls = 0;
    const isAlive = () => {
      calls += 1;
      return calls < 3;
    };

    const exited = await waitForExit(isAlive, 1000, 5);

    expect(exited).toBe(true);
    expect(calls).toBe(3);
  });

  it("resolves false once the timeout elapses while isAlive keeps reporting true", async () => {
    const exited = await waitForExit(() => true, 30, 10);

    expect(exited).toBe(false);
  });
});
