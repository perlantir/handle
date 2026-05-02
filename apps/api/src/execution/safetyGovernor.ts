import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { redactSecrets } from '../lib/redact';

export type SafetyDecision = 'allow' | 'approve' | 'deny';

export type AuditLogAction = 'file_write' | 'file_delete' | 'shell_exec' | 'browser_use_actual_chrome';

export interface AuditLogEntry {
  timestamp: string;
  taskId: string;
  projectId?: string;
  action: AuditLogAction;
  target: string;
  decision: SafetyDecision;
  approved?: boolean;
  approvalDurationMs?: number;
  matchedPattern?: string;
  scope?: WorkspaceScope;
  customScopePath?: string;
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
  customScopePath?: string | null;
  homeDir?: string;
  now?: () => Date;
  projectId?: string;
  taskId: string;
  workspaceDir: string;
  workspaceScope?: WorkspaceScope | LowercaseWorkspaceScope | null;
}

export type WorkspaceScope = 'DEFAULT_WORKSPACE' | 'CUSTOM_FOLDER' | 'DESKTOP' | 'FULL_ACCESS';
type LowercaseWorkspaceScope = 'default-workspace' | 'custom-folder' | 'desktop' | 'full-access';

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
const REDIRECTION_PATTERN = /(?:^|[\s;&|])(?:\d?>|&>|>>|>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
const PATH_TOKEN_PATTERN = /(?:"([^"]*(?:\/|~)[^"]*)"|'([^']*(?:\/|~)[^']*)'|((?:~|\/)[^\s;&|'"`]+))/g;
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
      matches: (path) =>
        path === '/private/etc' ||
        path.startsWith('/private/etc/') ||
        path === '/private/root' ||
        path.startsWith('/private/root/'),
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
      matches: (path) =>
        path === '/var' ||
        path.startsWith('/var/log/') ||
        path.startsWith('/var/db/') ||
        path.startsWith('/var/root/') ||
        path === '/private/var' ||
        path.startsWith('/private/var/log/') ||
        path.startsWith('/private/var/db/') ||
        path.startsWith('/private/var/root/'),
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
  readonly customScopePath: string | undefined;
  readonly homeDir: string;
  readonly projectId: string | undefined;
  readonly scopeRoot: string | null;
  readonly taskId: string;
  readonly workspaceScope: WorkspaceScope;
  readonly workspaceDir: string;
  private readonly now: () => Date;
  private readonly forbiddenPathRules: ForbiddenPathRule[];

  constructor(options: SafetyGovernorOptions) {
    this.auditLogPath = options.auditLogPath ?? defaultAuditLogPath();
    this.homeDir = resolve(options.homeDir ?? homedir());
    this.now = options.now ?? (() => new Date());
    this.projectId = options.projectId;
    this.taskId = options.taskId;
    this.workspaceDir = resolve(expandHome(options.workspaceDir, this.homeDir));
    this.workspaceScope = normalizeWorkspaceScope(options.workspaceScope);
    this.customScopePath = options.customScopePath
      ? resolve(expandHome(options.customScopePath, this.homeDir))
      : undefined;
    this.scopeRoot =
      this.workspaceScope === 'FULL_ACCESS'
        ? null
        : this.workspaceScope === 'DESKTOP'
          ? resolve(this.homeDir, 'Desktop')
        : this.workspaceScope === 'CUSTOM_FOLDER' && this.customScopePath
          ? this.customScopePath
          : this.workspaceDir;
    this.forbiddenPathRules = createForbiddenPathRules(this.homeDir);
  }

  async checkFileWrite(path: string): Promise<SafetyCheckResult> {
    return this.checkWritablePath(path, 'file_write');
  }

  async checkFileDelete(path: string): Promise<SafetyCheckResult> {
    return this.checkWritablePath(path, 'file_delete');
  }

  async checkFileRead(path: string): Promise<SafetyCheckResult> {
    return this.classifyPath(path);
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

    const redirectDecision = this.classifyShellRedirections(command);
    if (redirectDecision) return redirectDecision;

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
      const outsideScopePath = this.matchOutsideScopePathInCommand(normalized);
      if (outsideScopePath) {
        return this.shellDecision(
          'approve',
          command,
          'pipe-or-chain',
          `Shell command requires approval: pipe or command chaining detected (${outsideScopePath})`,
        );
      }
      if (this.commandHasPathToken(normalized)) {
        return this.shellDecision('allow', command, undefined, 'Shell command chain allowed inside workspace scope');
      }
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
      ...(this.projectId ? { projectId: this.projectId } : {}),
      ...(this.customScopePath ? { customScopePath: this.customScopePath } : {}),
      scope: this.workspaceScope,
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
    const scopeReal =
      this.workspaceScope === 'FULL_ACCESS' ? null : await this.resolveScopeRoot();

    if (
      scopeReal &&
      isInsideOrEqual(lowercasePath(resolvedTarget), lowercasePath(scopeReal))
    ) {
      return {
        decision: 'allow',
        reason: `Path is inside ${scopeLabel(this.workspaceScope)} scope: ${resolvedTarget}`,
        resolvedTarget,
      };
    }

    const originalEscapedScope =
      !scopeReal ||
      (!isInsideOrEqual(lowercasePath(originalTarget), lowercasePath(scopeReal)) &&
        !isInsideOrEqual(
          lowercasePath(originalTarget),
          lowercasePath(resolve(this.scopeRoot ?? this.workspaceDir)),
        ));
    const matchedPattern =
      (originalEscapedScope ? this.matchForbiddenPath(originalTarget) : undefined) ??
      this.matchForbiddenPath(resolvedTarget);
    if (matchedPattern) {
      return {
        decision: 'deny',
        matchedPattern,
        reason: `Path denied by forbidden pattern ${matchedPattern}: ${resolvedTarget}`,
        resolvedTarget,
      };
    }

    if (this.workspaceScope === 'FULL_ACCESS') {
      return {
        decision: 'allow',
        reason: `Path allowed by full-access scope: ${resolvedTarget}`,
        resolvedTarget,
      };
    }

    return {
      decision: 'approve',
      matchedPattern:
        this.workspaceScope === 'DEFAULT_WORKSPACE'
          ? 'outside-workspace'
          : 'outside-scope',
      reason: `Path requires approval outside project scope: ${resolvedTarget}`,
      resolvedTarget,
    };
  }

  private matchForbiddenPath(path: string) {
    const lower = lowercasePath(path);
    return this.forbiddenPathRules.find((rule) => rule.matches(lower))?.label;
  }

  private matchForbiddenPathInCommand(command: string) {
    PATH_TOKEN_PATTERN.lastIndex = 0;
    for (const match of command.matchAll(PATH_TOKEN_PATTERN)) {
      const token = match[1] ?? match[2] ?? match[3];
      if (!token) continue;
      const resolvedTarget = this.resolveLexicalPath(token);
      if (this.isPathInsideScopeLexically(resolvedTarget)) continue;
      const matchedPattern =
        this.matchForbiddenPath(token) ?? this.matchForbiddenPath(resolvedTarget);
      if (matchedPattern) return matchedPattern;
    }
    return undefined;
  }

  private classifyShellRedirections(command: string) {
    const targets = this.extractRedirectionTargets(command);
    for (const target of targets) {
      const resolvedTarget = this.resolveLexicalPath(target);
      const matchedPattern = this.matchForbiddenPath(resolvedTarget);
      if (matchedPattern) {
        return this.shellDecision(
          'deny',
          command,
          matchedPattern,
          `Shell command denied: redirection targets forbidden path rule ${matchedPattern}`,
        );
      }
      if (!this.isPathInsideScopeLexically(resolvedTarget)) {
        return this.shellDecision(
          'approve',
          command,
          'redirect-outside-scope',
          `Shell command requires approval: redirection writes outside project scope (${resolvedTarget})`,
        );
      }
    }
    return null;
  }

  private extractRedirectionTargets(command: string) {
    const targets: string[] = [];
    REDIRECTION_PATTERN.lastIndex = 0;
    for (const match of command.matchAll(REDIRECTION_PATTERN)) {
      const target = match[1] ?? match[2] ?? match[3];
      if (target && target !== '&1' && target !== '&2') targets.push(target);
    }
    return targets;
  }

  private matchOutsideScopePathInCommand(command: string) {
    PATH_TOKEN_PATTERN.lastIndex = 0;
    for (const match of command.matchAll(PATH_TOKEN_PATTERN)) {
      const token = match[1] ?? match[2] ?? match[3];
      if (!token) continue;
      const resolvedTarget = this.resolveLexicalPath(token);
      if (this.matchForbiddenPath(resolvedTarget)) continue;
      if (!this.isPathInsideScopeLexically(resolvedTarget)) return resolvedTarget;
    }
    return null;
  }

  private commandHasPathToken(command: string) {
    PATH_TOKEN_PATTERN.lastIndex = 0;
    return PATH_TOKEN_PATTERN.test(command);
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

  private async resolveScopeRoot() {
    if (!this.scopeRoot) return this.resolveWorkspace();
    await fs.mkdir(this.scopeRoot, { recursive: true });
    return realpathForPolicy(this.scopeRoot);
  }

  private isPathInsideScopeLexically(path: string) {
    if (this.workspaceScope === 'FULL_ACCESS') return true;
    const scopeRoot = this.scopeRoot ?? this.workspaceDir;
    return isInsideOrEqual(lowercasePath(resolve(path)), lowercasePath(resolve(scopeRoot)));
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

function normalizeWorkspaceScope(value: SafetyGovernorOptions['workspaceScope']): WorkspaceScope {
  if (value === 'CUSTOM_FOLDER' || value === 'custom-folder') return 'CUSTOM_FOLDER';
  if (value === 'DESKTOP' || value === 'desktop') return 'DESKTOP';
  if (value === 'FULL_ACCESS' || value === 'full-access') return 'FULL_ACCESS';
  return 'DEFAULT_WORKSPACE';
}

function scopeLabel(scope: WorkspaceScope) {
  if (scope === 'CUSTOM_FOLDER') return 'specific folder';
  if (scope === 'DESKTOP') return 'desktop';
  return 'workspace';
}
