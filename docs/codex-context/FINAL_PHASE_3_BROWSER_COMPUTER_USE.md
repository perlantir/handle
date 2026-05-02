# Handle — Phase 3: Browser + Computer Use (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1 + 2 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add browser automation to Handle. Two modes:
1. DOM-based via Browser-Use (selectors, fast, deterministic)
2. Vision-based via Anthropic computer-use API (screenshots,
   coordinates, slower but resilient)

The agent picks which mode based on task. UI shows the browser
in the Workspace center pane (per Screen 03 design).

Phase 3 ships in 2-3 weeks.

==================================================
PHASE 2 AUDIT LEARNINGS APPLIED TO PHASE 3
==================================================

Provider choice:
- Primary computer-use model is Anthropic via the existing Phase 2
  provider/key path.
- Default model: `claude-opus-4-7`.
- Computer-use requests must include the Anthropic beta header
  `anthropic-beta: computer-use-2025-11-24`.
- Phase 11 may switch the cost-optimized path to OpenAI
  `chatgpt-oauth` after the localhost proxy translates
  `/codex/responses` function calls back into OpenAI-compatible
  `tool_calls`.

Computer-use enrollment:
- As of May 2026, no Anthropic console enrollment is required.
- Computer use is enabled per request with the beta header above.
- No `console.anthropic.com` setup step is required beyond having an
  Anthropic API key configured in Phase 2 Settings.

Rules to apply from day 1:
- Rule 30: suppress sampler defaults for the computer-use provider
  path unless the user explicitly configures them.
- Rule 31: when a smoke/live integration failure lacks enough
  evidence, add diagnostic logging first, then fix.
- Rule 11: keep Phase 3 commits per subsystem.

References:
- Anthropic computer use tool docs:
  https://platform.claude.com/docs/en/docs/build-with-claude/computer-use
- E2B computer use docs:
  https://e2b.dev/docs/use-cases/computer-use
- E2B Desktop SDK docs:
  https://e2b.dev/docs/sdk-reference/desktop-python-sdk/v2.3.0/desktop

==================================================
SCOPE
==================================================

In scope:
- Browser-Use integration in E2B sandbox
- Browser tools: navigate, click, type, extract_text, screenshot,
  go_back, scroll, wait_for_selector
- Anthropic computer-use API integration
- Computer-use loop: screenshot → reason → click coordinates
- Browser tab in Workspace center pane (per design)
- Live screenshot streaming via SSE
- Approval requirement for risky browser actions
  (form submissions, payment forms, auth-sensitive sites)

Out of scope:
- Local backend browser (Phase 4)
- Browser session persistence across tasks (cookies are
  task-scoped only)

==================================================
BROWSER-USE INTEGRATION
==================================================

Browser-Use is the primary tool for DOM-based browser automation.
It runs Playwright underneath but provides higher-level
abstractions (intent-based actions) that work better with LLMs.

Install in E2B sandbox via apps/api/src/execution/e2bBackend.ts
sandbox initialization:

```typescript
async function initSandbox(): Promise<Sandbox> {
  const sandbox = await Sandbox.create({ template: 'base' });
  
  // Install Browser-Use and Playwright in the sandbox
  await sandbox.process.start({
    cmd: 'pip install browser-use playwright && playwright install chromium',
    onStdout: () => {}, onStderr: () => {},
  }).then(p => p.wait());
  
  return sandbox;
}
```

NOTE: Browser-Use is primarily Python. The TypeScript ecosystem
has matured by your implementation date — check whether a TS port
exists. If not, use raw Playwright with Browser-Use's prompting
patterns.

==================================================
BROWSER TOOLS
==================================================

apps/api/src/agent/browserTools.ts:

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { emitTaskEvent } from '../lib/eventBus';
import { randomUUID } from 'node:crypto';
import type { ToolContext } from './tools';

export interface BrowserSession {
  navigate(url: string): Promise<{ title: string; screenshot: Buffer }>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  extractText(selector?: string): Promise<string>;
  screenshot(): Promise<Buffer>;
  goBack(): Promise<void>;
  scroll(direction: 'up' | 'down', amount: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
}

export function createBrowserTools(ctx: ToolContext, browser: BrowserSession) {
  const browserNavigate = tool(
    async (input: { url: string }) => {
      const callId = randomUUID();
      emitTaskEvent({ type: 'tool_call', toolName: 'browser.navigate', args: input, callId, taskId: ctx.taskId });

      try {
        const { title, screenshot } = await browser.navigate(input.url);
        
        // Stream screenshot
        emitTaskEvent({
          type: 'tool_stream',
          callId,
          channel: 'stdout',
          content: `[screenshot]${screenshot.toString('base64')}[/screenshot]`,
          taskId: ctx.taskId,
        });

        const result = `Navigated to ${input.url}. Title: "${title}"`;
        emitTaskEvent({ type: 'tool_result', callId, result, taskId: ctx.taskId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emitTaskEvent({ type: 'tool_result', callId, result: '', error, taskId: ctx.taskId });
        throw err;
      }
    },
    {
      name: 'browser_navigate',
      description: 'Navigate the browser to a URL.',
      schema: z.object({ url: z.string().url() }),
    },
  );

  // ... browserClick, browserType, browserExtractText, browserScreenshot,
  //     browserGoBack, browserScroll, browserWaitForSelector follow same pattern
  
  return [browserNavigate, /* others */];
}
```

==================================================
ANTHROPIC COMPUTER USE
==================================================

For tasks where DOM selectors fail (canvas-based UIs, image-heavy
content, anti-bot sites), use Anthropic's computer-use API.

Install: `@anthropic-ai/sdk@latest`

Use the existing Phase 2 Anthropic credential/config path. Do not add
a second Anthropic key mechanism.

Current model/tool configuration as of May 2026:
- Model: `claude-opus-4-7`
- Beta header: `computer-use-2025-11-24`
- Computer tool: `computer_20251124`
- Shell tool: `bash_20250124`
- Text editor tool: `text_editor_20250728`

The Anthropic computer-use tool specifically provides screen viewing,
mouse control, and keyboard control. It can be combined with
Anthropic's `bash_20250124` and `text_editor_20250728` tool types.
Those overlap with Handle's Phase 1 `shell_exec`, `file_read`, and
`file_write` tools, so implementation must verify whether to expose
Anthropic's tool types as separate adapters or unify them with the
existing E2B-backed tools. Do not duplicate tool behavior unless the
Anthropic API contract requires it.

Suppress sampler defaults for this provider mode. Add a unit test that
asserts outgoing computer-use request bodies do not include
`temperature`, `top_p`, `top_k`, `n`, `presence_penalty`, or
`frequency_penalty` unless explicitly configured.

Add diagnostic logging from the first implementation commit:
- provider/model/tool version
- beta header
- request body with secrets and screenshots redacted
- response body with secrets redacted
- tool-use action names and timings
- full error stacks

apps/api/src/agent/computerUseTools.ts:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BrowserSession } from './browserTools';
import type { ToolContext } from './tools';

export function createComputerUseTool(ctx: ToolContext, browser: BrowserSession) {
  const anthropic = new Anthropic();

  const computerUse = tool(
    async (input: { goal: string; maxSteps?: number }) => {
      const callId = randomUUID();
      emitTaskEvent({ type: 'tool_call', toolName: 'computer_use', args: input, callId, taskId: ctx.taskId });

      let stepCount = 0;
      const maxSteps = input.maxSteps ?? 10;
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: input.goal },
      ];

      while (stepCount < maxSteps) {
        const screenshot = await browser.screenshot();
        
        // Add screenshot to message
        messages.push({
          role: 'user',
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') },
          }],
        });

        const response = await anthropic.beta.messages.create({
          model: 'claude-opus-4-7',
          max_tokens: 1024,
          tools: [{
            type: 'computer_20251124',
            name: 'computer',
            display_width_px: 1280,
            display_height_px: 800,
          }, {
            type: 'text_editor_20250728',
            name: 'str_replace_based_edit_tool',
          }, {
            type: 'bash_20250124',
            name: 'bash',
          }],
          messages,
          betas: ['computer-use-2025-11-24'],
        });

        if (response.stop_reason === 'end_turn') {
          const textContent = response.content.filter(c => c.type === 'text').map((c: any) => c.text).join('');
          emitTaskEvent({ type: 'tool_result', callId, result: textContent, taskId: ctx.taskId });
          return textContent;
        }

        // Execute tool calls
        for (const block of response.content) {
          if (block.type === 'tool_use' && block.name === 'computer') {
            const action = (block.input as any).action;
            // Map computer-use actions to Playwright via BrowserSession
            await executeComputerUseAction(browser, action, block.input);
          }
        }

        messages.push({ role: 'assistant', content: response.content });
        stepCount++;
      }

      throw new Error('Computer-use exceeded max steps');
    },
    {
      name: 'computer_use',
      description: 'Use vision-based browser interaction for tasks where DOM selectors fail. Slow but resilient. Provide a high-level goal in natural language.',
      schema: z.object({
        goal: z.string().describe('What you want to accomplish'),
        maxSteps: z.number().optional().describe('Max iterations (default 10)'),
      }),
    },
  );

  return computerUse;
}

async function executeComputerUseAction(browser: BrowserSession, action: string, input: any) {
  // Map: 'screenshot' -> browser.screenshot()
  //      'left_click' at (x, y) -> Playwright page.mouse.click(x, y)
  //      'type' text -> Playwright page.keyboard.type(text)
  //      'key' (e.g., 'Return') -> page.keyboard.press
  //      'scroll' -> page.evaluate(window.scrollBy)
  // Implementation requires extending BrowserSession with low-level methods
}
```

NOTE: Anthropic's computer-use API evolves. Check current docs at
https://platform.claude.com/docs/en/docs/build-with-claude/computer-use for
the current beta header, action types, and tool spec when
implementing.

==================================================
SANDBOX DESKTOP REQUIREMENTS
==================================================

Computer use requires a virtual display inside the sandbox. The agent
must never control the user's host machine.

As of May 2026, E2B documents Desktop sandboxes for computer-use
agents: Ubuntu 22.04, XFCE desktop, screenshot/control APIs, and VNC
streaming for visual feedback. E2B's Desktop SDK creates a sandbox
from the default `desktop` template by default, with default
resolution 1024x768 and configurable resolution/DPI/display.

Phase 3 implementation should start with E2B Desktop sandboxes. If the
current TypeScript SDK cannot provide the required screenshot, mouse,
keyboard, and browser control APIs, stop and ask before considering a
different sandbox provider.

Implementation must verify:
- Whether to use E2B's Desktop SDK/package directly or a custom E2B
  template with Xvfb/XFCE/Chromium.
- Whether Browser-Use and computer-use can share the same desktop
  sandbox or require separate sandbox constructors.
- How screenshots are captured and redacted before logging.
- How VNC/live-view data maps to the Workspace Browser tab.

==================================================
COST EXPECTATIONS
==================================================

Computer use is materially more expensive than DOM browser automation.
Each screenshot typically adds 1500-2000 input tokens, and a task may
take 5-30 screenshot/action iterations.

Expected per-task cost: roughly $0.10-$2.00 for typical tasks,
depending on model, number of screenshots, and recovery loops.

Add a UI warning before launching computer-use tasks. The warning
should make clear that:
- DOM browser automation is attempted first when suitable.
- Vision computer-use is slower and more expensive.
- The task runs in an isolated virtual desktop, not on the host Mac.
- The user can stop the task with the kill switch.

==================================================
COMPUTER-USE RISK MITIGATIONS
==================================================

Required mitigations:
- Run all computer-use actions inside a virtual E2B desktop, never on
  the host machine.
- Add a URL/application allowlist for Phase 3 computer-use tasks.
- Add a Workspace kill switch that immediately stops the browser task
  and kills the sandbox.
- Redact screenshots before logging or storing any diagnostic payloads.
- Require approval before risky browser actions, including form
  submissions, payment flows, auth-sensitive sites, and destructive
  actions.
- Stream screenshots to the UI for user visibility, but do not write
  raw screenshots to long-term logs.

==================================================
SAFETY: APPROVAL FOR RISKY ACTIONS
==================================================

The agent should request approval before:
- Submitting forms (especially login forms)
- Clicking on payment/checkout flows
- Posting to social media or forums
- Browsing sites in the user's logged-in state on actual Chrome
  (Phase 4 feature)

Hook this into the existing approval flow:

```typescript
// Before browser_click
if (isRiskyClick(selector)) {
  const approvalId = await requestApproval(ctx.taskId, {
    type: 'risky_browser_action',
    reason: `Click "${selector}" appears to submit a form or trigger payment`,
  });
  const approved = await awaitApproval(approvalId);
  if (!approved) throw new Error('User denied browser action');
}
```

isRiskyClick is a simple heuristic: selector contains "submit",
"pay", "checkout", "delete", "remove", or matches common payment
button patterns. Refine as needed.

==================================================
WORKSPACE BROWSER TAB
==================================================

The center pane in Screen 03 has tabs: Browser | Terminal | Preview.
The Browser tab shows:

- Address bar (URL of current page)
- Current screenshot
- Cursor overlay showing where the agent clicked last
- Tooltip showing what the agent is about to do

Implement in apps/web/components/workspace/BrowserTab.tsx using
the design system Tab primitive and Screenshot display.

```tsx
'use client';
import { useMemo } from 'react';
import { useWorkspaceState } from '@/hooks/useWorkspaceState';

export function BrowserTab() {
  const { browserState } = useWorkspaceState();
  
  if (!browserState) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No browser activity yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Address bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle bg-bg-surface">
        <div className="text-xs text-text-tertiary tabular-nums">{browserState.url}</div>
      </div>
      
      {/* Screenshot */}
      <div className="flex-1 overflow-auto bg-bg-subtle p-4">
        {browserState.screenshot && (
          <img
            src={`data:image/png;base64,${browserState.screenshot}`}
            alt="Browser screenshot"
            className="w-full h-auto rounded-md shadow-md"
          />
        )}
      </div>
    </div>
  );
}
```

==================================================
SSE EVENTS FOR BROWSER
==================================================

Add to packages/shared/src/types.ts:

```typescript
export interface BrowserStateEvent {
  type: 'browser_state';
  url: string;
  title: string;
  screenshot: string;  // base64 PNG
  taskId: string;
}
```

Emit on every navigate, click, scroll. The Workspace BrowserTab
listens for these and updates.

==================================================
TESTS
==================================================

1. Browser-Use integration: navigate + extractText with mocked
   sandbox
2. Each browser tool emits events correctly
3. Computer-use loop with mocked Anthropic responses
4. Approval required for risky clicks
5. BrowserTab renders screenshot and URL
6. SSE browser_state events update workspace UI
7. Computer-use request body suppresses sampler defaults
8. Computer-use diagnostics redact screenshots and secrets
9. Smoke test for canonical computer-use task:
   "open Hacker News in browser, click first story, screenshot the
   result"

==================================================
GATE CRITERIA
==================================================

1. All Phase 1+2 tests pass
2. Phase 3 tests pass 3 consecutive CI runs
3. Agent navigates a complex SaaS dashboard, extracts data via
   DOM
4. Agent uses computer-use for a canvas-heavy site (e.g., Figma
   read-only view)
5. Approval flow triggers on risky click
6. Workspace browser tab shows live screenshots
7. Computer-use canonical smoke passes:
   "open Hacker News in browser, click first story, screenshot the
   result"
8. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase3-browser.md:

Section A: DOM-based browser
1. Submit task: "Go to news.ycombinator.com and tell me the top
   story"
2. Verify navigation, extract_text, response

Section B: Computer use
1. Submit task: "Open Hacker News in a browser, click the first
   story, and screenshot the result"
2. Verify computer-use kicks in (screenshots in inspector)
3. Verify click action lands on the first story
4. Verify final screenshot appears in Workspace Browser tab
5. Verify response summarizes the opened story

Section C: Risky action approval
1. Submit task: "Go to amazon.com and search for laptops, then
   add the first one to my cart"
2. Verify approval modal appears before "add to cart" click
3. Click Deny, verify task surfaces error

==================================================
IMPLEMENTATION ORDER
==================================================

1. BrowserSession interface
2. E2B sandbox Browser-Use installation
3. browserTools (each tool in own file or grouped)
4. SSE browser_state event type
5. Computer-use integration
6. Risky action heuristic + approval hook
7. BrowserTab component
8. Update Workspace center pane to include browser tab
9. Tests
10. Manual audit harness
11. SIGNOFF

==================================================
END OF PHASE 3 SPEC
==================================================
