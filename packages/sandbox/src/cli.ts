#!/usr/bin/env node
import { destroySandbox } from "./destroy.js";
import { downSandbox } from "./down.js";
import { prepareSandbox } from "./prepare.js";
import { upSandbox } from "./up.js";

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
    case "up": {
      const result = await upSandbox(process.cwd());
      if (result.alreadyRunning) {
        console.log(`Already running on port ${result.port}, PID ${result.pid}`);
      } else {
        console.log(`Worktree:  ${result.worktreeRoot}`);
        console.log(`Port:      ${result.port}`);
        console.log(`PID:       ${result.pid}`);
        console.log(`Log:       ${result.logPath}`);
        console.log("Status:    running");
      }
      break;
    }
    case "down": {
      const result = await downSandbox(process.cwd());
      if (result.stopped) {
        console.log(`Stopped PID ${result.pid} for ${result.worktreeRoot}`);
      } else {
        console.log(`Nothing running for ${result.worktreeRoot}`);
      }
      break;
    }
    case "destroy": {
      const result = await destroySandbox(process.cwd());
      console.log(
        `Destroyed sandbox for ${result.worktreeRoot}${result.stopped ? " (was running, stopped)" : ""}`,
      );
      break;
    }
    default: {
      console.error(`Unknown command: ${command ?? "(none)"}`);
      console.error("Usage: sandbox <prepare|up|down|destroy>");
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
