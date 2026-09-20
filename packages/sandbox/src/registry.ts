export interface SandboxEntry {
  port: number;
  pid: number | null;
  status: string;
}

export type Registry = Record<string, SandboxEntry>;
