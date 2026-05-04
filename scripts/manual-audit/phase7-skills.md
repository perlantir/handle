# Phase 7 Manual Audit — Skills Platform

Run on branch `phase-7/skills` after migrations are applied and the local app is restarted.

## Preflight

- `pnpm --filter @handle/api prisma migrate deploy`
- `pnpm test`
- `pnpm build`
- `pnpm smoke:skills-stage1-ui`
- `pnpm smoke:custom-skill-crud`
- `pnpm smoke:custom-skill-test-run`
- `pnpm smoke:project-skill-library`
- `pnpm smoke:skill-workflow-sequential`
- `pnpm smoke:skill-workflow-parallel`
- `pnpm smoke:skill-schedule-once`
- `pnpm smoke:skill-schedule-cron`
- `pnpm smoke:skill-browser-runtime`
- `pnpm smoke:skill-local-browser-approval`
- `pnpm smoke:wide-research-orchestration`
- `pnpm smoke:skill-import-export`

## Section A: Skill Library

1. Open `http://127.0.0.1:3000/skills`.
2. Verify five built-in Skills appear.
3. Search for `company`; verify Research a Company remains visible.
4. Open Research a Company and verify metadata, instructions, policies, inputs, integrations, and artifact contract.

## Section B: Built-In Skill Runs

1. Run Research a Company with company `Acme` and depth `quick`.
2. Open the trace.
3. Verify status is completed, trace steps are user-safe, and report/source-set artifacts render.
4. Run each credentialed built-in Skill only when its integration is connected; otherwise verify it fails with a clear missing-integration message.

## Section C: Artifact UI

1. Open a completed Skill run.
2. Click each artifact.
3. Verify report, source set, drafts, itinerary, code review, and Notion summary artifacts render inline when present.
4. Verify citations are visible for source-backed artifacts.

## Section D: Approval Gates

1. Run Email Outreach with Gmail connected.
2. Verify sends are drafts/approval-gated and no email sends without explicit approval.
3. Run Code Review a PR and verify GitHub write actions are approval-gated.

## Section E: Custom Skill Creation

1. Open `/skills`, click Create.
2. Create a personal Skill with one required `topic` input.
3. Click Test Run.
4. Verify the run completes and produces a custom markdown artifact.
5. Edit the generated SKILL.md and verify missing required sections are rejected.

## Section F: Project Skill Library

1. Create or select a project.
2. Create a Project Skill.
3. Verify it appears under the Project tab and not as a global built-in.
4. Refresh the page and verify it persists.

## Section G: Import / Export

1. Open Import/Export.
2. Export a custom Skill.
3. Paste the exported bundle back into the import panel.
4. Import it and verify the imported Skill appears in the personal library.

## Section H: Workflows

1. Open Workflows.
2. Build a sequential two-Skill workflow and run it.
3. Build a parallel workflow and run it.
4. Verify each run completes and records workflow status.

## Section I: Scheduling

1. Open Scheduled.
2. Create a cron schedule for Research a Company.
3. Click Save & Run Now.
4. Verify a normal SkillRun is created with trigger `SCHEDULED`.
5. Verify Temporal is running when testing durable schedules.

## Section J: Browser / Computer Runtime

1. Run Research a Company with server browser runtime.
2. Verify a browser session summary artifact appears.
3. Run a custom Skill that explicitly allows local browser.
4. Verify local browser mode is policy checked.

## Section K: Wide Research

1. Run Research a Company in Wide Research mode.
2. Verify trace contains wide research subtask steps.
3. Verify source-map artifact covers multiple research topics.

## Section L: Regression

1. Run Phase 1-6.5 regression smokes that are credential-valid in the local environment.
2. Verify normal chat/task creation still works.
3. Verify memory, integrations, schedules, actions, and notifications pages still load.
