export interface BuildEnvInput {
  /** Raw contents of .env.example, defining the required key schema. */
  exampleEnv: string;
  /** Raw contents of a source .env found in another worktree, or null if none exists anywhere. */
  sourceEnv: string | null;
  /** Freshly allocated port for this worktree. */
  port: number;
}

export interface BuildEnvResult {
  /** Final .env file contents to write, in .env.example's key order. */
  content: string;
  /** True when no source .env was found and .env.example's own values were used as a placeholder. */
  bootstrapped: boolean;
}

const PORT_KEY = "PORT";
const BACKEND_URL_KEY = "BACKEND_URL";

function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  return values;
}

/**
 * Builds this worktree's .env content from .env.example's key schema.
 *
 * Values come from `sourceEnv` (another worktree's existing .env) when
 * provided; otherwise they fall back to .env.example's own placeholder
 * values (the bootstrap path, for a fresh clone with no .env anywhere).
 * PORT and BACKEND_URL are always set from the freshly allocated `port`,
 * regardless of source.
 */
export function buildEnv(input: BuildEnvInput): BuildEnvResult {
  const { exampleEnv, sourceEnv, port } = input;

  const schema = parseEnv(exampleEnv);
  const sourceValues = sourceEnv !== null ? parseEnv(sourceEnv) : null;
  const bootstrapped = sourceValues === null;

  const lines: string[] = [];
  for (const [key, exampleValue] of schema) {
    let value: string;
    if (key === PORT_KEY) {
      value = String(port);
    } else if (key === BACKEND_URL_KEY) {
      value = `http://localhost:${port}`;
    } else if (sourceValues?.has(key)) {
      value = sourceValues.get(key)!;
    } else {
      value = exampleValue;
    }
    lines.push(`${key}=${value}`);
  }

  return { content: lines.join("\n") + "\n", bootstrapped };
}
