# Phase 6 Manual Audit - Integrations

**Auditor: User. Codex does not run this manual audit.**

Phase 6 covers the Nango-backed integrations layer, Tier 1-3 connector tools,
approval gates for writes, integration memory privacy, Obsidian local-vault
access, action logging, and regression across Phases 1-5.

## Pre-Audit Setup

1. Verify branch is `phase-6/integrations`.
2. Pull and install: `git pull && pnpm install`
3. Verify Zep is available for memory checks: `pnpm memory:up`
4. Kill any LISTEN on ports 3000 and 3001.
5. Start backend: `pnpm --filter @handle/api dev`
6. Start frontend: `pnpm --filter @handle/web dev`
7. Open `http://127.0.0.1:3000`.
8. Open Settings -> Integrations.
9. Keep these logs available:
   - `tail -f ~/Library/Logs/Handle/api.log`
   - `tail -f ~/Library/Logs/Handle/audit.log`
   - `tail -f ~/Library/Logs/Handle/actions.log`
   - `tail -f ~/Library/Logs/Handle/memory.log`

## BYOK OAuth App Checklist

Use app name `Handle Dev - <Connector>` for every OAuth app. Redirect URI is:

```text
https://api.nango.dev/oauth/callback
```

Create/register credentials for:

- [ ] Gmail: Google Cloud Console, Gmail API scopes shown in Settings.
- [ ] Slack: Slack API apps, channel/search/chat scopes shown in Settings.
- [ ] Notion: Notion integrations page, public OAuth integration.
- [ ] Google Drive: Google Cloud Console, Drive scopes shown in Settings.
- [ ] GitHub: GitHub Developer Settings. Stage 1 already proved this path once.
- [ ] Google Calendar: Google Cloud Console, Calendar scopes shown in Settings.
- [ ] Cloudflare: Cloudflare OAuth/API app settings.
- [ ] Vercel: Vercel integration/OAuth settings.
- [ ] Linear: Linear OAuth app settings.
- [ ] Google Sheets: Google Cloud Console, Sheets/Drive file scopes.
- [ ] Google Docs: Google Cloud Console, Docs/Drive file scopes.
- [ ] Zapier: Zapier Developer Platform.
- [ ] Obsidian: no Nango app. Configure one local vault path in Settings.

## Section A: Nango And BYOK Setup

1. Open Settings -> Integrations on a fresh profile or after removing saved
   Nango settings.
2. Verify the Nango card shows `Nango not configured`.
3. Paste the Nango secret key in Settings and save.
4. Verify the status changes to `Nango configured`.
5. For GitHub, paste OAuth client ID and secret, save, click Connect, complete
   Nango Connect, then click Finish connection if needed.
6. Repeat setup for at least one Google connector and one non-Google connector
   if OAuth credentials are available.

Verify:

- [ ] No `.env` editing was required.
- [ ] Client secrets are not displayed after save.
- [ ] Redirect URI shown in Settings matches Nango.
- [ ] Connection status reaches `CONNECTED`.
- [ ] Test connection reports `Connected` in green or `Failed` in red.

## Section B: Settings -> Integrations UI

1. Open Settings -> Integrations.
2. Verify all 13 connectors appear in tier order.
3. For a connected connector, add a second account with a different alias.
4. Mark the second account as default.
5. Change the connector memory dropdown to `Project memory`, then back to
   `Memory off`.
6. Click Test on a connected account.
7. Disconnect a non-critical test account, then reconnect it.
8. For Obsidian, enter a real vault path, save, and test.

Verify:

- [ ] State pills are accurate for missing credentials, ready, connected, error,
  and local vault.
- [ ] Account alias and default status persist after refresh.
- [ ] Memory dropdown persists after refresh.
- [ ] Obsidian vault path persists as connection metadata.
- [ ] Setup checklist and provider deep links are visible.

## Section C: Tier 1 Read Tools

Use a project in `ASK` mode. Reads must not trigger approval.

1. Gmail: ask agent to search a harmless query and summarize message metadata.
2. Slack: ask agent to list channels or search a harmless test phrase.
3. Notion: ask agent to search pages and read a controlled test page.
4. Google Drive: ask agent to search Drive and export/read controlled metadata.
5. GitHub: ask agent to list issues in `perlantir/handle` or another safe repo.

Verify:

- [ ] Reads run without approval prompts.
- [ ] Tool output streams to the UI.
- [ ] Typed errors are clear when a connector is not connected.
- [ ] No email, Slack, doc, or Drive body content is written to memory by
  default.

## Section D: Tier 1 Write Tools And Approvals

Use controlled test destinations only.

1. Set project permission mode to `ASK`.
2. Gmail: send or draft to a controlled test address only.
3. Slack: send to a test channel only.
4. Notion: create a test page, then update it.
5. Drive: create/upload a test file.
6. GitHub: create/comment a test issue.
7. Repeat one write in `PLAN` mode.
8. Repeat one non-destructive write in `FULL_ACCESS`.
9. Trigger a forbidden pattern, such as Slack `@channel` or GitHub protected
   branch modification.

Verify:

- [ ] `ASK` and `PLAN` show approval modals for writes.
- [ ] Approval modal includes connector, account, action, target, and agent
  reason when provided.
- [ ] `FULL_ACCESS` skips approval only for non-destructive writes.
- [ ] Forbidden patterns deny without approval.
- [ ] Successful writes create `integration_action` entries in
  `~/Library/Logs/Handle/actions.log`.

## Section E: Tier 2 Connectors

Run only against controlled test data.

1. Calendar: list calendars, create a controlled event, update it, then delete
   that exact event.
2. Cloudflare: list accounts/zones/DNS records. If a test zone exists, create or
   update a safe test DNS record. Do not touch production apex records.
3. Vercel: list projects/deployments and read logs. If a test project exists,
   create a safe deployment or cancel a test deployment.
4. Linear: list teams/projects, create a test issue, update it, comment on it.

Verify:

- [ ] Reads run without approval.
- [ ] Writes require approval in `ASK` and `PLAN`.
- [ ] Destructive actions require approval in all modes.
- [ ] Cloudflare forbidden patterns deny nameserver/security/env-secret changes.
- [ ] Vercel forbidden patterns deny project deletion/env-var exposure.
- [ ] Linear forbidden patterns deny bulk close/delete.

## Section F: Tier 3 Connectors

Run only against controlled test data.

1. Sheets: read a controlled spreadsheet, update one test range, append one row.
2. Docs: read/export a controlled document, create or insert text into a test
   document.
3. Zapier: list Zaps, read history, trigger a controlled no-op Zap, and verify
   broad fan-out is denied.
4. Obsidian: configure a test vault path. List notes, read a test note, create a
   note, append to it, and attempt a path traversal write.

Verify:

- [ ] Sheets/Docs writes require approval in `ASK` and `PLAN`.
- [ ] Zapier trigger requires approval and broad fan-out is denied.
- [ ] Obsidian cannot read/write outside the configured vault.
- [ ] Obsidian cannot modify `.obsidian/` configuration.
- [ ] Obsidian uses SafetyGovernor and action logging.

## Section G: Memory Privacy

1. Confirm every new connector defaults to `Memory off`.
2. Enable `Project memory` for GitHub.
3. Create a test GitHub issue from the agent.
4. Open `/memory`, filter/search for GitHub metadata.
5. Toggle memory off in the composer and repeat a write.
6. Test a secret-like payload through a connector write.

Verify:

- [ ] Only allowlisted metadata is stored, such as repo/project/target names.
- [ ] Raw email, Slack, Docs, Sheets, Drive, Notion, and Obsidian body content is
  not stored by default.
- [ ] Composer memory-off override drops integration memory candidates.
- [ ] Secrets are redacted/skipped and never appear in Zep memory.

## Section H: Error UX And Recovery

1. Try a read on a disconnected connector.
2. Remove or revoke a test connection in the provider/Nango UI, then click Test.
3. Trigger a known provider 404 with a fake repo/page/file ID.
4. If possible, trigger a provider rate limit or inspect a mocked/test error
   path.

Verify:

- [ ] Error tells the user which connector/account failed.
- [ ] UI offers Connect/Reconnect/Retry where applicable.
- [ ] Account-selection errors list available aliases.
- [ ] Logs include redacted provider/Nango status and duration.
- [ ] Agent explains the error without hiding the actionable UI affordance.

## Section I: Action Log And Failure Memory

1. Perform a successful GitHub issue create or Notion page create.
2. Open `/actions`.
3. Filter by `Integration action`.
4. Trigger an integration failure with a reusable lesson, such as an invalid
   repo name.
5. Open `/memory` Procedures/Failures view if failure memory UI is enabled.

Verify:

- [ ] `/actions` shows timestamp, outcome, target, connector metadata, and
  reversible status.
- [ ] `actions.log` has JSON Lines for successful writes only.
- [ ] Failure memory records a reusable lesson without raw payloads or secrets.
- [ ] No provider response bodies with sensitive content are stored.

## Section J: Regression

Run these after integration checks:

1. Phase 1 canonical E2E task: `pnpm smoke:e2e-canonical`
2. Phase 3 browser tools: `pnpm smoke:browser-tools`
3. Phase 4 local backend basic: `pnpm smoke:local-backend-basic`
4. Phase 5 memory recall: `pnpm smoke:memory-recall`
5. Phase 6 smokes:
   - `pnpm smoke:integrations-nango-connect`
   - `pnpm smoke:integrations-tier1-read`
   - `pnpm smoke:integrations-tier1-write-approval`
   - `pnpm smoke:integrations-tier2`
   - `pnpm smoke:integrations-tier3`
   - `pnpm smoke:integrations-memory-toggle`

Verify:

- [ ] Existing non-integration agent runs still work.
- [ ] Integration tools do not change local execution safety.
- [ ] Memory and action log pages still render.
- [ ] Any skipped connector is documented with exact missing credential or
  provider limitation.

## Failure Handling

If any section fails:

1. Preserve logs and screenshots.
2. Add findings to `docs/phase-6/AUDIT_FINDINGS.md`.
3. Mark severity:
   - `P0`: blocks ship
   - `P1`: must fix before signoff
   - `P2`: polish or Phase 11 follow-up
4. Send Codex the exact reproduction steps, observed behavior, expected
   behavior, and relevant log snippets.

Do not write SIGNOFF until all required sections pass or are explicitly
deferred by the user.
