export interface SandboxEntry {
  port: number;
  pid: number | null;
  status: "prepared";
}

export type Registry = Record<string, SandboxEntry>;
