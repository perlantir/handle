import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SafetyGovernor } from './safetyGovernor';

let tempRoot = '';
let workspaceDir = '';
let auditLogPath = '';

async function createGovernor() {
  return new SafetyGovernor({
    auditLogPath,
    now: () => new Date('2026-05-02T12:00:00.000Z'),
    taskId: 'task-safety-test',
    workspaceDir,
  });
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(join(tmpdir(), 'handle-safety-'));
  workspaceDir = join(tempRoot, 'workspace');
  auditLogPath = join(tempRoot, 'audit.log');
  await fs.mkdir(workspaceDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('SafetyGovernor path predicates', () => {
  it.each([
    ['/System/Library/Foo', '/System'],
    ['/private/etc/passwd', '/private'],
    ['/usr/include/something', '/usr-not-local'],
    ['/etc/hosts', '/etc'],
    ['/var/log/system.log', '/var'],
    ['/Library/Preferences/com.apple.foo.plist', '/Library'],
    ['/Applications/Calculator.app/Contents', '/Applications'],
    ['~/Library/Keychains/login.keychain', '~/Library'],
    ['~/.ssh/id_rsa', '~/.ssh'],
    ['~/.aws/credentials', '~/.aws'],
    ['~/.config/anything-not-handle/foo.txt', '~/.config-not-handle'],
  ])('denies forbidden path %s', async (path, matchedPattern) => {
    const governor = await createGovernor();

    await expect(governor.checkFileWrite(path)).resolves.toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it('does not deny /usr/local via the /usr-not-local rule', async () => {
    const governor = await createGovernor();

    await expect(governor.checkFileWrite('/usr/local/foo')).resolves.toMatchObject({
      decision: 'approve',
      matchedPattern: expect.stringMatching(/^(outside-workspace|\/private)$/),
    });
  });

  it('allows file writes inside the workspace', async () => {
    const governor = await createGovernor();

    await expect(governor.checkFileWrite(join(workspaceDir, 'hello.txt'))).resolves.toMatchObject({
      decision: 'allow',
    });
  });

  it('allows workspace deletes in Phase 4 per local-backend smoke scope', async () => {
    const governor = await createGovernor();

    await expect(governor.checkFileDelete(join(workspaceDir, 'artifact.txt'))).resolves.toMatchObject({
      decision: 'allow',
    });
  });

  it.each([
    [() => '/System/Library/../etc', '/System'],
    [() => '/etc/../etc/hosts', '/etc'],
  ])('resolves path traversal and denies escaped path %#', async (pathFactory, matchedPattern) => {
    const governor = await createGovernor();

    await expect(governor.checkFileWrite(pathFactory())).resolves.toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it('resolves workspace symlinks and denies forbidden absolute targets', async () => {
    const linkPath = join(workspaceDir, 'etc-link');
    await fs.symlink('/etc', linkPath);
    const governor = await createGovernor();

    await expect(governor.checkFileRead(join(linkPath, 'hosts'))).resolves.toMatchObject({
      decision: 'deny',
      matchedPattern: expect.stringMatching(/^\/(?:etc|private)$/),
    });
  });

  it.each(['/System/Library/', '/System/Library', '/System/library'])(
    'denies System paths regardless of trailing slash or default macOS case %s',
    async (path) => {
      const governor = await createGovernor();

      await expect(governor.checkFileWrite(path)).resolves.toMatchObject({
        decision: 'deny',
        matchedPattern: '/System',
      });
    },
  );

  it('denies file reads outside the workspace when no read approval type exists', async () => {
    const governor = await createGovernor();

    await expect(governor.checkFileRead('/tmp/outside-workspace.txt')).resolves.toMatchObject({
      decision: 'deny',
      matchedPattern: expect.stringMatching(/^(outside-workspace|\/private)$/),
    });
  });
});

describe('SafetyGovernor shell predicates', () => {
  it.each([
    ['sudo', 'sudo'],
    ['sudo -i', 'sudo'],
    ['sudo -s', 'sudo'],
    ['sudo bash', 'sudo'],
    ['echo hi && sudo cat /etc/passwd', 'sudo'],
    ['doas echo hi', 'doas'],
    ['pkexec echo hi', 'pkexec'],
    ['$SUDO foo', 'sudo-variable'],
    ['${SUDO} foo', 'sudo-variable'],
  ])('denies sudo or privilege escalation command %s', async (command, matchedPattern) => {
    const governor = await createGovernor();

    expect(governor.checkShellExec(command)).toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it.each([
    ['shutdown now', 'shutdown'],
    ['reboot', 'reboot'],
    ['halt', 'halt'],
    ['poweroff', 'poweroff'],
  ])('denies forbidden command %s', async (command, matchedPattern) => {
    const governor = await createGovernor();

    expect(governor.checkShellExec(command)).toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it.each([
    ["cat '/System/Library'", '/System'],
    ['cat /System/library', '/System'],
    ['cat /System/Library/', '/System'],
    ['cat /usr/include/stdio.h', '/usr-not-local'],
    ['cat ~/.ssh/id_rsa', '~/.ssh'],
  ])('denies command referencing forbidden path %s', async (command, matchedPattern) => {
    const governor = await createGovernor();

    expect(governor.checkShellExec(command)).toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it.each([
    ['rm -rf /', 'rm-recursive-root'],
    ['rm -rf /*', 'rm-recursive-root'],
    ['rm -rf ~', 'rm-recursive-root'],
    ['mkfs.ext4 /tmp/disk.img', 'mkfs'],
    ['dd if=/dev/zero of=/dev/disk0', 'dd-disk-write'],
  ])('denies destructive command %s', async (command, matchedPattern) => {
    const governor = await createGovernor();

    expect(governor.checkShellExec(command)).toMatchObject({
      decision: 'deny',
      matchedPattern,
    });
  });

  it.each([
    ['echo hi && echo bye', 'pipe-or-chain'],
    ['echo hi | wc -c', 'pipe-or-chain'],
    ['echo hi; echo bye', 'pipe-or-chain'],
    ['chmod 600 /tmp/example', 'chmod'],
    ['chown nobody /tmp/example', 'chown'],
    ['mount', 'mount'],
    ['umount /tmp/example', 'umount'],
    ['kextload /tmp/example.kext', 'kextload'],
    ['launchctl list', 'launchctl'],
    ['rm -rf ~/Documents', 'rm'],
  ])('requires approval for high-risk command %s', async (command, matchedPattern) => {
    const governor = await createGovernor();

    expect(governor.checkShellExec(command)).toMatchObject({
      decision: 'approve',
      matchedPattern,
    });
  });

  it('allows simple safe commands', async () => {
    const governor = await createGovernor();

    expect(governor.checkShellExec('echo hello')).toMatchObject({
      decision: 'allow',
    });
  });
});

describe('SafetyGovernor audit log', () => {
  it('writes append-only JSON Lines audit entries with redaction', async () => {
    const governor = await createGovernor();

    await governor.writeAuditEntry({
      action: 'shell_exec',
      decision: 'allow',
      target: 'echo sk-proj-test_secret_value_1234567890',
    });
    await governor.writeAuditEntry({
      action: 'file_write',
      approved: true,
      approvalDurationMs: 42,
      decision: 'approve',
      matchedPattern: 'outside-workspace',
      target: '/tmp/example.txt',
    });

    const lines = (await fs.readFile(auditLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      action: 'shell_exec',
      decision: 'allow',
      taskId: 'task-safety-test',
      timestamp: '2026-05-02T12:00:00.000Z',
      workspaceDir,
    });
    expect(lines[0].target).not.toContain('sk-proj-test_secret_value_1234567890');
    expect(lines[1]).toMatchObject({
      action: 'file_write',
      approvalDurationMs: 42,
      approved: true,
      decision: 'approve',
      matchedPattern: 'outside-workspace',
    });
  });
});
