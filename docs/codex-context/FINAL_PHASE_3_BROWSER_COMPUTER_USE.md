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
          model: 'claude-opus-4.5',  // or current latest with computer-use
          max_tokens: 1024,
          tools: [{
            type: 'computer_20250124',  // version current at time of impl
            name: 'computer',
            display_width_px: 1280,
            display_height_px: 800,
          }],
          messages,
          betas: ['computer-use-2025-01-24'],  // current beta header
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
https://docs.claude.com/en/docs/build-with-claude/computer-use for
the current beta header, action types, and tool spec when
implementing.

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
7. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase3-browser.md:

Section A: DOM-based browser
1. Submit task: "Go to news.ycombinator.com and tell me the top
   story"
2. Verify navigation, extract_text, response

Section B: Computer use
1. Submit task: "Open figma.com/community and describe what you
   see"
2. Verify computer-use kicks in (screenshots in inspector)
3. Verify response

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
