#!/usr/bin/env node
import { prepareSandbox } from "./prepare.js";

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);

  switch (command) {
    case "prepare": {
      const result = await prepareSandbox(process.cwd());
      console.log(`Worktree:  ${result.worktreeRoot}`);
      console.log(`Port:      ${result.port}`);
      console.log(`.env:      ${result.envPath}${result.bootstrapped ? " (bootstrapped)" : ""}`);
      console.log(`Registry:  ${result.registryPath}`);
      console.log("Status:    prepared");
      if (result.bootstrapped) {
        console.log(
          "\nNo .env found in any worktree yet — bootstrapped .env from .env.example. " +
            "Fill in real secrets (e.g. TYPESAFE_API_KEY) before running `sandbox up`.",
        );
      }
      break;
    }
    default: {
      console.error(`Unknown command: ${command ?? "(none)"}`);
      console.error("Usage: sandbox prepare");
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
