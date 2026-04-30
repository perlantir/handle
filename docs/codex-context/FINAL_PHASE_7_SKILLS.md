# Handle — Phase 7: Skills (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-6 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add Skills to Handle. A Skill is an installable workflow package
that bundles:
- A name and description
- Required integrations
- A prompt template (system prompt addition)
- A narrowed tool list
- Optional suggested model

Five built-in skills ship with Handle. Users see them in /skills
(Screen 07). The agent detects when a skill applies; the user
confirms before activation.

The Wide Research screen (05) implements the Research skill.

Phase 7 ships in 2 weeks.

==================================================
SCOPE
==================================================

In scope:
- Skill abstraction (manifest format)
- 5 built-in skills:
  - Research a company
  - Email outreach to a list
  - Plan a trip
  - Code review a PR
  - Summarize a Notion workspace
- Skill detection (LLM classifier)
- Skill execution (system prompt + tool subset)
- Skills UI (Screen 07)
- Wide Research screen (Screen 05)
- Recent runs view

Out of scope:
- Custom user-created skills (Phase 12+)
- Skill marketplace (Phase 12+)
- Skill versioning (use simple v1 pattern; bump on changes)

==================================================
SKILL ABSTRACTION
==================================================

apps/api/src/skills/types.ts:

```typescript
export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  category: 'research' | 'communication' | 'planning' | 'engineering' | 'analysis';
  iconLetter: string;     // Letter avatar
  iconColor: string;      // Tailwind class or hex
  requiredIntegrations: string[];   // ['gmail', ...]
  optionalIntegrations: string[];
  promptTemplate: string;          // Adds to system prompt
  toolWhitelist: string[];          // Tool names available
  suggestedModel?: string;          // E.g., 'claude-opus-4.5' for research
  uiTemplate?: 'wide-research' | 'standard';   // Screen layout
}

export interface SkillRun {
  id: string;
  skillId: string;
  taskId: string;
  startedAt: Date;
  status: 'running' | 'completed' | 'error';
  cost?: number;
}
```

==================================================
BUILT-IN SKILLS
==================================================

apps/api/src/skills/builtin/research.ts:

```typescript
import type { SkillManifest } from '../types';

export const researchCompanySkill: SkillManifest = {
  id: 'research-company',
  name: 'Research a Company',
  description: 'Deep research on a company including products, leadership, news, and financials.',
  category: 'research',
  iconLetter: 'R',
  iconColor: '#7B5BFF',
  requiredIntegrations: [],
  optionalIntegrations: ['notion'],
  promptTemplate: `
You are conducting structured research on a company.

Process:
1. Identify the company and clarify scope (which division, country, etc.)
2. Gather:
   - Products and services
   - Founding date, founders, key leadership
   - Recent news (last 6 months)
   - Financials (if public, latest reports)
   - Notable customers, competitors
3. Source quality matters: prefer official site, recent press releases,
   reputable news. Cite sources inline.
4. Output: Markdown report with H1 (company name), H2 sections, citations
   in [n] form, sources listed at end.

If the user has Notion connected, optionally save the report there.
`,
  toolWhitelist: ['browser_navigate', 'browser_extract_text', 'browser_scroll', 'memory_search', 'memory_save', 'notion_create_page'],
  suggestedModel: 'claude-opus-4.5',
  uiTemplate: 'wide-research',
};
```

apps/api/src/skills/builtin/emailOutreach.ts:

```typescript
export const emailOutreachSkill: SkillManifest = {
  id: 'email-outreach',
  name: 'Email Outreach',
  description: 'Draft and send personalized emails to a list of contacts.',
  category: 'communication',
  iconLetter: 'E',
  iconColor: '#FF6B5B',
  requiredIntegrations: ['gmail'],
  optionalIntegrations: ['notion'],
  promptTemplate: `
You are sending personalized outreach emails.

Process:
1. Get the contact list (from user input, Notion, or a file)
2. For each contact, draft a personalized email
3. Show the user all drafts before sending
4. After approval, send via Gmail
5. Report results

Always:
- Personalize every email (no copy-paste)
- Keep tone professional but warm
- Get explicit approval before sending
- Log results for the user
`,
  toolWhitelist: ['gmail_send', 'gmail_search', 'notion_query_database', 'memory_search'],
};
```

Three more (briefer manifests, full implementations follow same
pattern):

- planTripSkill (id: 'plan-trip', requires browser, optional Gmail/Notion)
- codeReviewPRSkill (id: 'code-review-pr', requires GitHub)
- summarizeNotionSkill (id: 'summarize-notion', requires Notion)

==================================================
SKILL REGISTRY
==================================================

apps/api/src/skills/registry.ts:

```typescript
import { researchCompanySkill } from './builtin/research';
import { emailOutreachSkill } from './builtin/emailOutreach';
import { planTripSkill } from './builtin/planTrip';
import { codeReviewPRSkill } from './builtin/codeReviewPR';
import { summarizeNotionSkill } from './builtin/summarizeNotion';
import type { SkillManifest } from './types';

const builtinSkills: SkillManifest[] = [
  researchCompanySkill,
  emailOutreachSkill,
  planTripSkill,
  codeReviewPRSkill,
  summarizeNotionSkill,
];

export function listSkills(): SkillManifest[] {
  return builtinSkills;
}

export function getSkill(id: string): SkillManifest | undefined {
  return builtinSkills.find((s) => s.id === id);
}

export function getSkillsAvailableTo(userIntegrations: string[]): SkillManifest[] {
  return builtinSkills.filter((s) =>
    s.requiredIntegrations.every((req) => userIntegrations.includes(req))
  );
}
```

==================================================
SKILL DETECTION
==================================================

When a user submits a goal, optionally classify which skill (if
any) applies. This runs as a quick LLM call before the main
agent kicks off.

apps/api/src/skills/detector.ts:

```typescript
import { providerRegistry } from '../providers/registry';
import { listSkills } from './registry';

export async function detectSkill(goal: string, userIntegrations: string[]): Promise<{
  skill: SkillManifest | null;
  confidence: number;
}> {
  const available = getSkillsAvailableTo(userIntegrations);
  if (!available.length) return { skill: null, confidence: 0 };

  const { model } = await providerRegistry.getActiveModel();
  
  const prompt = `Given the user's goal, identify which skill (if any) best applies.

Available skills:
${available.map((s) => `- ${s.id}: ${s.description}`).join('\n')}

User's goal: "${goal}"

Reply with JSON: { "skillId": "id-or-null", "confidence": 0.0-1.0 }
`;

  const response = await model.invoke(prompt);
  try {
    const parsed = JSON.parse(response.content as string);
    const skill = parsed.skillId ? getSkill(parsed.skillId) : null;
    return { skill: skill ?? null, confidence: parsed.confidence };
  } catch {
    return { skill: null, confidence: 0 };
  }
}
```

If confidence > 0.7, the UI suggests the skill before running.
If user accepts, skill is activated.

==================================================
SKILL EXECUTION
==================================================

When a skill is activated:

```typescript
// In runAgent
const activeSkill: SkillManifest | null = task.skillId ? getSkill(task.skillId) : null;

const allTools = [...baseTools, ...browserTools, ...memoryTools, ...integrationTools];
const filteredTools = activeSkill
  ? allTools.filter((t) => activeSkill.toolWhitelist.includes(t.name))
  : allTools;

const enhancedSystemPrompt = activeSkill
  ? `${BASE_SYSTEM_PROMPT}\n\n<active_skill name="${activeSkill.name}">\n${activeSkill.promptTemplate}\n</active_skill>`
  : BASE_SYSTEM_PROMPT;

// Use suggestedModel if specified
const modelOverride = activeSkill?.suggestedModel;
```

==================================================
SKILLS UI (SCREEN 07)
==================================================

apps/web/app/(workspace)/skills/page.tsx:

Two sections:

### Installed (top)

3-column grid (or 4 on wider screens) of SkillCard components:

```tsx
<SkillCard skill={skill}>
  <Avatar letter={skill.iconLetter} color={skill.iconColor} verified />
  <h3>{skill.name}</h3>
  <p>{skill.description}</p>
  <p className="caption">Used {usage.count} times</p>
</SkillCard>
```

### Recent runs (bottom)

Table:
- Skill | Action | Time | Cost | Status
- Each row click opens the underlying task

==================================================
WIDE RESEARCH SCREEN (SCREEN 05)
==================================================

When task.skillId === 'research-company' AND uiTemplate ===
'wide-research', the Workspace renders Screen 05's layout
instead of Screen 03.

apps/web/components/workspace/WideResearchLayout.tsx:

3-column (300 / 1fr / 280):

Left: Plan tree (indented research outline showing what's been
researched, what's pending)

Center: Report (max-width 640, H1 + meta, body with citation
chips)

Right: Sources list (numbered, domain + title)

Implement as conditional render based on task.skillId in the
Workspace page.

==================================================
SKILL TRIGGER UI
==================================================

When detectSkill returns a high-confidence skill, show a
suggestion banner above the composer:

```tsx
<Banner>
  <Icon icon="sparkle" />
  <span>This looks like a <strong>Research</strong> task. Use the Research skill?</span>
  <PillButton variant="primary" size="sm" onClick={activateSkill}>Use skill</PillButton>
  <PillButton variant="ghost" size="sm" onClick={dismiss}>No thanks</PillButton>
</Banner>
```

User can also directly invoke a skill from /skills (click "Use
skill" on any card).

==================================================
TESTS
==================================================

1. Skill registry returns all 5 built-in skills
2. getSkillsAvailableTo filters by integrations
3. detectSkill calls LLM and parses JSON
4. Skill execution narrows tool list
5. Skill execution adds prompt template
6. Skills page renders cards
7. Recent runs table displays correctly
8. WideResearchLayout renders for research skill

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-6 tests pass
2. Phase 7 tests pass 3 consecutive CI runs
3. All 5 skills run their workflows
4. Skill detection works for ambiguous prompts
5. Wide Research layout renders for research skill
6. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase7-skills.md:

Section A: Each built-in skill
1. /skills → Research → Use skill → "Research Anthropic"
   Verify Wide Research layout, plan tree, report with citations
2. Email Outreach → Use skill → "Email John, Mary, Steve about Q4 launch"
   Verify drafts, approval flow, gmail_send
3. Plan Trip → Use skill → "Plan a 3-day trip to Tokyo"
   Verify itinerary output
4. Code Review → Use skill → "Review PR #42 in repo X"
   Verify github_read_file calls, review comments
5. Summarize Notion → Use skill → "Summarize my notes from this week"
   Verify notion_query_database + summary

Section B: Auto-detection
1. Submit: "Tell me about Stripe the company"
   (don't pre-select a skill)
2. Verify suggestion banner: "Use Research skill?"
3. Click Use skill, verify research-company runs

==================================================
IMPLEMENTATION ORDER
==================================================

1. Skill manifest types
2. 5 built-in skill manifests
3. Skill registry
4. Skill detection
5. Skill execution in runAgent
6. SkillCard component
7. Skills page UI
8. Recent runs table
9. Wide Research layout
10. Skill suggestion banner
11. Tests
12. Manual audit
13. SIGNOFF

==================================================
END OF PHASE 7 SPEC
==================================================
