import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { redactSecrets } from '../lib/redact';

export type SafetyDecision = 'allow' | 'approve' | 'deny';

export type AuditLogAction = 'file_write' | 'file_delete' | 'shell_exec' | 'browser_use_actual_chrome';

export interface AuditLogEntry {
  timestamp: string;
  taskId: string;
  action: AuditLogAction;
  target: string;
  decision: SafetyDecision;
  approved?: boolean;
  approvalDurationMs?: number;
  matchedPattern?: string;
  workspaceDir: string;
}

export interface SafetyCheckResult {
  decision: SafetyDecision;
  matchedPattern?: string;
  reason: string;
  resolvedTarget: string;
}

export interface SafetyGovernorOptions {
  auditLogPath?: string;
  homeDir?: string;
  now?: () => Date;
  taskId: string;
  workspaceDir: string;
}

interface ForbiddenPathRule {
  label: string;
  matches(path: string): boolean;
}

const HIGH_RISK_COMMANDS = new Set([
  'rm',
  'chmod',
  'chown',
  'mkfs',
  'dd',
  'mount',
  'umount',
  'kextload',
  'launchctl',
]);

const FORBIDDEN_COMMANDS = new Set(['shutdown', 'reboot', 'halt', 'poweroff', 'doas', 'pkexec']);

const CHAIN_OR_PIPE_PATTERN = /(\|\|?|\&\&|;)/;
const SUDO_VARIABLE_PATTERN = /\$(?:\{SUDO\}|SUDO\b)/i;
const SUDO_COMMAND_PATTERN = /(?:^|[\s;&|()])sudo(?:\s|$)/i;
const DANGEROUS_RM_PATTERN = /(?:^|[\s;&|()])rm\s+(?=[^;&|]*(?:-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r|--recursive))[^;&|]*(?:^|\s)(\/|\/\*|~)(?:\s|$)/i;
const DISK_WRITE_PATTERN = /(?:^|[\s;&|()])dd\s+[^;&|]*\bof=\/dev\/(?:disk|rdisk|sd|nvme|xvd)[^\s;&|]*/i;
const MKFS_PATTERN = /(?:^|[\s;&|()])mkfs(?:\.|\s|$)/i;

function defaultAuditLogPath() {
  return join(homedir(), 'Library', 'Logs', 'Handle', 'audit.log');
}

function normalizeSeparators(path: string) {
  return path.replace(/\/+/g, '/');
}

function stripCommandQuotes(value: string) {
  return value.replace(/["'`]/g, '');
}

function commandName(command: string) {
  return stripCommandQuotes(command).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function expandHome(path: string, homeDir: string) {
  if (path === '~') return homeDir;
  if (path.startsWith(`~${sep}`) || path.startsWith('~/')) {
    return join(homeDir, path.slice(2));
  }
  return path;
}

function isInsideOrEqual(path: string, parent: string) {
  const rel = relative(parent, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function lowercasePath(path: string) {
  return normalizeSeparators(path).toLowerCase();
}

function createForbiddenPathRules(homeDir: string): ForbiddenPathRule[] {
  const home = lowercasePath(resolve(homeDir));

  return [
    {
      label: '/System',
      matches: (path) => path === '/system' || path.startsWith('/system/'),
    },
    {
      label: '/private',
      matches: (path) => path === '/private' || path.startsWith('/private/'),
    },
    {
      label: '/usr-not-local',
      matches: (path) => path === '/usr' || (path.startsWith('/usr/') && !path.startsWith('/usr/local/')),
    },
    {
      label: '/etc',
      matches: (path) => path === '/etc' || path.startsWith('/etc/'),
    },
    {
      label: '/var',
      matches: (path) => path === '/var' || path.startsWith('/var/'),
    },
    {
      label: '/Library',
      matches: (path) => path === '/library' || path.startsWith('/library/'),
    },
    {
      label: '/Applications',
      matches: (path) => path === '/applications' || path.startsWith('/applications/'),
    },
    {
      label: '~/Library',
      matches: (path) => path === `${home}/library` || path.startsWith(`${home}/library/`),
    },
    {
      label: '~/.ssh',
      matches: (path) => path === `${home}/.ssh` || path.startsWith(`${home}/.ssh/`),
    },
    {
      label: '~/.aws',
      matches: (path) => path === `${home}/.aws` || path.startsWith(`${home}/.aws/`),
    },
    {
      label: '~/.config-not-handle',
      matches: (path) => {
        const configPath = `${home}/.config`;
        return path === configPath || (path.startsWith(`${configPath}/`) && !path.startsWith(`${configPath}/handle/`));
      },
    },
  ];
}

async function nearestExistingPath(path: string) {
  let current = path;
  const missingSegments: string[] = [];

  while (current !== dirname(current)) {
    try {
      const stat = await fs.lstat(current);
      return { current, missingSegments, stat };
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== 'ENOENT') throw err;
      missingSegments.unshift(current.split(/[\\/]/).pop() ?? '');
      current = dirname(current);
    }
  }

  const stat = await fs.lstat(current);
  return { current, missingSegments, stat };
}

async function realpathForPolicy(path: string) {
  const nearest = await nearestExistingPath(path);
  const realBase = await fs.realpath(nearest.current);
  return resolve(realBase, ...nearest.missingSegments);
}

export class SafetyGovernor {
  readonly auditLogPath: string;
  readonly homeDir: string;
  readonly taskId: string;
  readonly workspaceDir: string;
  private readonly now: () => Date;
  private readonly forbiddenPathRules: ForbiddenPathRule[];

  constructor(options: SafetyGovernorOptions) {
    this.auditLogPath = options.auditLogPath ?? defaultAuditLogPath();
    this.homeDir = resolve(options.homeDir ?? homedir());
    this.now = options.now ?? (() => new Date());
    this.taskId = options.taskId;
    this.workspaceDir = resolve(expandHome(options.workspaceDir, this.homeDir));
    this.forbiddenPathRules = createForbiddenPathRules(this.homeDir);
  }

  async checkFileWrite(path: string): Promise<SafetyCheckResult> {
    return this.checkWritablePath(path, 'file_write');
  }

  async checkFileDelete(path: string): Promise<SafetyCheckResult> {
    return this.checkWritablePath(path, 'file_delete');
  }

  async checkFileRead(path: string): Promise<SafetyCheckResult> {
    const result = await this.classifyPath(path);
    if (result.decision === 'allow') return result;
    if (result.decision === 'deny') return result;
    return {
      ...result,
      decision: 'deny',
      matchedPattern: result.matchedPattern ?? 'outside-workspace-read',
      reason: `Read denied outside workspace: ${result.resolvedTarget}`,
    };
  }

  async checkFileList(path: string): Promise<SafetyCheckResult> {
    return this.checkFileRead(path);
  }

  checkShellExec(command: string): SafetyCheckResult {
    const stripped = stripCommandQuotes(command);
    const normalized = stripped.trim();
    const cmd = commandName(normalized);

    if (SUDO_VARIABLE_PATTERN.test(normalized)) {
      return this.shellDecision('deny', command, 'sudo-variable', 'Shell command denied: sudo variable expansion is forbidden');
    }
    if (SUDO_COMMAND_PATTERN.test(normalized)) {
      return this.shellDecision('deny', command, 'sudo', 'Shell command denied: sudo is forbidden');
    }
    if (FORBIDDEN_COMMANDS.has(cmd)) {
      return this.shellDecision('deny', command, cmd, `Shell command denied: ${cmd} is forbidden`);
    }
    if (DANGEROUS_RM_PATTERN.test(normalized)) {
      return this.shellDecision('deny', command, 'rm-recursive-root', 'Shell command denied: recursive root/home deletion is forbidden');
    }
    if (DISK_WRITE_PATTERN.test(normalized)) {
      return this.shellDecision('deny', command, 'dd-disk-write', 'Shell command denied: raw disk writes are forbidden');
    }
    if (MKFS_PATTERN.test(normalized)) {
      return this.shellDecision('deny', command, 'mkfs', 'Shell command denied: filesystem formatting is forbidden');
    }

    const forbiddenPath = this.matchForbiddenPathInCommand(normalized);
    if (forbiddenPath) {
      return this.shellDecision(
        'deny',
        command,
        forbiddenPath,
        `Shell command denied: command references forbidden path rule ${forbiddenPath}`,
      );
    }

    if (CHAIN_OR_PIPE_PATTERN.test(normalized)) {
      return this.shellDecision('approve', command, 'pipe-or-chain', 'Shell command requires approval: pipe or command chaining detected');
    }
    if (HIGH_RISK_COMMANDS.has(cmd)) {
      return this.shellDecision('approve', command, cmd, `Shell command requires approval: ${cmd} is high risk`);
    }

    return this.shellDecision('allow', command, undefined, 'Shell command allowed');
  }

  async writeAuditEntry(entry: Omit<AuditLogEntry, 'timestamp' | 'taskId' | 'workspaceDir'>) {
    const completeEntry: AuditLogEntry = {
      timestamp: this.now().toISOString(),
      taskId: this.taskId,
      workspaceDir: this.workspaceDir,
      ...entry,
      target: redactSecrets(entry.target),
    };

    await fs.mkdir(dirname(this.auditLogPath), { recursive: true });
    await fs.appendFile(this.auditLogPath, `${JSON.stringify(completeEntry)}\n`, 'utf8');
  }

  private async checkWritablePath(path: string, action: AuditLogAction): Promise<SafetyCheckResult> {
    const result = await this.classifyPath(path);
    if (result.decision !== 'allow') return result;

    return {
      ...result,
      reason: `${action} allowed inside workspace: ${result.resolvedTarget}`,
    };
  }

  private async classifyPath(path: string): Promise<SafetyCheckResult> {
    const originalTarget = this.resolveLexicalPath(path);
    const resolvedTarget = await realpathForPolicy(originalTarget);
    const workspaceReal = await this.resolveWorkspace();

    if (isInsideOrEqual(lowercasePath(resolvedTarget), lowercasePath(workspaceReal))) {
      return {
        decision: 'allow',
        reason: `Path is inside workspace: ${resolvedTarget}`,
        resolvedTarget,
      };
    }

    const originalWorkspace = this.resolveLexicalPath(this.workspaceDir);
    const originalEscapedWorkspace = !isInsideOrEqual(
      lowercasePath(originalTarget),
      lowercasePath(originalWorkspace),
    );
    const matchedPattern =
      (originalEscapedWorkspace ? this.matchForbiddenPath(originalTarget) : undefined) ??
      this.matchForbiddenPath(resolvedTarget);
    if (matchedPattern) {
      return {
        decision: 'deny',
        matchedPattern,
        reason: `Path denied by forbidden pattern ${matchedPattern}: ${resolvedTarget}`,
        resolvedTarget,
      };
    }

    return {
      decision: 'approve',
      matchedPattern: 'outside-workspace',
      reason: `Path requires approval outside workspace: ${resolvedTarget}`,
      resolvedTarget,
    };
  }

  private matchForbiddenPath(path: string) {
    const lower = lowercasePath(path);
    return this.forbiddenPathRules.find((rule) => rule.matches(lower))?.label;
  }

  private matchForbiddenPathInCommand(command: string) {
    const lower = lowercasePath(command);
    return this.forbiddenPathRules.find((rule) => {
      const token = rule.label.startsWith('~') ? rule.label : rule.label.toLowerCase();
      if (rule.label === '/usr-not-local') {
        return /(?:^|[\s"'=])\/usr\/(?!local(?:\/|\s|$))/.test(lower);
      }
      const pathToken = token.startsWith('~') ? token.replace('~', lowercasePath(this.homeDir)) : token;
      return lower.includes(pathToken.toLowerCase()) || lower.includes(token.toLowerCase());
    })?.label;
  }

  private resolveLexicalPath(path: string) {
    const expanded = expandHome(path, this.homeDir);
    const absolute = isAbsolute(expanded) ? expanded : join(this.workspaceDir, expanded);
    return resolve(absolute);
  }

  private async resolveWorkspace() {
    await fs.mkdir(this.workspaceDir, { recursive: true });
    return realpathForPolicy(this.workspaceDir);
  }

  private shellDecision(
    decision: SafetyDecision,
    command: string,
    matchedPattern: string | undefined,
    reason: string,
  ): SafetyCheckResult {
    return {
      decision,
      ...(matchedPattern ? { matchedPattern } : {}),
      reason,
      resolvedTarget: command,
    };
  }
}
