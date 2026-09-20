import { describe, expect, it } from "vitest";
import { allocatePort } from "./port.js";

describe("allocatePort", () => {
  it("allocates the first free port from the base when nothing is claimed", async () => {
    const port = await allocatePort({
      worktreePath: "/repo/main",
      registry: {},
      basePort: 4000,
      isPortFree: async () => true,
    });

    expect(port).toBe(4000);
  });

  it("skips ports already claimed as a value in the registry", async () => {
    const port = await allocatePort({
      worktreePath: "/repo/main",
      registry: {
        "/repo/other": { port: 4000, pid: null, status: "prepared" },
      },
      basePort: 4000,
      isPortFree: async () => true,
    });

    expect(port).toBe(4001);
  });

  it("skips ports that fail the live TCP bind check", async () => {
    const boundPorts = new Set([4000, 4001]);

    const port = await allocatePort({
      worktreePath: "/repo/main",
      registry: {},
      basePort: 4000,
      isPortFree: async (candidate) => !boundPorts.has(candidate),
    });

    expect(port).toBe(4002);
  });

  it("reuses this worktree's existing registry assignment on re-run", async () => {
    const port = await allocatePort({
      worktreePath: "/repo/main",
      registry: {
        "/repo/main": { port: 4007, pid: null, status: "prepared" },
      },
      basePort: 4000,
      isPortFree: async () => {
        throw new Error("should not be called when an assignment is reused");
      },
    });

    expect(port).toBe(4007);
  });
});
