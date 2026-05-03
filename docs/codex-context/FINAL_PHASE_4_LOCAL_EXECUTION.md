# Handle — Phase 4: Local Execution Backend (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-3 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add a local execution backend so users can run Handle tasks on
their own Mac instead of (or in addition to) E2B cloud sandbox.

This unlocks: free execution, access to user's local files
(Documents, Desktop, etc.), and integration with their actual
Chrome browser.

It also introduces real risk: the agent can damage the user's
system. The safety governor handles this.

Phase 4 ships in 2 weeks.

==================================================
SCOPE
==================================================

In scope:
- ExecutionBackend abstraction
- LocalBackend implementation
- Workspace directory management
  (~/Documents/Handle/workspaces/<task-id>/)
- SafetyGovernor with predicate-based denial
- Approval flow for ambiguous actions
- Local browser modes:
  - Default: separate Chrome profile
    (~/.config/handle/chrome-profile/)
  - Opt-in: actual Chrome via remote debugging port 9222
- Backend toggle in Settings and per-task in Workspace
- Settings → Execution and Settings → Browser tabs

Out of scope:
- Memory (Phase 5)
- Integrations (Phase 6)

==================================================
EXECUTION BACKEND ABSTRACTION
==================================================

apps/api/src/execution/types.ts:

```typescript
export type BackendId = 'e2b' | 'local';

export interface ExecutionBackend {
  id: BackendId;
  initialize(taskId: string): Promise<void>;
  shutdown(taskId: string): Promise<void>;
  
  // Filesystem
  fileWrite(path: string, content: string): Promise<void>;
  fileRead(path: string): Promise<string>;
  fileList(path: string): Promise<Array<{ name: string; isDir: boolean; size: number }>>;
  fileDelete(path: string): Promise<void>;
  
  // Shell
  shellExec(command: string, opts: {
    onStdout: (line: string) => void;
    onStderr: (line: string) => void;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  
  // Browser (Phase 3 was E2B-only; now both)
  browserSession(): Promise<BrowserSession>;
  
  // Workspace
  getWorkspaceDir(): string;
}
```

==================================================
E2B BACKEND (REFACTOR)
==================================================

Move existing E2B code from apps/api/src/agent/tools.ts and
apps/api/src/execution/e2bBackend.ts into a class that
implements ExecutionBackend. The tools become wrappers that
delegate to the active backend.

```typescript
// apps/api/src/agent/tools.ts (refactored)
export function createTools(ctx: ToolContext) {
  const backend = ctx.backend;  // ExecutionBackend instance

  const shellExec = tool(
    async (input: { command: string }) => {
      // ... approval check via SafetyGovernor (see below)
      const result = await backend.shellExec(input.command, {
        onStdout: (line) => emitTaskEvent({ ... }),
        onStderr: (line) => emitTaskEvent({ ... }),
      });
      // ... emit result event
      return JSON.stringify(result);
    },
    { name: 'shell_exec', /* ... */ },
  );
  
  // Same pattern for file_write, file_read, file_list, file_delete (new),
  // browser_navigate, browser_click, browser_type, browser_extract_text, ...
  
  return [shellExec, /* ... */];
}
```

==================================================
LOCAL BACKEND
==================================================

apps/api/src/execution/localBackend.ts:

```typescript
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { SafetyGovernor } from './safetyGovernor';
import type { ExecutionBackend, BrowserSession } from './types';

export class LocalBackend implements ExecutionBackend {
  id = 'local' as const;
  private workspaceDir: string;
  private safetyGovernor: SafetyGovernor;

  constructor(private taskId: string) {
    this.workspaceDir = join(homedir(), 'Documents', 'Handle', 'workspaces', taskId);
    this.safetyGovernor = new SafetyGovernor(this.workspaceDir);
  }

  async initialize() {
    await fs.mkdir(this.workspaceDir, { recursive: true });
  }

  async shutdown() {
    // Workspace persists for user inspection. Cleanup is manual or
    // via cron later.
  }

  getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  async fileWrite(path: string, content: string): Promise<void> {
    const decision = await this.safetyGovernor.checkFileWrite(path);
    if (decision === 'deny') {
      throw new Error(`File write denied: ${path} is outside the workspace`);
    }
    if (decision === 'approve') {
      const approved = await this.safetyGovernor.requestApproval(this.taskId, {
        type: 'file_write_outside_workspace',
        path,
        reason: `Writing to ${path} outside the task workspace`,
      });
      if (!approved) throw new Error('User denied file write');
    }
    
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content, 'utf-8');
  }

  async fileRead(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async fileList(path: string) {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return Promise.all(
      entries.map(async (e) => {
        const full = join(path, e.name);
        const stat = await fs.stat(full);
        return { name: e.name, isDir: e.isDirectory(), size: stat.size };
      }),
    );
  }

  async fileDelete(path: string) {
    const decision = await this.safetyGovernor.checkFileDelete(path);
    if (decision === 'deny') throw new Error(`File delete denied: ${path}`);
    if (decision === 'approve') {
      const approved = await this.safetyGovernor.requestApproval(this.taskId, {
        type: 'file_delete',
        path,
        reason: `Deleting ${path}`,
      });
      if (!approved) throw new Error('User denied delete');
    }
    
    await fs.rm(path, { recursive: true, force: true });
  }

  async shellExec(command: string, opts: any) {
    const decision = await this.safetyGovernor.checkShellExec(command);
    if (decision === 'deny') throw new Error(`Shell command denied: ${command}`);
    if (decision === 'approve') {
      const approved = await this.safetyGovernor.requestApproval(this.taskId, {
        type: 'shell_exec',
        command,
        reason: `Running: ${command}`,
      });
      if (!approved) throw new Error('User denied shell exec');
    }

    return new Promise<{ exitCode: number; stdout: string; stderr: string }>((res, rej) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: opts.cwd ?? this.workspaceDir,
        env: { ...process.env, HANDLE_TASK_ID: this.taskId },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (d) => {
        const s = d.toString();
        stdout += s;
        s.split('\n').forEach((line: string) => line && opts.onStdout(line));
      });

      proc.stderr?.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        s.split('\n').forEach((line: string) => line && opts.onStderr(line));
      });

      proc.on('exit', (code) => {
        res({ exitCode: code ?? 0, stdout, stderr });
      });

      proc.on('error', rej);

      if (opts.timeoutMs) {
        setTimeout(() => proc.kill('SIGKILL'), opts.timeoutMs);
      }
    });
  }

  async browserSession(): Promise<BrowserSession> {
    return createLocalBrowserSession(this.taskId, this.safetyGovernor);
  }
}
```

==================================================
SAFETY GOVERNOR
==================================================

apps/api/src/execution/safetyGovernor.ts:

```typescript
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const FORBIDDEN_PATTERNS = [
  /^\/System\b/,
  /^\/private\b/,
  /^\/usr\/(?!local\b)/,    // /usr but not /usr/local
  /^\/etc\b/,
  /^\/var\b/,
  /^\/Library\b/,
  /^\/Applications\b/,
  // User's sensitive directories
  new RegExp(`^${homedir()}/Library/`),
  new RegExp(`^${homedir()}/.ssh/`),
  new RegExp(`^${homedir()}/.aws/`),
  new RegExp(`^${homedir()}/.config/(?!handle/)`),
];

const HIGH_RISK_COMMANDS = new Set([
  'rm', 'sudo', 'chmod', 'chown', 'mkfs', 'dd',
  'mount', 'umount', 'kextload', 'launchctl',
]);

const FORBIDDEN_COMMANDS = new Set([
  'shutdown', 'reboot', 'halt', 'poweroff',
  'doas', 'pkexec',
]);

export type Decision = 'allow' | 'approve' | 'deny';

export class SafetyGovernor {
  constructor(private workspaceDir: string) {}

  checkFileWrite(path: string): Decision {
    const abs = resolve(path);
    
    // Inside workspace: allow
    if (abs.startsWith(resolve(this.workspaceDir))) return 'allow';
    
    // Forbidden patterns: deny
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(abs)) return 'deny';
    }
    
    // Otherwise: require approval
    return 'approve';
  }

  checkFileDelete(path: string): Decision {
    const abs = resolve(path);
    
    // Workspace: approve required (still risky)
    if (abs.startsWith(resolve(this.workspaceDir))) return 'approve';
    
    // Forbidden patterns: deny
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(abs)) return 'deny';
    }
    
    return 'approve';
  }

  checkShellExec(command: string): Decision {
    const tokens = command.trim().split(/\s+/);
    const cmd = tokens[0];

    if (FORBIDDEN_COMMANDS.has(cmd)) return 'deny';
    if (cmd === 'sudo') return 'deny';      // Always deny sudo
    
    // Heuristic: rm with dangerous patterns
    if (cmd === 'rm') {
      if (tokens.includes('-rf') || tokens.includes('--recursive')) {
        if (tokens.some(t => t === '/' || t === '/*' || t === '~')) return 'deny';
      }
      return 'approve';
    }
    
    if (HIGH_RISK_COMMANDS.has(cmd)) return 'approve';
    
    // Pipes and chains: approve any command containing | or && or ;
    if (/[|;&]/.test(command)) return 'approve';
    
    return 'allow';
  }

  async requestApproval(taskId: string, request: ApprovalPayload): Promise<boolean> {
    // Use existing approval flow infrastructure from Phase 1
    const approvalId = await createApprovalRequest(taskId, request);
    emitTaskEvent({
      type: 'approval_request',
      approvalId,
      request,
      taskId,
    });
    return await awaitApprovalDecision(approvalId, { timeoutMs: 5 * 60_000 });
  }
}
```

==================================================
WORKSPACE BOUNDARY FOR FILE DELETES
==================================================

Workspace deletes still require approval in Phase 4.

Rationale: the workspace might contain user-generated artifacts.
Phase 11 polish may relax this to allow within-workspace deletes
after a configurable confirmation prompt.

==================================================
SHELL EXECUTION RATE LIMITING
==================================================

LocalBackend.shellExec must rate-limit the agent to 10 calls per
second per task.

Approval-required commands count against the rate limit at request
time, not approval time. If the rate limit is hit, throw a clear
error to the agent:

```
Shell execution rate limit exceeded; max 10 commands per second per task.
```

Rationale: agent runaway loops would otherwise thrash the user's
filesystem in seconds.

==================================================
LOCAL BROWSER SESSION
==================================================

apps/api/src/execution/localBrowser.ts:

```typescript
import { chromium, Browser, Page } from 'playwright';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { BrowserSession } from '../agent/browserTools';
import { SafetyGovernor } from './safetyGovernor';

type BrowserMode = 'separate-profile' | 'actual-chrome';

export async function createLocalBrowserSession(
  taskId: string,
  governor: SafetyGovernor,
  mode: BrowserMode = 'separate-profile',
): Promise<BrowserSession> {
  let browser: Browser;
  let page: Page;

  if (mode === 'separate-profile') {
    const profileDir = join(homedir(), '.config', 'handle', 'chrome-profile');
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    }) as unknown as Browser;
    page = (await (browser as any).pages())[0] ?? (await (browser as any).newPage());
  } else {
    // Actual Chrome via CDP — requires user to start Chrome with
    // --remote-debugging-port=9222
    const approved = await governor.requestApproval(taskId, {
      type: 'browser_use_actual_chrome',
      reason: 'Connecting to your actual Chrome — agent will see your logged-in sessions',
    });
    if (!approved) throw new Error('User denied actual Chrome connection');
    
    browser = await chromium.connectOverCDP('http://localhost:9222');
    page = browser.contexts()[0].pages()[0] ?? await browser.contexts()[0].newPage();
  }

  return {
    async navigate(url: string) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const title = await page.title();
      const screenshot = await page.screenshot();
      return { title, screenshot };
    },
    async click(selector: string) {
      await page.click(selector);
    },
    async type(selector: string, text: string) {
      await page.fill(selector, text);
    },
    async extractText(selector?: string) {
      if (selector) return (await page.locator(selector).textContent()) ?? '';
      return (await page.evaluate(() => document.body.innerText));
    },
    async screenshot() {
      return page.screenshot();
    },
    async goBack() {
      await page.goBack();
    },
    async scroll(direction: 'up' | 'down', amount: number) {
      const dy = direction === 'down' ? amount : -amount;
      await page.evaluate((dy) => window.scrollBy(0, dy), dy);
    },
    async waitForSelector(selector: string, timeoutMs?: number) {
      await page.waitForSelector(selector, { timeout: timeoutMs ?? 30_000 });
    },
  };
}
```

==================================================
BROWSER ACTUAL-CHROME MODE: HEIGHTENED APPROVAL
==================================================

When the user enables actual-Chrome mode and the agent attempts to
connect, the approval modal must list specifically what's at risk:

- "Agent will see: any tab you have open"
- "Agent will see: your logged-in sessions to all sites"
- "Agent will see: saved passwords visible to extensions"
- "Agent will see: browsing history"

Default the modal to declined: button focus goes to "Deny", not
"Approve".

Require an explicit "I understand" checkbox before the "Approve"
button is enabled.

After approval expires via the 5 minute timeout, require fresh
approval. Never carry actual-Chrome approval over to a later task or
later connection attempt.

Each approval is logged to audit.log with:

```typescript
action: 'browser_use_actual_chrome'
```

==================================================
BACKEND SELECTION
==================================================

When creating a task, choose backend:

```typescript
// apps/api/src/agent/runAgent.ts
const backendId = task.backend;  // 'e2b' | 'local'
const backend: ExecutionBackend = backendId === 'local'
  ? new LocalBackend(task.id)
  : new E2BBackend(task.id);

await backend.initialize(task.id);
try {
  // run agent with backend
} finally {
  await backend.shutdown(task.id);
}
```

==================================================
SETTINGS → EXECUTION TAB
==================================================

apps/web/components/settings/ExecutionSettings.tsx:

- Default backend (radio): E2B Cloud / Local Mac
- For Local:
  - Workspace base directory (display only — non-configurable in
    Phase 4, just shows ~/Documents/Handle/workspaces/)
  - Cleanup policy: keep all / delete after 7 days / delete after
    30 days / never (Phase 4 ships "keep all"; cleanup is Phase
    11 polish)
  - Show Open Workspace Folder button → open in Finder

Match Screen 11 (Settings) layout.

==================================================
SETTINGS → BROWSER TAB
==================================================

apps/web/components/settings/BrowserSettings.tsx:

- Browser mode (radio):
  - Separate profile (default, safe)
  - Use my actual Chrome (advanced, requires confirmation each
    time)
- For separate profile:
  - Show profile location
  - Reset profile button (clears cookies, history)
- For actual Chrome:
  - Setup instructions: "Start Chrome with `--remote-debugging-port=9222`"
  - Test connection button

==================================================
WORKSPACE BACKEND TOGGLE
==================================================

In Workspace status bar (Screen 03), add a backend indicator:
"E2B" or "Local" pill. Click to toggle (creates a new task if
needed).

In Composer mode pills, add a backend selector.

==================================================
APPROVAL MODAL
==================================================

Reuse Phase 1's ApprovalModal. Add new approval types:

```typescript
type ApprovalType = 
  | 'shell_exec'                          // Existing
  | 'file_write_outside_workspace'        // New
  | 'file_delete'                         // New
  | 'browser_use_actual_chrome'           // New
  | 'risky_browser_action';               // From Phase 3
```

Each type has its own modal copy:

- shell_exec: "Run command: `<command>`?"
- file_write_outside_workspace: "Write to <path>? This is outside
  the task workspace."
- file_delete: "Delete <path>?"
- browser_use_actual_chrome: "Connect to your actual Chrome?
  Agent will see your logged-in sessions."
- risky_browser_action: "Click <selector>? This appears to
  submit a form."

==================================================
AUDIT LOG
==================================================

SafetyGovernor produces audit log entries at:

```
~/Library/Logs/Handle/audit.log
```

It writes an entry for every checked action, not just denials. The
file is JSON Lines: one JSON object per line.

```typescript
interface AuditLogEntry {
  timestamp: string;          // ISO 8601
  taskId: string;
  action: 'file_write' | 'file_delete' | 'shell_exec' | 'browser_use_actual_chrome';
  target: string;             // path or command or URL
  decision: 'allow' | 'approve' | 'deny';
  approved?: boolean;          // present when decision was 'approve'
  approvalDurationMs?: number; // time user took to decide
  matchedPattern?: string;     // which regex/rule fired (for 'deny' or 'approve')
  workspaceDir: string;        // for context
}
```

Audit log is append-only. No audit log rotation in Phase 4; defer
rotation to Phase 11 polish. Logs survive task completion. The user
can review the log during a task:

```bash
tail -f ~/Library/Logs/Handle/audit.log
```

or after a task:

```bash
cat ~/Library/Logs/Handle/audit.log
```

==================================================
TESTS
==================================================

Required test coverage:

1. ExecutionBackend interface implementations
2. LocalBackend.fileWrite respects workspace boundary
3. LocalBackend.shellExec calls SafetyGovernor
4. LocalBackend.fileRead and fileList preserve existing Phase 1
   behavior
5. LocalBackend.fileDelete requires approval inside workspace
6. LocalBrowserSession launches with separate profile
7. LocalBrowserSession actual-Chrome requires heightened approval
8. Backend toggle creates task with correct backend
9. Workspace UI shows correct backend pill
10. Audit log entries are written for allow, approve, and deny
    decisions

SafetyGovernor must have at least 30 explicit unit tests covering the
edge cases below.

Forbidden pattern tests. Each must deny:

1. `/System/Library/Foo`
2. `/private/etc/passwd`
3. `/usr/include/something`
4. `/etc/hosts`
5. `/var/log/system.log`
6. `/Library/Preferences/com.apple.foo.plist`
7. `/Applications/Calculator.app/Contents`
8. `~/Library/Keychains/login.keychain`
9. `~/.ssh/id_rsa`
10. `~/.aws/credentials`
11. `~/.config/anything-not-handle/foo.txt`

Allow-list contrast:

12. `/usr/local/foo` is allowed or approval-gated according to the
    surrounding action, but must not match the forbidden `/usr`
    pattern.

Path traversal tests:

13. `<workspace>/../../System/etc` resolves and denies
14. `<workspace>/./../etc/hosts` resolves and denies
15. A workspace symlink pointing to `/System` resolves and denies

Quoting and case tests:

16. `'/System/Library'` quoted in a command denies
17. `/System/library` lowercased denies on default case-insensitive
    macOS volumes
18. `/System/Library/` trailing slash denies
19. `/System/Library` no trailing slash denies

Sudo and privilege escalation tests:

20. `sudo` denies
21. `sudo -i` denies
22. `sudo -s` denies
23. `sudo bash` denies
24. `echo hi && sudo cat /etc/passwd` denies, caught by pipe/chain
    checks
25. `doas <anything>` denies
26. `pkexec <anything>` denies
27. `$SUDO foo` denies
28. `${SUDO} foo` denies

Other dangerous command patterns:

29. `rm -rf /` denies
30. `rm -rf /*` denies
31. `rm -rf ~` denies
32. `rm -rf ~/Documents` requires approval, not allow
33. `mkfs.<anything>` denies
34. `dd if=/dev/zero of=/dev/disk0` denies

Add `doas` and `pkexec` to the FORBIDDEN_COMMANDS set.

==================================================
PATTERNS APPLIED FROM PHASE 3
==================================================

- Diagnostic logging from day 1 (Rule 31)
- Action-specific diagnostic discipline (Rule 32), including local
  browser session screenshots and actions
- Approval gates with audit logs (Rule 33); Phase 4 SafetyGovernor is
  the canonical implementation
- Per-subsystem commits (Rule 11)
- Rule 34: live smoke verified before human handoff
- Smoke tests for the canonical local task: write hello world, run
  Python, read output
- Live integration smoke equivalent to Phase 3 Section E: mixed task
  using the local backend that exercises file, shell, and browser tools
  in one task

==================================================
SMOKE TESTS REQUIRED FOR PHASE 4
==================================================

Per Rule 34, Codex runs each smoke before handing off:

- `pnpm smoke:local-backend-basic`: file write/read/list/delete inside
  workspace, no approval needed except deletes as specified above
- `pnpm smoke:local-backend-safety`: attempts known-dangerous actions
  and asserts each is denied with the correct matched pattern
- `pnpm smoke:local-backend-audit-log`: verifies audit.log entries
  match the schema for various action types
- `pnpm smoke:local-browser-separate-profile`: launches separate
  Chrome profile, navigates, and screenshots
- `pnpm smoke:local-browser-actual-chrome`: requires user to start
  Chrome with debug port, includes setup check, requires approval
- `pnpm smoke:local-rate-limit`: fires 50 shell_exec calls in 1 second
  and asserts the rate limit kicks in at 10
- `pnpm smoke:local-agent-integration`: mixed task: write file, list
  workspace, run Python, read output. Real local backend, real agent.
  Equivalent to Phase 3 Section E for local backend.

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-3 tests pass
2. Phase 4 tests pass 3 consecutive CI runs
3. User runs canonical task with backend=local
4. Files appear at ~/Documents/Handle/workspaces/<task-id>/
5. Dangerous shell commands (rm -rf /, sudo) denied
6. File writes outside workspace require approval
7. Local browser separate profile works
8. Local browser actual-Chrome works after approval + setup
9. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase4-local-execution.md:

Section A: Local backend basic operation
1. Set default backend to local
2. Run canonical task
3. Verify ~/Documents/Handle/workspaces/<task-id>/hn.json exists
4. Verify ~/Library/Logs/Handle/api.log shows shellExec calls

Section B: Safety governor
1. Submit task: "Delete all files in /System"
2. Verify denied without approval prompt
3. Submit task: "Run sudo apt update"
4. Verify denied
5. Submit task: "Write a haiku to ~/Desktop/poem.txt"
6. Verify approval prompt appears, approve, verify file exists

Section C: Local browser - separate profile
1. Set browser mode to separate profile
2. Submit task: "Go to news.ycombinator.com"
3. Verify Chrome window opens (not the user's)
4. Verify workspace UI shows screenshot

Section D: Local browser - actual Chrome
1. Quit Chrome
2. Start: `Google\ Chrome --remote-debugging-port=9222`
3. Set browser mode to actual Chrome
4. Submit task: "Tell me what tabs I have open"
5. Verify approval prompt
6. Approve, verify response includes user's actual tabs

==================================================
IMPLEMENTATION ORDER
==================================================

1. ExecutionBackend interface
2. Refactor existing E2B code into E2BBackend class
3. Update tools to use backend abstraction
4. SafetyGovernor with predicate checks
5. LocalBackend.fileWrite/Read/List/Delete
6. LocalBackend.shellExec
7. Approval flow integration for new approval types
8. LocalBrowserSession (separate profile mode)
9. LocalBrowserSession (actual Chrome mode)
10. Settings → Execution tab UI
11. Settings → Browser tab UI
12. Workspace backend pill UI
13. Tests
14. Manual audit harness
15. SIGNOFF

==================================================
END OF PHASE 4 SPEC
==================================================
