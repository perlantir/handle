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
