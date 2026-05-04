# Phase 6 Spec: Integrations Layer

## Status

Stage 0 specification draft. No implementation is included in this commit.

Phase 6 adds first-class integrations so Handle agents can read from and act on
the user's third-party services. OAuth and token refresh go through Nango. The
phase is development-environment only; production OAuth app rollout and Tauri
distribution polish are deferred to Phase 11.

Phase 6 is split into two ship gates to reduce audit-cycle risk:

- Phase 6.0 ships as `v0.6.0`: Nango infrastructure, Settings UI scaffold,
  Tier 1 read tools, and Tier 1 write tools with approval gates.
- Phase 6.1 ships as `v0.6.1`: Tier 2 connectors, Tier 3 connectors, memory/UI
  hardening, final audit harness expansion, and SIGNOFF.

## Goals

- Ship 13 connectors in priority order:
  - Tier 1: Gmail, Slack, Notion, Google Drive, GitHub
  - Tier 2: Google Calendar, Cloudflare, Vercel, Linear
  - Tier 3: Google Sheets, Google Docs, Zapier, Obsidian
- Use a hybrid tool surface: explicit tools for common safe operations plus a
  per-connector `*.execute` fallback for natural-language actions.
- Support multi-account connections per connector with add, remove, switch, and
  default-account controls.
- Preserve Phase 4's project permission model for integration writes.
- Preserve Phase 5's privacy posture by making integration memory opt-in per
  connector. Default is `NONE`.
- Provide typed integration errors with user actions such as reconnect, retry,
  choose account, or request approval.
- Log successful real-world outcomes to the Phase 5 action log and write
  meaningful failure context to failure memory.

## Non-Goals

- Production OAuth app publishing, verification, consent-screen polish, and
  Tauri-native credential UI. These are Phase 11.
- Building custom OAuth flows. Nango owns OAuth, refresh, token storage, and
  connection metadata.
- Replacing connector-specific APIs with a custom unified integration layer.
  Nango provides auth and access; Handle owns tool behavior and safety gates.
- Bulk background sync/RAG over third-party services. Phase 6 tools are live API
  calls unless a connector explicitly needs lightweight metadata caching.
- Connector-specific automations or unattended schedules. Phase 9 schedules will
  reuse this integration layer.
- Editing `.env` as an integration setup path. Phase 6 uses Settings-first
  credential setup so non-coders can configure integrations without touching
  files.

## References Checked

- Nango Node SDK docs:
  `https://docs.nango.dev/reference/sdks/node`.
- Nango Connect sessions docs:
  `https://docs.nango.dev/reference/sdks/node#create-connect-session`.
- Nango integrations catalog:
  `https://docs.nango.dev/integrations/all`.
- Current catalog lists Gmail, Slack, Notion, Google Drive, GitHub, Google
  Calendar, Cloudflare, Vercel, Linear, Google Sheets/Google Docs via Google
  Workspace entries, and Zapier. Obsidian is not clearly listed as a
  first-party Nango OAuth connector; Phase 6.1 implements it as a local-vault
  filesystem connector mediated by Phase 4 SafetyGovernor.

## Ground Truth Decisions

- Nango is the integration auth layer.
- Phase 6 uses the BYOK pattern: the user supplies their own OAuth app
  credentials or provider API tokens for each service in development.
- All credentials are entered through Settings UI. The user never edits `.env`
  to configure Phase 6.
- Nango secret key is stored through the existing protected credential pattern
  and loaded from Settings data on each Nango call. No server restart is
  required when the user saves or rotates the key.
- Provider OAuth client IDs/secrets or provider API-token setup instructions are
  configured per connector in Settings -> Integrations. OAuth client secrets use
  the same protected credential path as AI provider keys. API tokens for
  token-based providers are entered in Nango Connect and stored by Nango, not
  Handle.
- Nango stores third-party access and refresh tokens. Handle stores only
  connection metadata, aliases, status, selected scopes, and memory preferences.
- Phase 6 is dev-only.
- Reads do not require approval.
- Writes and destructive actions obey Phase 4 permission mode:
  - `PLAN`: read-only by default. Any write/action requires approval.
  - `ASK`: low-risk reads run, writes require approval unless explicitly
    allowed by the session/project policy.
  - `FULL_ACCESS`: writes may run without modal approval, but connector-level
    forbidden patterns still deny.
- Connector-level forbidden patterns always apply regardless of permission mode.
- Integration memory defaults to `NONE`.
- Multi-account is in scope for Phase 6.
- OAuth app naming convention is locked: `Handle Dev - <Connector>`, for
  example `Handle Dev - Gmail`.
- Account aliases are global per connector, not per project. Project default
  account preferences may layer on top later.
- Settings -> Integrations is the canonical UI route. Do not add a top-level
  Integrations sidebar route in Phase 6.
- Zapier scope for Phase 6.1 is trigger Zaps, read history, and create Zaps via
  Zapier MCP-style capabilities.
- Obsidian scope for Phase 6.1 is a single configured local vault. Multi-vault
  support is deferred to Phase 11.

## Architecture

### Nango Service

Stage 1 adds `apps/api/src/integrations/nango/`:

- `nangoClient.ts`: lazy initializes `@nangohq/node` with
  Nango credentials read from Settings-backed protected storage.
- `nangoService.ts`: canonical wrapper used by routes and tools.
- `errors.ts`: maps Nango and provider API failures into typed Handle errors.
- `connectors.ts`: metadata registry for all 13 connectors.
- `connectionHealth.ts`: lightweight health checks and state transitions.

Nango config is hot-reloaded. `nangoService.ts` reads current settings on each
call and constructs a short-lived client or uses an invalidation-aware client
cache keyed by the protected credential version. A saved Nango key or OAuth app
credential change must not require a backend restart.

The wrapper exposes:

```typescript
type IntegrationConnectionTokenRequest = {
  connectorId: IntegrationConnectorId;
  accountId: string;
};

type NangoService = {
  createConnectSession(input: ConnectSessionInput): Promise<ConnectSession>;
  createReconnectSession(input: ReconnectSessionInput): Promise<ConnectSession>;
  listConnections(userId: string): Promise<IntegrationConnectionSummary[]>;
  getConnection(input: IntegrationConnectionTokenRequest): Promise<NangoConnection>;
  deleteConnection(input: DeleteConnectionInput): Promise<void>;
  proxy<T>(input: NangoProxyRequest): Promise<T>;
  testConnection(input: IntegrationConnectionTokenRequest): Promise<IntegrationHealthResult>;
};
```

Use Nango connection tags for Handle attribution:

```typescript
{
  handle_user_id: "<clerk-or-local-user-id>",
  handle_project_id: "<project-id-when-created-if-applicable>",
  handle_connector_id: "gmail",
  handle_account_alias: "personal"
}
```

### BYOK OAuth and API-Token Credentials

The Settings UI allows the user to enter OAuth app credentials per OAuth
connector in development. Nango Connect supports user-provided OAuth credential
overrides during the connect session; Phase 6 should use that path when
available.

Some connector APIs are token-based rather than OAuth-app based for Handle's
tool surface:

- Cloudflare uses scoped API tokens from Cloudflare My Profile -> API Tokens.
- Vercel uses Vercel access tokens from Account Settings -> Tokens.

For token-based connectors, Settings shows token setup instructions and starts
Nango Connect. The provider token is pasted into Nango Connect and stored by
Nango. Handle does not collect, persist, or log those tokens.

Handle must never log OAuth client secrets. Connector client IDs may be stored
plainly because they are public OAuth identifiers, but connector client secrets
and the Nango secret key use the same Keychain-backed protected credential
pattern as AI provider keys. Database rows store credential references and setup
state, not plaintext secrets.

Settings -> Integrations provides:

- "Setup Nango" dialog with deep link to `https://app.nango.dev`, key paste
  field, save button, and test button.
- per-connector setup dialog with provider-specific deep links:
  - Google Cloud Console for Gmail, Drive, Calendar, Sheets, and Docs
  - Slack API site
  - Notion integrations page
  - GitHub developer settings
  - Cloudflare API token settings
  - Vercel account token settings
  - Linear OAuth app settings
  - Zapier developer platform
- connector-specific checklist showing:
  - app or token name: `Handle Dev - <Connector>`
  - required scopes
  - redirect URI for OAuth connectors only
  - client ID field
  - client secret field
  - save and test buttons

Setup state is visible on the dashboard:

- `Nango not configured`
- `Nango configured, no OAuth apps registered`
- `Ready to connect`
- per-connector `Missing credentials`, `Ready`, `Connected`, `Reconnect`,
  `Rate limited`, or `Error`

### Database Schema

Stage 1 migration adds integration metadata, not provider tokens:

```prisma
enum IntegrationConnectorId {
  GMAIL
  SLACK
  NOTION
  GOOGLE_DRIVE
  GITHUB
  GOOGLE_CALENDAR
  CLOUDFLARE
  VERCEL
  LINEAR
  GOOGLE_SHEETS
  GOOGLE_DOCS
  ZAPIER
  OBSIDIAN
}

enum IntegrationConnectionStatus {
  DISCONNECTED
  CONNECTING
  CONNECTED
  EXPIRED
  REVOKED
  RATE_LIMITED
  ERROR
}

model Integration {
  id                String                      @id @default(cuid())
  userId            String
  connectorId       IntegrationConnectorId
  nangoIntegrationId String?
  nangoConnectionId String?
  accountAlias      String
  accountLabel      String?
  status            IntegrationConnectionStatus @default(DISCONNECTED)
  scopes            Json                        @default("[]")
  defaultAccount    Boolean                     @default(false)
  memoryScope       MemoryScope                 @default(NONE)
  lastUsedAt        DateTime?
  lastHealthCheckAt DateTime?
  lastErrorCode     String?
  lastErrorMessage  String?
  createdAt         DateTime                    @default(now())
  updatedAt         DateTime                    @updatedAt

  @@index([userId, connectorId])
  @@index([userId, status])
  @@unique([userId, connectorId, accountAlias])
}

model NangoSettings {
  id              String    @id @default("global")
  secretKeyRef    String?
  host            String    @default("https://api.nango.dev")
  configured      Boolean   @default(false)
  lastValidatedAt DateTime?
  lastErrorCode   String?
  lastErrorMessage String?
  updatedAt       DateTime  @default(now()) @updatedAt
}

model IntegrationConnectorSettings {
  id                  String                 @id @default(cuid())
  connectorId          IntegrationConnectorId @unique
  nangoProviderId      String?
  oauthClientId        String?
  oauthClientSecretRef String?
  requiredScopes       Json                   @default("[]")
  redirectUri          String?
  setupStatus          String                 @default("missing_credentials")
  lastValidatedAt      DateTime?
  lastErrorCode        String?
  lastErrorMessage     String?
  updatedAt            DateTime               @default(now()) @updatedAt
}
```

If Clerk's local user model evolves before Stage 1 lands, use the canonical
Handle user ID already used by provider settings and projects.

`secretKeyRef` and `oauthClientSecretRef` point to protected credential records
or Keychain entries. Plaintext secret values are never stored in Prisma and are
never returned from API routes.

### Multi-Account Model

Each connector may have multiple `Integration` rows for the same user. The
agent chooses an account by this order:

1. Explicit account alias in the tool input.
2. Project default account for that connector, if added later.
3. User default account for that connector.
4. If exactly one connected account exists, use it.
5. Otherwise return a typed `account_selection_required` error with available
   aliases.

`defaultAccount` is unique in application logic per `(userId, connectorId)`.
The Settings UI must make the active default obvious and allow switching.

### Tool Registration

At agent-run start, `runAgent.ts` loads current project state and connected
integration accounts. Integration tools are created per connector, not per
account. Each tool accepts an optional `accountAlias`; account resolution happens
inside the tool wrapper.

Tool names use dot notation for readability:

- `gmail.search`
- `gmail.send`
- `github.create_issue`
- `github.execute`

The registry should expose only tools for connectors with at least one usable
connection, plus "not connected" guidance in the system prompt for configured
but disconnected connectors.

### Permission and Approval Model

Integration tools classify actions:

```typescript
type IntegrationToolRisk = "read" | "write" | "destructive" | "forbidden";
```

- `read`: runs without approval.
- `write`: approval required in `ASK` and `PLAN`; may run in `FULL_ACCESS`.
- `destructive`: approval required in all modes; connector forbidden patterns
  still deny.
- `forbidden`: deny without approval.

Approval request payload:

```typescript
{
  type: "integration_action",
  connectorId: "gmail",
  accountAlias: "personal",
  action: "gmail.send",
  target: "to: nick@example.com",
  risk: "write",
  reason: "Send email to nick@example.com with subject \"...\"",
  agentReason?: "The user asked me to send this summary to Nick after reviewing the draft.",
  approvalId: "..."
}
```

Approval modal copy must include the connector, account, action, and target.
When `agentReason` is present, the modal displays it so the user sees the
agent's stated reasoning before approving sensitive actions such as
`gmail.send`, Cloudflare DNS changes, Vercel rollbacks, and similar writes.
Phase 6.0 does not require `agentReason` for every approval event; the modal must
render correctly when it is absent. Phase 6.0 Stage 3 should populate it for Tier
1 write actions.

### Audit, Action Log, and Failure Memory

Every integration tool call writes diagnostic logs with secrets redacted:

- timestamp
- taskId, conversationId, projectId
- connectorId, accountAlias, toolName
- risk classification
- approval decision when applicable
- provider/Nango status code
- durationMs
- redacted error body when applicable

Successful real-world outcomes append to `~/Library/Logs/Handle/actions.log`.
Phase 6 extends `ActionOutcomeType` with:

- `integration_read`
- `integration_action`
- `email_sent`
- `slack_message_sent`
- `notion_page_created`
- `github_issue_created`
- `calendar_event_created`
- `deployment_created`
- `sheet_updated`
- `document_updated`
- `zap_triggered`
- `obsidian_note_modified`

Failed integration calls produce typed errors and write failure memory summaries
when the error teaches a reusable lesson. Do not write raw email bodies,
documents, Slack content, API responses, tokens, or secrets to failure memory.

### Memory Integration

Per connector memory toggle:

```typescript
type IntegrationMemoryScope = "NONE" | "PROJECT_ONLY" | "GLOBAL_AND_PROJECT";
```

Default is `NONE`.

When enabled, only conservative extraction allowlists can write to memory.
Connector tools must return explicit `memoryCandidates`, never raw API payloads.
Examples:

- Gmail: sender/domain-level metadata, user-authored preference explicitly
  stated in the user's instruction. Never store email bodies.
- Slack: channel names or team aliases the user explicitly asks to remember.
  Never store private messages or message bodies.
- Notion/Drive/Docs/Sheets: document titles and project relationship metadata
  only when explicitly useful. Never store document body content by default.
- GitHub/Linear: repo/project names, issue IDs, and workflow preferences. Never
  store secrets from issue text or code.
- Cloudflare/Vercel: project, zone, and deployment identifiers only. Never store
  environment variables.
- Calendar: availability preferences or event metadata only when user asks.
  Never store attendee details by default.
- Zapier: Zap names and user-approved automation preferences only.
- Obsidian: vault/note titles and user-approved knowledge, never raw note bodies
  unless the user explicitly asks to save a fact.

If memory is offline, integration tools still run. The UI shows the existing
memory-offline banner and logs the skipped memory operation.

Per-message memory override from the composer applies to integrations too. When
the user turns memory off for a message, integration `memoryCandidates` are
dropped for that message. This follows the Phase 5 memory override exactly: no
integration recall/save side effect should occur for a memory-disabled turn.

### Error UX

Typed errors:

```typescript
type IntegrationErrorCode =
  | "not_connected"
  | "account_selection_required"
  | "auth_expired"
  | "auth_revoked"
  | "rate_limited"
  | "provider_forbidden"
  | "provider_not_found"
  | "approval_required"
  | "approval_denied"
  | "forbidden_pattern"
  | "validation_error"
  | "network_error"
  | "unknown_provider_error";
```

Each error surfaces:

- human-readable message
- connector and account
- recommended action
- action buttons where applicable: Connect, Reconnect, Pick account, Retry,
  Open settings, Request approval
- log path for deeper diagnostics

The agent should receive a concise tool error it can explain without hiding the
actionable UI affordance.

## Connection State Machine

States:

- `DISCONNECTED`: no usable connection exists.
- `CONNECTING`: user has started a Nango connect session.
- `CONNECTED`: connection exists and health check succeeds.
- `EXPIRED`: token refresh failed or credentials need renewal.
- `REVOKED`: provider or user revoked access.
- `RATE_LIMITED`: provider or Nango returned a rate limit with retry guidance.
- `ERROR`: non-auth, non-rate-limit error requiring diagnostics.

Transitions:

- `DISCONNECTED -> CONNECTING`: user clicks Connect/Add account.
- `CONNECTING -> CONNECTED`: Nango callback or connection poll confirms success.
- `CONNECTING -> DISCONNECTED`: user cancels, popup closes, or session expires.
- `CONNECTED -> EXPIRED`: token refresh fails.
- `CONNECTED -> REVOKED`: provider reports revoked app/connection.
- `CONNECTED -> RATE_LIMITED`: provider or Nango returns 429.
- `RATE_LIMITED -> CONNECTED`: retry-after window passes and health check works.
- `EXPIRED -> CONNECTING`: user starts reconnect flow.
- `REVOKED -> CONNECTING`: user reconnects.
- `ERROR -> CONNECTED`: health check recovers.
- Any state -> `DISCONNECTED`: user removes account.

State transitions are logged with redacted metadata.

## Connector Tool Surface

Every connector has:

- explicit tools for top operations
- `<connector>.execute` fallback for supported natural-language requests
- accountAlias optional input
- typed errors
- connector-specific forbidden patterns

### Tier 1: Gmail

Read tools:

- `gmail.search({ query, maxResults?, accountAlias? })`
- `gmail.get_thread({ threadId, accountAlias? })`
- `gmail.get_message({ messageId, accountAlias? })`
- `gmail.list_labels({ accountAlias? })`

Write tools:

- `gmail.create_draft({ to, cc?, bcc?, subject, body, accountAlias? })`
- `gmail.send({ to, cc?, bcc?, subject, body, accountAlias? })`
- `gmail.modify_labels({ messageId, addLabelIds?, removeLabelIds?, accountAlias? })`
- `gmail.execute({ instruction, accountAlias? })`

Forbidden patterns:

- sending to all contacts, entire domain aliases, or unbounded recipient lists
- forwarding secrets or credential-looking content
- deleting or permanently trashing messages in Phase 6

Memory allowlist:

- user-approved contact aliases and workflow preferences only
- no email bodies or attachments

### Tier 1: Slack

Read tools:

- `slack.search({ query, maxResults?, accountAlias? })`
- `slack.get_thread({ channelId, threadTs, accountAlias? })`
- `slack.list_channels({ includePrivate?, accountAlias? })`
- `slack.get_channel_info({ channelId, accountAlias? })`

Write tools:

- `slack.send_message({ channelId, text, threadTs?, accountAlias? })`
- `slack.update_message({ channelId, ts, text, accountAlias? })`
- `slack.add_reaction({ channelId, ts, reaction, accountAlias? })`
- `slack.execute({ instruction, accountAlias? })`

Forbidden patterns:

- mass messaging all channels or users
- posting secrets or credentials
- deleting Slack history in Phase 6

Memory allowlist:

- channel aliases and user-approved workflow preferences
- no message bodies by default

### Tier 1: Notion

Read tools:

- `notion.search({ query, filter?, maxResults?, accountAlias? })`
- `notion.get_page({ pageId, accountAlias? })`
- `notion.query_database({ databaseId, filter?, sorts?, accountAlias? })`

Write tools:

- `notion.create_page({ parentId, title, properties?, children?, accountAlias? })`
- `notion.update_page({ pageId, title?, properties?, archived?, accountAlias? })`
- `notion.append_blocks({ blockId, children, accountAlias? })`
- `notion.execute({ instruction, accountAlias? })`

Forbidden patterns:

- archiving/deleting entire workspaces or broad databases
- writing credential-looking content

Memory allowlist:

- page/database titles and project relationships
- no page body content unless explicitly saved as a memory fact by the user

### Tier 1: Google Drive

Read tools:

- `drive.search({ query, mimeType?, maxResults?, accountAlias? })`
- `drive.get_metadata({ fileId, accountAlias? })`
- `drive.export_text({ fileId, mimeType?, accountAlias? })`
- `drive.download_file({ fileId, destinationPath?, accountAlias? })`

Write tools:

- `drive.upload_file({ name, sourcePath, parentFolderId?, mimeType?, accountAlias? })`
- `drive.create_folder({ name, parentFolderId?, accountAlias? })`
- `drive.share({ fileId, email, role, accountAlias? })`
- `drive.execute({ instruction, accountAlias? })`

Forbidden patterns:

- sharing with public/anyone without explicit approval and warning
- deleting Drive files in Phase 6
- uploading secrets

Memory allowlist:

- file titles and folder/project relationships only

### Tier 1: GitHub

Read tools:

- `github.list_repos({ owner?, maxResults?, accountAlias? })`
- `github.list_issues({ owner, repo, state?, labels?, accountAlias? })`
- `github.get_issue({ owner, repo, issueNumber, accountAlias? })`
- `github.search_code({ query, maxResults?, accountAlias? })`
- `github.list_pull_requests({ owner, repo, state?, accountAlias? })`

Write tools:

- `github.create_issue({ owner, repo, title, body?, labels?, accountAlias? })`
- `github.comment_issue({ owner, repo, issueNumber, body, accountAlias? })`
- `github.update_issue({ owner, repo, issueNumber, state?, labels?, accountAlias? })`
- `github.create_pull_request({ owner, repo, title, head, base, body?, accountAlias? })`
- `github.execute({ instruction, accountAlias? })`

Forbidden patterns:

- force-push, branch deletion, repository deletion, secret modification
- modifying protected branches directly

Memory allowlist:

- repo aliases, issue/project preferences, and user-approved workflow patterns

### Tier 2: Google Calendar

Read tools:

- `calendar.list_calendars({ accountAlias? })`
- `calendar.list_events({ calendarId?, timeMin?, timeMax?, query?, accountAlias? })`
- `calendar.get_event({ calendarId, eventId, accountAlias? })`

Write tools:

- `calendar.create_event({ calendarId?, title, start, end, attendees?, location?, description?, accountAlias? })`
- `calendar.update_event({ calendarId, eventId, patch, accountAlias? })`
- `calendar.delete_event({ calendarId, eventId, accountAlias? })`
- `calendar.execute({ instruction, accountAlias? })`

Forbidden patterns:

- deleting all events or broad recurring events without explicit target
- inviting unbounded attendee lists

Memory allowlist:

- scheduling preferences explicitly stated by user
- no attendee lists by default

### Tier 2: Cloudflare

Auth setup: Cloudflare is token-based in Phase 6.1. The user creates a scoped
API token named `Handle Dev - Cloudflare` and enters it in Nango Connect.
Settings must not ask for an OAuth client ID, client secret, or callback URL for
Cloudflare.

Read tools:

- `cloudflare.list_accounts({ accountAlias? })`
- `cloudflare.list_zones({ accountAlias? })`
- `cloudflare.list_dns_records({ zoneId, accountAlias? })`
- `cloudflare.get_pages_project({ accountId, projectName, accountAlias? })`

Write tools:

- `cloudflare.update_dns_record({ zoneId, recordId, patch, accountAlias? })`
- `cloudflare.create_dns_record({ zoneId, record, accountAlias? })`
- `cloudflare.purge_cache({ zoneId, files?, purgeEverything?, accountAlias? })`
- `cloudflare.deploy_pages({ accountId, projectName, source?, accountAlias? })`
- `cloudflare.execute({ instruction, accountAlias? })`

Forbidden patterns:

- deleting zones, changing nameservers, disabling security controls
- editing DNS for apex/root records without heightened approval
- reading or writing environment secrets

Memory allowlist:

- zone/project aliases only

### Tier 2: Vercel

Auth setup: Vercel is token-based in Phase 6.1. The user creates a Vercel access
token named `Handle Dev - Vercel` and enters it in Nango Connect. Settings must
not ask for an OAuth client ID, client secret, or callback URL for Vercel.

Read tools:

- `vercel.list_projects({ teamId?, accountAlias? })`
- `vercel.list_deployments({ projectId?, teamId?, accountAlias? })`
- `vercel.get_deployment_logs({ deploymentId, accountAlias? })`
- `vercel.get_project({ projectIdOrName, teamId?, accountAlias? })`

Write tools:

- `vercel.create_deployment({ projectIdOrName, ref?, teamId?, accountAlias? })`
- `vercel.cancel_deployment({ deploymentId, accountAlias? })`
- `vercel.rollback_deployment({ projectIdOrName, deploymentId, accountAlias? })`
- `vercel.execute({ instruction, accountAlias? })`

Forbidden patterns:

- deleting projects, domains, teams, or environment variables
- exposing env vars in logs or memory

Memory allowlist:

- project aliases and deployment workflow preferences only

### Tier 2: Linear

Read tools:

- `linear.search_issues({ query, teamId?, maxResults?, accountAlias? })`
- `linear.get_issue({ issueIdOrKey, accountAlias? })`
- `linear.list_teams({ accountAlias? })`
- `linear.list_projects({ teamId?, accountAlias? })`

Write tools:

- `linear.create_issue({ teamId, title, description?, projectId?, assigneeId?, accountAlias? })`
- `linear.update_issue({ issueId, patch, accountAlias? })`
- `linear.comment_issue({ issueId, body, accountAlias? })`
- `linear.execute({ instruction, accountAlias? })`

Forbidden patterns:

- bulk closing/deleting issues
- modifying workspace settings

Memory allowlist:

- team/project aliases and issue workflow preferences

### Tier 3: Google Sheets

Read tools:

- `sheets.get_values({ spreadsheetId, range, accountAlias? })`
- `sheets.get_metadata({ spreadsheetId, accountAlias? })`
- `sheets.search_drive_sheets({ query, maxResults?, accountAlias? })`

Write tools:

- `sheets.update_values({ spreadsheetId, range, values, accountAlias? })`
- `sheets.append_values({ spreadsheetId, range, values, accountAlias? })`
- `sheets.create_spreadsheet({ title, sheets?, accountAlias? })`
- `sheets.execute({ instruction, accountAlias? })`

Forbidden patterns:

- clearing entire spreadsheets or ranges larger than an explicit user target
- writing secrets

Memory allowlist:

- sheet titles and user-approved data workflow preferences only

### Tier 3: Google Docs

Read tools:

- `docs.get_document({ documentId, accountAlias? })`
- `docs.export_text({ documentId, accountAlias? })`
- `docs.search_drive_docs({ query, maxResults?, accountAlias? })`

Write tools:

- `docs.create_document({ title, initialText?, accountAlias? })`
- `docs.insert_text({ documentId, index, text, accountAlias? })`
- `docs.batch_update({ documentId, requests, accountAlias? })`
- `docs.execute({ instruction, accountAlias? })`

Forbidden patterns:

- overwriting entire documents without explicit confirmation
- sharing publicly without explicit warning
- writing secrets

Memory allowlist:

- document titles and project relationships only

### Tier 3: Zapier

Read tools:

- `zapier.list_zaps({ accountAlias? })`
- `zapier.get_zap({ zapId, accountAlias? })`
- `zapier.get_task_history({ zapId?, maxResults?, accountAlias? })`

Write tools:

- `zapier.trigger_zap({ zapId, payload, accountAlias? })`
- `zapier.enable_zap({ zapId, accountAlias? })`
- `zapier.disable_zap({ zapId, accountAlias? })`
- `zapier.execute({ instruction, accountAlias? })`

Forbidden patterns:

- triggering every Zap or broad automation fan-out
- creating automations that send external messages without approval

Memory allowlist:

- Zap names and automation preferences only

Phase 6.1 scope is trigger existing Zaps, read Zap/task history, and create
Zaps. The current Nango provider ID is `zapier-nla`; audit must verify whether
that provider covers all three surfaces. If Zap creation or task history is not
covered by the provider, file a Phase 6.1 finding and either split Zapier into a
workflow API setup or defer the unsupported operation explicitly.

### Tier 3: Obsidian

Read tools:

- `obsidian.search({ query, vaultAlias?, maxResults? })`
- `obsidian.read_note({ path, vaultAlias? })`
- `obsidian.list_notes({ folder?, vaultAlias? })`

Write tools:

- `obsidian.create_note({ path, content, vaultAlias? })`
- `obsidian.update_note({ path, content, mode, vaultAlias? })`
- `obsidian.append_note({ path, content, vaultAlias? })`
- `obsidian.execute({ instruction, vaultAlias? })`

Forbidden patterns:

- modifying `.obsidian/` configuration without explicit approval
- deleting notes or vault folders in Phase 6
- writing secrets

Memory allowlist:

- vault aliases, note titles, and user-approved facts only

Architecture note: Obsidian is not treated as a Nango OAuth connector in Phase
6.1. It is a local-vault filesystem connector mediated by Phase 4
SafetyGovernor, project permission mode, and the same integration Settings UI.
Phase 6.1 supports one vault path. Multi-vault support is deferred to Phase 11.
The vault path is stored as Integration metadata, and Obsidian tools must deny
any path traversal or symlink escape outside the configured vault.

## Settings -> Integrations UI

Route: Settings -> Integrations tab only. Do not add a top-level `/integrations`
sidebar link in Phase 6.

Layout follows Screen 10:

- Header: "Integrations" with connection count and "Add integration".
- Nango setup banner:
  - `Nango not configured`
  - `Nango configured, no OAuth apps registered`
  - `Ready to connect`
  - action button opens "Setup Nango"
- Connected section:
  - card grid using the design-system IntegrationCard pattern
  - connector avatar, connector name, account alias/label
  - state pill: Connected, Connecting, Reconnect, Revoked, Rate limited, Error
  - memory pill: Off, Project, Global + Project
  - default account indicator
  - overflow menu: Rename alias, Make default, Reconnect, Test connection,
    Memory settings, Disconnect
- Available section:
  - connectors grouped by tier
  - Connect button
  - BYOK setup status
- Multi-account drawer:
  - list accounts for selected connector
  - add account
  - switch default
  - remove account
- Connector detail drawer:
  - scopes requested
  - OAuth app credential checklist
  - connection status and last health check
  - memory toggle
  - forbidden-pattern summary

### BYOK Flow UI

For each connector:

1. User selects connector.
2. UI shows dev OAuth app setup checklist, provider deep link, `Handle Dev -
   <Connector>` app name, and required redirect URI.
3. User enters OAuth client ID/secret in Settings.
4. Backend creates Nango connect session.
5. UI opens Nango Connect.
6. On success, UI asks for account alias if one was not returned.
7. Integration row is saved and health checked.

Secrets are never displayed after save. Test connection errors must not echo
credential values.

## Backend API Surface

Stage 1 endpoints:

- `GET /api/integrations`
- `GET /api/integrations/connectors`
- `GET /api/settings/integrations`
- `POST /api/settings/integrations/nango`
- `POST /api/settings/integrations/:connectorId/oauth-app`
- `POST /api/integrations/:connectorId/connect-session`
- `POST /api/integrations/:connectorId/reconnect-session`
- `POST /api/integrations/:connectorId/complete`
- `POST /api/integrations/:integrationId/test`
- `PUT /api/integrations/:integrationId`
- `DELETE /api/integrations/:integrationId`

Stage 2+ tool execution stays inside the agent tool layer, not generic public
API endpoints, unless UI-only test buttons need a safe read-only route.

## Implementation Stages

### Stage 0: Specification

- Add this canonical spec.
- No implementation.
- Handoff for review before Stage 1.

### Stage 0.5: Structural Amendments

- Apply the Phase 6.0/6.1 split.
- Lock Settings-first credential setup.
- Record the resolved Stage 0 review decisions.
- No implementation.
- Handoff for review before Stage 1.

### Phase 6.0: `v0.6.0`

Phase 6.0 ships from branch `phase-6/integrations` and includes Stages 1, 2,
and 3. Manual audit must cover Sections A, B, C, D, G, H, I, and J at minimum.
After audit and SIGNOFF, merge to main and tag `v0.6.0`.

### Stage 1: Nango Infrastructure and Settings Scaffold

- Install `@nangohq/node`.
- Add Nango service wrapper, typed errors, and connector registry.
- Add Integration Prisma model and migration.
- Add NangoSettings and IntegrationConnectorSettings storage with protected
  credential references.
- Add Settings -> Integrations scaffold with "Setup Nango" and per-connector
  OAuth app setup.
- Add start/complete/reconnect/test/disconnect API routes.
- Verify and document Nango provider IDs for all 13 connectors before Stage 2
  hardcodes IDs.
- Smoke: one dummy or low-risk connector OAuth flow end-to-end, preferably
  GitHub through Settings UI if credentials are available. No `.env` editing.
- Handoff before connector tools.

### Stage 2: Tier 1 Read Tools

- Gmail, Slack, Notion, Drive, GitHub read tools.
- Account selection and typed errors.
- No write tools yet except `execute` returning "write not enabled" for writes.

### Stage 3: Tier 1 Write Tools and Approval Gates

- Add write tools for Tier 1.
- Add connector forbidden patterns.
- Review forbidden patterns for Tier 1 before Stage 3 smokes lock them in.
- Add action log and failure memory integration.

### Phase 6.1: `v0.6.1`

Phase 6.1 opens a new branch `phase-6.1/integrations-tier-2-3` from updated
main after Phase 6.0 ships. It includes Stages 4, 5, 6, and 7. Manual audit
must cover all sections, including E and F, and repeat the Phase 6.0 regression
sections. After audit and SIGNOFF, merge to main and tag `v0.6.1`.

### Stage 4: Tier 2 Connectors

- Calendar, Cloudflare, Vercel, Linear.
- Read/write tools, approvals, typed errors.
- Review forbidden patterns for Tier 2 before Stage 4 smokes lock them in.

### Stage 5: Tier 3 Connectors

- Sheets, Docs, Zapier, Obsidian.
- Zapier includes trigger, history, and create-Zap scope.
- Obsidian is a single-vault local filesystem connector.
- Review forbidden patterns for Tier 3 before Stage 5 smokes lock them in.

### Stage 6: Memory and UI Hardening

- Per-connector memory toggles.
- Memory candidate allowlists.
- Integration inspector traces in workspace.
- Full Settings UI polish and Playwright tests.

### Stage 7: Manual Audit Harness and SIGNOFF

- Add `scripts/manual-audit/phase6-integrations.md`.
- Stop for user audit.
- SIGNOFF only after user confirms all sections pass.

## Smoke Tests

Planned smoke commands:

- `pnpm smoke:integrations-settings-nango-config`
- `pnpm smoke:integrations-nango-connect`
- `pnpm smoke:integrations-settings-ui`
- `pnpm smoke:integrations-multi-account`
- `pnpm smoke:integrations-tier1-read`
- `pnpm smoke:integrations-tier1-write-approval`
- `pnpm smoke:integrations-forbidden-patterns`
- `pnpm smoke:integrations-memory-toggle`
- `pnpm smoke:integrations-error-ux`
- `pnpm smoke:integrations-action-log`
- `pnpm smoke:integrations-regression`

Existing Phase 1-5 regression smokes must still pass before final Phase 6
handoff.

Phase 6.0 handoff requires the Stage 1 GitHub OAuth flow smoke through Settings
UI, plus Tier 1 read/write smokes once Stages 2 and 3 land. Phase 6.1 adds Tier
2 and Tier 3 smokes.

## Manual Audit Harness

Create `scripts/manual-audit/phase6-integrations.md` with these sections.

### Section A: Nango and BYOK Setup

- Verify branch and CI status.
- Verify Settings -> Integrations shows `Nango not configured` before setup.
- Paste Nango secret key through the Setup Nango dialog.
- Verify no `.env` editing is required.
- Verify Nango status changes to configured after save.
- For each Tier 1 connector, verify OAuth app credentials are entered or Nango
  Connect asks for BYOK credentials through Settings UI.
- Verify redirect URI matches Nango configuration.

### Section B: Settings -> Integrations UI

- Open Settings -> Integrations.
- Verify 13 connectors listed in tier order.
- Connect at least two accounts for one connector.
- Rename aliases.
- Switch default account.
- Disconnect and reconnect.
- Verify state pills and health checks.

### Section C: Tier 1 Read Tools

- Gmail search/read thread.
- Slack search/read thread.
- Notion search/read page.
- Drive search/export metadata or text.
- GitHub list/read issues.
- Verify no approval prompts for reads.

### Section D: Tier 1 Write Tools and Approvals

- Gmail draft/send to a controlled test address.
- Slack send message to a test channel.
- Notion create/update test page.
- Drive create/upload test file.
- GitHub create/comment test issue.
- Verify approval modal appears under `ASK` and `PLAN`.
- Verify action log entries after success.

### Section E: Tier 2 Connectors

- Calendar list/create/update/delete controlled event.
- Cloudflare list zones and perform a safe test action if a test zone exists.
- Vercel list projects/deployments and run a safe deployment/log action.
- Linear create/update/comment test issue.

### Section F: Tier 3 Connectors

- Sheets read/update controlled spreadsheet.
- Docs read/update controlled document.
- Zapier list/trigger controlled Zap, depending on resolved scope.
- Obsidian read/write controlled vault path, depending on resolved architecture.

### Section G: Memory Privacy

- Verify connector memory default is `NONE`.
- Enable Project memory for one connector and verify only allowlisted metadata is
  written.
- Verify email/slack/doc bodies are not stored.
- Verify secrets are redacted and skipped.

### Section H: Error UX and Recovery

- Expired/revoked credential path shows Reconnect action.
- Rate limit path shows retry guidance and retry-after if present.
- Account selection error shows available accounts.
- Provider 404/permission errors are clear and logged.

### Section I: Action Log and Failure Memory

- Successful write tools create action log entries.
- Failed integration calls create failure memory when the lesson is reusable.
- No sensitive payloads appear in action log, memory log, or failure memory.

### Section J: Regression

- Phase 1 canonical task.
- Phase 3 browser task.
- Phase 4 local execution task.
- Phase 5 memory recall and forget task.
- Confirm integrations do not affect non-integration agent runs.

## Risk Summary

- OAuth app setup is the largest manual burden. BYOK reduces production risk but
  increases setup complexity.
- Some provider scopes may require app verification or workspace admin approval.
- Multi-account state can confuse agent tool selection if aliases are weak.
- Write tools touch real user data and must preserve Rule 33 approval/audit
  discipline.
- Memory extraction from integrations can leak sensitive content if not
  allowlisted and redacted before writes.
- Provider rate limits and inconsistent API errors can cause agent loops unless
  typed errors are explicit.
- Obsidian is a local-vault filesystem connector, so it must not bypass Phase 4
  path safety or approval rules.
- Zapier scope includes trigger, history, and Zap creation. Keep Phase 6.1
  bounded to those capabilities and deny broad automation fan-out.

## Stop Conditions

- Nango does not support enough of the 13 connectors to preserve the planned
  architecture.
- Settings-first BYOK OAuth credentials cannot be passed through Nango without
  Handle storing
  third-party refresh tokens.
- Hot-reload of Nango settings cannot work without a server restart.
- Obsidian local-vault tooling requires an architecture that bypasses Phase 4
  SafetyGovernor.
- Zapier scope requires broad automation fan-out before the user approves it.
- Any connector write path cannot be represented in the typed approval flow.
- Stage 1 Nango infrastructure takes more than 1.5 focused days, indicating an
  unknown platform, BYOK, or account setup issue.

## Success Criteria

- Stage 0 spec approved by user.
- Phase 6.0 Stage 1 Nango infrastructure connects GitHub end-to-end through
  Settings UI without `.env` edits.
- All 13 connectors are visible in Settings -> Integrations with setup state.
- Multi-account add/remove/switch works.
- All Tier 1-3 read tools work against controlled test data.
- All write tools require approval under `ASK` and `PLAN`.
- Forbidden patterns deny without approval.
- Action log records successful writes.
- Failure memory records reusable integration failures without sensitive data.
- Connector memory defaults to `NONE` and only writes allowlisted facts when
  explicitly enabled.
- Typed error UX offers reconnect, retry, account selection, or approval actions
  where appropriate.
- Required smokes and Playwright tests pass.
- Phase 6.0 manual audit Sections A, B, C, D, G, H, I, and J pass before tag
  `v0.6.0`.
- Phase 6.1 manual audit Sections A-J pass before tag `v0.6.1`.
- Three consecutive GitHub Actions CI runs pass on each final phase tip.
- SIGNOFF is committed after each user audit.

## Resolved Stage 0 Review Decisions

1. OAuth app naming convention:
   - Use `Handle Dev - <Connector>`, for example `Handle Dev - Gmail`.
2. Account aliasing:
   - Aliases are global per connector, not per project.
   - Project default account is a future per-project preference layered on top
     of global aliases.
3. Obsidian:
   - Implement as a local-vault filesystem connector mediated by Phase 4
     SafetyGovernor.
   - Phase 6.1 supports one vault path.
   - Multi-vault is deferred to Phase 11.
4. Zapier:
   - Phase 6.1 includes trigger Zaps, read history, and create Zaps.
   - Use Zapier MCP-style capabilities where available.
5. Per-connector forbidden patterns:
   - Initial patterns in this spec are the baseline.
   - Each tier handoff includes a forbidden-pattern review checklist before its
     smokes lock in behavior.
6. Nango provider IDs:
   - Resolve during Stage 1 implementation by verifying each of the 13
     connectors against the actual Nango catalog.
   - Document the provider IDs before Stage 2 connector tools hardcode IDs.
7. Integration UI route placement:
   - Settings -> Integrations tab only.
   - No top-level sidebar link in Phase 6.

## Stage 0.5 Handoff Gate

Stage 0.5 is complete when:

- The structural amendments are committed as
  `Phase 6 spec: Apply structural amendments`.
- `pnpm test` passes on the branch with only the spec change.
- No Stage 1 implementation code has been written.
- The user reviews and approves the spec before implementation begins.
