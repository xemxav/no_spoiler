import { describe, expect, it } from "vitest";
import { buildEnv } from "./env.js";

const EXAMPLE_ENV = ["PORT=3210", "TYPESAFE_API_KEY=", "BACKEND_URL=http://localhost:3210", ""].join(
  "\n",
);

describe("buildEnv", () => {
  it("copies real values from a source .env for every non-port key", () => {
    const sourceEnv = ["PORT=3210", "TYPESAFE_API_KEY=real-secret-value", "BACKEND_URL=http://localhost:3210", ""].join(
      "\n",
    );

    const result = buildEnv({
      exampleEnv: EXAMPLE_ENV,
      sourceEnv,
      port: 3211,
    });

    expect(result.content).toBe(
      ["PORT=3211", "TYPESAFE_API_KEY=real-secret-value", "BACKEND_URL=http://localhost:3211", ""].join("\n"),
    );
  });

  it("always overrides PORT/BACKEND_URL with the freshly allocated port regardless of source", () => {
    const sourceEnv = ["PORT=9999", "TYPESAFE_API_KEY=abc", "BACKEND_URL=http://localhost:9999", ""].join("\n");

    const result = buildEnv({
      exampleEnv: EXAMPLE_ENV,
      sourceEnv,
      port: 4123,
    });

    expect(result.content).toContain("PORT=4123");
    expect(result.content).toContain("BACKEND_URL=http://localhost:4123");
    expect(result.content).not.toContain("9999");
  });

  it("marks the result as sourced (not bootstrapped) when a source .env is provided", () => {
    const result = buildEnv({
      exampleEnv: EXAMPLE_ENV,
      sourceEnv: "PORT=3210\nTYPESAFE_API_KEY=abc\nBACKEND_URL=http://localhost:3210\n",
      port: 3210,
    });

    expect(result.bootstrapped).toBe(false);
  });

  it("falls back to .env.example's own values when no source .env exists anywhere", () => {
    const result = buildEnv({
      exampleEnv: EXAMPLE_ENV,
      sourceEnv: null,
      port: 3210,
    });

    expect(result.content).toBe(["PORT=3210", "TYPESAFE_API_KEY=", "BACKEND_URL=http://localhost:3210", ""].join("\n"));
    expect(result.bootstrapped).toBe(true);
  });

  it("still overrides PORT/BACKEND_URL to the allocated port in the bootstrap fallback", () => {
    const result = buildEnv({
      exampleEnv: EXAMPLE_ENV,
      sourceEnv: null,
      port: 4500,
    });

    expect(result.content).toContain("PORT=4500");
    expect(result.content).toContain("BACKEND_URL=http://localhost:4500");
  });
});
