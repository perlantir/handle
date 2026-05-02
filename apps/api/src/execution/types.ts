import type { BrowserActionApproval, BrowserSession } from './browserSession';

export type BackendId = 'e2b' | 'local';

export interface ExecutionCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface ExecutionCommandOptions {
  cwd?: string;
  onStderr: (line: string) => void | Promise<void>;
  onStdout: (line: string) => void | Promise<void>;
  timeoutMs?: number;
}

export interface ExecutionFileEntry {
  isDir: boolean;
  name: string;
  size: number;
}

export interface ExecutionBrowserSessionOptions {
  approval?: BrowserActionApproval;
}

export interface ExecutionBackend {
  id: BackendId;
  initialize(taskId: string): Promise<void>;
  shutdown(taskId: string): Promise<void>;

  fileDelete(path: string): Promise<void>;
  fileList(path: string): Promise<ExecutionFileEntry[]>;
  fileRead(path: string): Promise<string>;
  fileWrite(path: string, content: string): Promise<void>;

  getWorkspaceDir(): string;
  browserSession(options?: ExecutionBrowserSessionOptions): Promise<BrowserSession>;
  shellExec(command: string, opts: ExecutionCommandOptions): Promise<ExecutionCommandResult>;
}

export interface E2BCommandResult {
  exitCode: number;
  error?: string;
  stdout: string;
  stderr: string;
}

export interface E2BCommandRunOptions {
  onStderr?: (data: string) => void | Promise<void>;
  onStdout?: (data: string) => void | Promise<void>;
}

export interface E2BFilesystemLike {
  list(path: string): Promise<unknown[]>;
  read(path: string, opts: { format: 'text' }): Promise<string>;
  remove?(path: string): Promise<unknown>;
  write(path: string, data: string): Promise<unknown>;
}

export interface E2BSandboxLike {
  sandboxId: string;
  commands: {
    run(command: string, opts?: E2BCommandRunOptions): Promise<E2BCommandResult>;
  };
  files: E2BFilesystemLike;
  kill(): Promise<void>;
}
