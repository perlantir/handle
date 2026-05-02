import type { ApprovalPayload } from '@handle/shared';
import { spawn } from 'node:child_process';
import { promises as defaultFs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { awaitApproval, type ApprovalDecision } from '../approvals/approvalWaiter';
import type { BrowserSession } from './browserSession';
import { createLocalBrowserSession, type LocalBrowserMode } from './localBrowser';
import {
  SafetyGovernor,
  type AuditLogAction,
  type SafetyCheckResult,
  type SafetyDecision,
} from './safetyGovernor';
import type {
  ExecutionBackend,
  ExecutionBrowserSessionOptions,
  ExecutionCommandOptions,
  ExecutionCommandResult,
  ExecutionFileEntry,
} from './types';

interface LocalDirent {
  isDirectory(): boolean;
  name: string;
}

interface LocalStats {
  size: number;
}

export interface LocalBackendFilesystem {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readdir(path: string, options: { withFileTypes: true }): Promise<LocalDirent[]>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<unknown>;
  stat(path: string): Promise<LocalStats>;
  writeFile(path: string, content: string, encoding: 'utf8'): Promise<unknown>;
}

export type LocalApprovalRequester = (
  taskId: string,
  request: ApprovalPayload,
  options?: { timeoutMs?: number },
) => Promise<ApprovalDecision>;

export interface LocalBackendOptions {
  approvalTimeoutMs?: number;
  auditLogPath?: string;
  browserMode?: LocalBrowserMode;
  fileSystem?: LocalBackendFilesystem;
  requestApproval?: LocalApprovalRequester;
  safetyGovernor?: SafetyGovernor;
  workspaceDir?: string;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const SHELL_RATE_LIMIT_PER_SECOND = 10;

function defaultWorkspaceDir(taskId: string) {
  return join(homedir(), 'Documents', 'Handle', 'workspaces', taskId);
}

function approvalPayloadForAction(action: AuditLogAction, result: SafetyCheckResult): ApprovalPayload {
  if (action === 'file_write') {
    return {
      path: result.resolvedTarget,
      reason: `Write to ${result.resolvedTarget}? This is outside the task workspace.`,
      type: 'file_write_outside_workspace',
    };
  }

  if (action === 'file_delete') {
    return {
      path: result.resolvedTarget,
      reason: `Delete ${result.resolvedTarget}?`,
      type: 'file_delete',
    };
  }

  throw new Error(`Unsupported file approval action: ${action}`);
}

export class LocalBackend implements ExecutionBackend {
  readonly id = 'local' as const;
  private readonly approvalTimeoutMs: number;
  private browser: BrowserSession | null = null;
  private readonly browserMode: LocalBrowserMode;
  private readonly fs: LocalBackendFilesystem;
  private readonly requestApproval: LocalApprovalRequester;
  private readonly safetyGovernor: SafetyGovernor;
  private readonly shellCallTimestamps: number[] = [];
  private readonly taskId: string;
  private readonly workspaceDir: string;

  constructor(taskId: string, options: LocalBackendOptions = {}) {
    this.taskId = taskId;
    this.workspaceDir = options.workspaceDir ?? defaultWorkspaceDir(taskId);
    this.browserMode = options.browserMode ?? 'separate-profile';
    this.fs = options.fileSystem ?? defaultFs;
    this.requestApproval = options.requestApproval ?? awaitApproval;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    this.safetyGovernor =
      options.safetyGovernor ??
      new SafetyGovernor({
        ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {}),
        taskId,
        workspaceDir: this.workspaceDir,
      });
  }

  async initialize(_taskId = this.taskId) {
    await this.fs.mkdir(this.workspaceDir, { recursive: true });
  }

  async shutdown(_taskId = this.taskId) {
    await this.browser?.destroy();
    this.browser = null;
    // Local workspaces persist for user inspection.
  }

  getWorkspaceDir() {
    return this.workspaceDir;
  }

  async fileWrite(path: string, content: string) {
    const result = await this.safetyGovernor.checkFileWrite(path);
    const resolvedPath = await this.enforceFileDecision('file_write', result);

    await this.fs.mkdir(dirname(resolvedPath), { recursive: true });
    await this.fs.writeFile(resolvedPath, content, 'utf8');
  }

  async fileRead(path: string) {
    const result = await this.safetyGovernor.checkFileRead(path);
    if (result.decision !== 'allow') {
      throw new Error(result.reason);
    }

    return this.fs.readFile(result.resolvedTarget, 'utf8');
  }

  async fileList(path: string): Promise<ExecutionFileEntry[]> {
    const result = await this.safetyGovernor.checkFileList(path);
    if (result.decision !== 'allow') {
      throw new Error(result.reason);
    }

    const entries = await this.fs.readdir(result.resolvedTarget, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(result.resolvedTarget, entry.name);
        const stat = await this.fs.stat(fullPath);
        return {
          isDir: entry.isDirectory(),
          name: entry.name,
          size: stat.size,
        };
      }),
    );
  }

  async fileDelete(path: string) {
    const result = await this.safetyGovernor.checkFileDelete(path);
    const resolvedPath = await this.enforceFileDecision('file_delete', result);

    await this.fs.rm(resolvedPath, { force: true, recursive: true });
  }

  async shellExec(command: string, opts: ExecutionCommandOptions): Promise<ExecutionCommandResult> {
    this.checkShellRateLimit();

    const result = this.safetyGovernor.checkShellExec(command);
    await this.enforceShellDecision(result);

    return new Promise<ExecutionCommandResult>((resolvePromise, reject) => {
      const child = spawn('bash', ['-c', command], {
        cwd: opts.cwd ?? this.workspaceDir,
        env: { ...process.env, HANDLE_TASK_ID: this.taskId },
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timeout: NodeJS.Timeout | null = null;

      if (opts.timeoutMs) {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        void opts.onStdout(text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        void opts.onStderr(text);
      });

      child.on('error', (err) => {
        if (timeout) clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code) => {
        if (timeout) clearTimeout(timeout);
        resolvePromise({
          exitCode: code ?? (timedOut ? 124 : 1),
          stderr,
          stdout,
        });
      });
    });
  }

  async browserSession(options: ExecutionBrowserSessionOptions = {}): Promise<BrowserSession> {
    if (!this.browser) {
      this.browser = await createLocalBrowserSession({
        ...(options.approval ? { approval: options.approval } : {}),
        approvalTimeoutMs: this.approvalTimeoutMs,
        mode: this.browserMode,
        requestApproval: this.requestApproval,
        safetyGovernor: this.safetyGovernor,
        taskId: this.taskId,
      });
    }

    return this.browser;
  }

  private async enforceFileDecision(action: 'file_write' | 'file_delete', result: SafetyCheckResult) {
    if (result.decision === 'deny') {
      await this.audit(action, result, 'deny');
      throw new Error(result.reason);
    }

    if (result.decision === 'approve') {
      const startedAt = Date.now();
      const decision = await this.requestApproval(this.taskId, approvalPayloadForAction(action, result), {
        timeoutMs: this.approvalTimeoutMs,
      });
      const approved = decision === 'approved';
      await this.audit(action, result, 'approve', {
        approvalDurationMs: Date.now() - startedAt,
        approved,
      });

      if (!approved) {
        throw new Error(decision === 'timeout' ? 'Approval timed out' : 'User denied approval');
      }
    } else {
      await this.audit(action, result, 'allow');
    }

    return result.resolvedTarget;
  }

  private async enforceShellDecision(result: SafetyCheckResult) {
    if (result.decision === 'deny') {
      await this.audit('shell_exec', result, 'deny');
      throw new Error(result.reason);
    }

    if (result.decision === 'approve') {
      const startedAt = Date.now();
      const decision = await this.requestApproval(
        this.taskId,
        {
          command: result.resolvedTarget,
          reason: `Run command: ${result.resolvedTarget}?`,
          type: 'shell_exec',
        },
        { timeoutMs: this.approvalTimeoutMs },
      );
      const approved = decision === 'approved';
      await this.audit('shell_exec', result, 'approve', {
        approvalDurationMs: Date.now() - startedAt,
        approved,
      });

      if (!approved) {
        throw new Error(decision === 'timeout' ? 'Approval timed out' : 'User denied approval');
      }
      return;
    }

    await this.audit('shell_exec', result, 'allow');
  }

  private checkShellRateLimit() {
    const now = Date.now();
    while (this.shellCallTimestamps.length > 0 && now - this.shellCallTimestamps[0]! >= 1000) {
      this.shellCallTimestamps.shift();
    }

    if (this.shellCallTimestamps.length >= SHELL_RATE_LIMIT_PER_SECOND) {
      throw new Error('Shell execution rate limit exceeded; max 10 commands per second per task.');
    }

    this.shellCallTimestamps.push(now);
  }

  private async audit(
    action: AuditLogAction,
    result: SafetyCheckResult,
    decision: SafetyDecision,
    extra: { approvalDurationMs?: number; approved?: boolean } = {},
  ) {
    await this.safetyGovernor.writeAuditEntry({
      action,
      decision,
      ...(extra.approved === undefined ? {} : { approved: extra.approved }),
      ...(extra.approvalDurationMs === undefined ? {} : { approvalDurationMs: extra.approvalDurationMs }),
      ...(result.matchedPattern ? { matchedPattern: result.matchedPattern } : {}),
      target: result.resolvedTarget,
    });
  }
}
