import { describe, expect, it } from "vitest";
import { SCAFFOLD_READY } from "./index.js";

describe("shared package scaffold", () => {
  it("builds and runs under the workspace test task", () => {
    expect(SCAFFOLD_READY).toBe(true);
  });
});
