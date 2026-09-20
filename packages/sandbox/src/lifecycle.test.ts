import { describe, expect, it } from "vitest";
import { decideDown, decideUp, markRunning, markStopped } from "./lifecycle.js";

const alwaysAlive = () => true;
const neverAlive = () => false;

describe("decideUp", () => {
  it("reports no-entry when prepare was never run for this worktree", () => {
    const decision = decideUp(undefined, alwaysAlive);
    expect(decision).toEqual({ kind: "no-entry" });
  });

  it("spawns when the entry has no recorded PID", () => {
    const decision = decideUp({ port: 4000, pid: null, status: "prepared" }, alwaysAlive);
    expect(decision).toEqual({ kind: "spawn", port: 4000 });
  });

  it("spawns when the recorded PID is no longer alive", () => {
    const decision = decideUp({ port: 4000, pid: 123, status: "running" }, neverAlive);
    expect(decision).toEqual({ kind: "spawn", port: 4000 });
  });

  it("reports already-running when the recorded PID is alive", () => {
    const decision = decideUp({ port: 4000, pid: 123, status: "running" }, alwaysAlive);
    expect(decision).toEqual({ kind: "already-running", port: 4000, pid: 123 });
  });
});

describe("decideDown", () => {
  it("reports no-entry when prepare was never run for this worktree", () => {
    const decision = decideDown(undefined, alwaysAlive);
    expect(decision).toEqual({ kind: "no-entry" });
  });

  it("reports not-running when the entry has no recorded PID", () => {
    const decision = decideDown({ port: 4000, pid: null, status: "prepared" }, alwaysAlive);
    expect(decision).toEqual({ kind: "not-running" });
  });

  it("reports not-running when the recorded PID is no longer alive", () => {
    const decision = decideDown({ port: 4000, pid: 123, status: "running" }, neverAlive);
    expect(decision).toEqual({ kind: "not-running" });
  });

  it("reports stop with the PID when the recorded PID is alive", () => {
    const decision = decideDown({ port: 4000, pid: 123, status: "running" }, alwaysAlive);
    expect(decision).toEqual({ kind: "stop", pid: 123 });
  });
});

describe("markRunning", () => {
  it("sets the PID and status:running, preserving the port", () => {
    const entry = markRunning({ port: 4000, pid: null, status: "prepared" }, 456);
    expect(entry).toEqual({ port: 4000, pid: 456, status: "running" });
  });
});

describe("markStopped", () => {
  it("clears the PID and sets status:prepared, preserving the port", () => {
    const entry = markStopped({ port: 4000, pid: 456, status: "running" });
    expect(entry).toEqual({ port: 4000, pid: null, status: "prepared" });
  });
});
