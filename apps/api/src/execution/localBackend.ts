import type { ApprovalPayload } from '@handle/shared';
import { promises as defaultFs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { awaitApproval, type ApprovalDecision } from '../approvals/approvalWaiter';
import type { BrowserSession } from './browserSession';
import {
  SafetyGovernor,
  type AuditLogAction,
  type SafetyCheckResult,
  type SafetyDecision,
} from './safetyGovernor';
import type {
  ExecutionBackend,
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
  fileSystem?: LocalBackendFilesystem;
  requestApproval?: LocalApprovalRequester;
  safetyGovernor?: SafetyGovernor;
  workspaceDir?: string;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

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
  private readonly fs: LocalBackendFilesystem;
  private readonly requestApproval: LocalApprovalRequester;
  private readonly safetyGovernor: SafetyGovernor;
  private readonly taskId: string;
  private readonly workspaceDir: string;

  constructor(taskId: string, options: LocalBackendOptions = {}) {
    this.taskId = taskId;
    this.workspaceDir = options.workspaceDir ?? defaultWorkspaceDir(taskId);
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

  async shellExec(_command: string, _opts: ExecutionCommandOptions): Promise<ExecutionCommandResult> {
    throw new Error('LocalBackend.shellExec is implemented in Phase 4 step 6');
  }

  async browserSession(): Promise<BrowserSession> {
    throw new Error('LocalBackend.browserSession is implemented in a later Phase 4 step');
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
