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
      expect.objectContaining({ action: 'file_delete', decision: 'allow', taskId: 'task-local-real-test' }),
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
