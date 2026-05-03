import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalBackend, type LocalBackendFilesystem } from './localBackend';
import { SafetyGovernor, type SafetyCheckResult } from './safetyGovernor';

let tempRoot = '';
let workspaceDir = '';
let auditLogPath = '';

function allow(path: string): SafetyCheckResult {
  return {
    decision: 'allow',
    reason: 'allowed',
    resolvedTarget: path,
  };
}

function approve(path: string): SafetyCheckResult {
  return {
    decision: 'approve',
    matchedPattern: 'outside-workspace',
    reason: 'approval required',
    resolvedTarget: path,
  };
}

function deny(path: string): SafetyCheckResult {
  return {
    decision: 'deny',
    matchedPattern: '/System',
    reason: 'denied',
    resolvedTarget: path,
  };
}

function fakeSafety(resultByMethod: Partial<Record<string, SafetyCheckResult>>) {
  return {
    checkFileDelete: vi.fn(async (path: string) => resultByMethod.checkFileDelete ?? allow(path)),
    checkFileList: vi.fn(async (path: string) => resultByMethod.checkFileList ?? allow(path)),
    checkFileRead: vi.fn(async (path: string) => resultByMethod.checkFileRead ?? allow(path)),
    checkFileWrite: vi.fn(async (path: string) => resultByMethod.checkFileWrite ?? allow(path)),
    writeAuditEntry: vi.fn(async () => {}),
  } as unknown as SafetyGovernor;
}

function fakeFs() {
  const directories: string[] = [];
  const removed: string[] = [];
  const writes: Array<{ content: string; path: string }> = [];
  const fileSystem: LocalBackendFilesystem = {
    async mkdir(path) {
      directories.push(path);
      return undefined;
    },
    async readFile(path) {
      return `content:${path}`;
    },
    async readdir() {
      return [
        {
          isDirectory: () => false,
          name: 'example.txt',
        },
      ];
    },
    async rm(path) {
      removed.push(path);
      return undefined;
    },
    async stat() {
      return { size: 12 };
    },
    async writeFile(path, content) {
      writes.push({ content, path });
      return undefined;
    },
  };

  return { directories, fileSystem, removed, writes };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(join(tmpdir(), 'handle-local-backend-'));
  workspaceDir = join(tempRoot, 'workspace');
  auditLogPath = join(tempRoot, 'audit.log');
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('LocalBackend file operations', () => {
  it('uses an injected filesystem for isolated file operations', async () => {
    const { directories, fileSystem, removed, writes } = fakeFs();
    const safety = fakeSafety({
      checkFileDelete: allow('/workspace/example.txt'),
      checkFileList: allow('/workspace'),
      checkFileRead: allow('/workspace/example.txt'),
      checkFileWrite: allow('/workspace/example.txt'),
    });
    const backend = new LocalBackend('task-local-test', {
      fileSystem,
      safetyGovernor: safety,
      workspaceDir: '/workspace',
    });

    await backend.initialize('task-local-test');
    await backend.fileWrite('/workspace/example.txt', 'hello');
    await expect(backend.fileRead('/workspace/example.txt')).resolves.toBe('content:/workspace/example.txt');
    await expect(backend.fileList('/workspace')).resolves.toEqual([
      { isDir: false, name: 'example.txt', size: 12 },
    ]);
    await backend.fileDelete('/workspace/example.txt');

    expect(directories).toContain('/workspace');
    expect(writes).toEqual([{ content: 'hello', path: '/workspace/example.txt' }]);
    expect(removed).toEqual(['/workspace/example.txt']);
    expect(safety.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'file_write', decision: 'allow' }),
    );
    expect(safety.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'file_delete', decision: 'allow' }),
    );
  });

  it('performs real filesystem operations inside a temp workspace', async () => {
    const backend = new LocalBackend('task-local-real-test', {
      auditLogPath,
      requestApproval: vi.fn(async () => 'approved' as const),
      workspaceDir,
    });

    await backend.initialize('task-local-real-test');
    await backend.fileWrite('hello.txt', 'hello world');
    await expect(backend.fileRead('hello.txt')).resolves.toBe('hello world');
    await expect(backend.fileList('.')).resolves.toEqual([
      { isDir: false, name: 'hello.txt', size: 11 },
    ]);
    await backend.fileDelete('hello.txt');
    await expect(fs.readFile(join(workspaceDir, 'hello.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const auditLines = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(auditLines).toEqual([
      expect.objectContaining({ action: 'file_write', decision: 'allow', taskId: 'task-local-real-test' }),
      expect.objectContaining({
        action: 'file_delete',
        approved: true,
        decision: 'approve',
        taskId: 'task-local-real-test',
      }),
    ]);
  });

  it('requests approval for outside-workspace writes and logs the approved decision', async () => {
    const { fileSystem, writes } = fakeFs();
    const target = join(tempRoot, 'approved-outside.txt');
    const safety = fakeSafety({ checkFileWrite: approve(target) });
    const requestApproval = vi.fn(async () => 'approved' as const);
    const backend = new LocalBackend('task-local-approval-test', {
      fileSystem,
      requestApproval,
      safetyGovernor: safety,
      workspaceDir,
    });

    await backend.fileWrite('/outside.txt', 'approved content');

    expect(requestApproval).toHaveBeenCalledWith(
      'task-local-approval-test',
      expect.objectContaining({
        path: target,
        type: 'file_write_outside_workspace',
      }),
      { timeoutMs: 300000 },
    );
    expect(writes).toEqual([{ content: 'approved content', path: target }]);
    expect(safety.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file_write',
        approved: true,
        decision: 'approve',
      }),
    );
  });

  it('denies unsafe writes before touching the filesystem and logs the denial', async () => {
    const { fileSystem, writes } = fakeFs();
    const target = '/System/Library/Foo';
    const safety = fakeSafety({ checkFileWrite: deny(target) });
    const backend = new LocalBackend('task-local-deny-test', {
      fileSystem,
      safetyGovernor: safety,
      workspaceDir,
    });

    await expect(backend.fileWrite(target, 'nope')).rejects.toThrow('denied');

    expect(writes).toEqual([]);
    expect(safety.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file_write',
        decision: 'deny',
        matchedPattern: '/System',
      }),
    );
  });

  it('treats timeout as a denied approval and logs approved=false', async () => {
    const { fileSystem, writes } = fakeFs();
    const target = join(tempRoot, 'timeout-outside.txt');
    const safety = fakeSafety({ checkFileDelete: approve(target) });
    const backend = new LocalBackend('task-local-timeout-test', {
      fileSystem,
      requestApproval: vi.fn(async () => 'timeout' as const),
      safetyGovernor: safety,
      workspaceDir,
    });

    await expect(backend.fileDelete('/outside.txt')).rejects.toThrow('Approval timed out');

    expect(writes).toEqual([]);
    expect(safety.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file_delete',
        approved: false,
        decision: 'approve',
      }),
    );
  });
});

describe('LocalBackend shell execution', () => {
  it('runs safe shell commands, streams output, and logs allow', async () => {
    const backend = new LocalBackend('task-local-shell-test', {
      auditLogPath,
      workspaceDir,
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    await backend.initialize();
    const command = 'node -e "process.stdout.write(\'hello\'),process.stderr.write(\'warn\')"';
    const result = await backend.shellExec(command, {
      onStderr: (line) => {
        stderr.push(line);
      },
      onStdout: (line) => {
        stdout.push(line);
      },
    });

    expect(result).toEqual({ exitCode: 0, stderr: 'warn', stdout: 'hello' });
    expect(stdout.join('')).toBe('hello');
    expect(stderr.join('')).toBe('warn');
    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      action: 'shell_exec',
      decision: 'allow',
      target: command,
    });
  });

  it('requests approval for command chains before execution', async () => {
    const requestApproval = vi.fn(async () => 'approved' as const);
    const backend = new LocalBackend('task-local-shell-approval-test', {
      auditLogPath,
      requestApproval,
      workspaceDir,
    });

    await backend.initialize();
    const result = await backend.shellExec('echo hello && echo bye', {
      onStderr: () => {},
      onStdout: () => {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('bye');
    expect(requestApproval).toHaveBeenCalledWith(
      'task-local-shell-approval-test',
      expect.objectContaining({
        command: 'echo hello && echo bye',
        type: 'shell_exec',
      }),
      { timeoutMs: 300000 },
    );
    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      action: 'shell_exec',
      approved: true,
      decision: 'approve',
      matchedPattern: 'pipe-or-chain',
    });
  });

  it('allows workspace-internal command chains without approval', async () => {
    const requestApproval = vi.fn(async () => 'approved' as const);
    const backend = new LocalBackend('task-local-shell-workspace-chain-test', {
      auditLogPath,
      requestApproval,
      workspaceDir,
    });
    const outputPath = join(workspaceDir, 'chain-output.txt');

    await backend.initialize();
    const result = await backend.shellExec(`cd ${workspaceDir} && echo hello > ${outputPath}`, {
      onStderr: () => {},
      onStdout: () => {},
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(outputPath, 'utf8')).toContain('hello');
    expect(requestApproval).not.toHaveBeenCalled();
    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      action: 'shell_exec',
      decision: 'allow',
    });
  });

  it('routes shell redirection outside scope through approval before spawning', async () => {
    const requestApproval = vi.fn(async () => 'denied' as const);
    const backend = new LocalBackend('task-local-shell-redirect-approval-test', {
      auditLogPath,
      requestApproval,
      workspaceDir,
    });

    await backend.initialize();
    await expect(
      backend.shellExec('echo hello > ~/Desktop/handle-redirect-test.txt', {
        onStderr: () => {},
        onStdout: () => {},
      }),
    ).rejects.toThrow('User denied approval');

    expect(requestApproval).toHaveBeenCalledWith(
      'task-local-shell-redirect-approval-test',
      expect.objectContaining({
        command: 'echo hello > ~/Desktop/handle-redirect-test.txt',
        type: 'shell_exec',
      }),
      { timeoutMs: 300000 },
    );
    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      action: 'shell_exec',
      approved: false,
      decision: 'approve',
      matchedPattern: 'redirect-outside-scope',
    });
  });

  it('denies forbidden shell commands before spawning', async () => {
    const backend = new LocalBackend('task-local-shell-deny-test', {
      auditLogPath,
      workspaceDir,
    });

    await backend.initialize();
    await expect(
      backend.shellExec('sudo echo nope', {
        onStderr: () => {},
        onStdout: () => {},
      }),
    ).rejects.toThrow('sudo is forbidden');

    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      action: 'shell_exec',
      decision: 'deny',
      matchedPattern: 'sudo',
    });
  });

  it('kills commands that exceed timeoutMs', async () => {
    const backend = new LocalBackend('task-local-shell-timeout-test', {
      auditLogPath,
      workspaceDir,
    });

    await backend.initialize();
    const result = await backend.shellExec('sleep 2', {
      onStderr: () => {},
      onStdout: () => {},
      timeoutMs: 50,
    });

    expect(result.exitCode).toBe(124);
  });

  it('rate-limits shell execution to 10 calls per second per task at request time', async () => {
    const backend = new LocalBackend('task-local-shell-rate-test', {
      auditLogPath,
      workspaceDir,
    });
    await backend.initialize();

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, index) =>
        backend.shellExec(`echo ${index}`, {
          onStderr: () => {},
          onStdout: () => {},
        }),
      ),
    );

    const rejected = results.filter((result) => result.status === 'rejected');
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const audit = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const rateLimitedAudit = audit.filter((entry) => entry.matchedPattern === 'rate_limit');

    expect(fulfilled).toHaveLength(10);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rateLimitedAudit).toHaveLength(40);
    expect(rateLimitedAudit[0]).toMatchObject({
      action: 'shell_exec',
      decision: 'deny',
      matchedPattern: 'rate_limit',
      taskId: 'task-local-shell-rate-test',
    });
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({
        message: 'Shell execution rate limit exceeded; max 10 commands per second per task.',
      }),
    });
  });
});
