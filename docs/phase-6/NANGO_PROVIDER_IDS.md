# Phase 6 Nango Provider IDs

Stage 1 records the provider IDs used by Handle's connector registry. These IDs are verified against the Nango integration catalog during Stage 1 implementation and are the values used when Handle creates BYOK integrations in the user's Nango dev environment.

| Connector | Phase | Nango provider ID | Handle integration key | Notes |
| --- | --- | --- | --- | --- |
| Gmail | 6.0 Tier 1 | `google-mail` | `handle-dev-gmail` | Google OAuth app named `Handle Dev - Gmail` |
| Slack | 6.0 Tier 1 | `slack` | `handle-dev-slack` | Slack OAuth app named `Handle Dev - Slack` |
| Notion | 6.0 Tier 1 | `notion` | `handle-dev-notion` | Public Notion integration named `Handle Dev - Notion` |
| Google Drive | 6.0 Tier 1 | `google-drive` | `handle-dev-google-drive` | Google OAuth app named `Handle Dev - Google Drive` |
| GitHub | 6.0 Tier 1 | `github` | `handle-dev-github` | GitHub OAuth app named `Handle Dev - GitHub` |
| Google Calendar | 6.1 Tier 2 | `google-calendar` | `handle-dev-google-calendar` | Google OAuth app named `Handle Dev - Google Calendar` |
| Cloudflare | 6.1 Tier 2 | `cloudflare` | `handle-dev-cloudflare` | Token-based setup through Nango Connect; create scoped API token named `Handle Dev - Cloudflare` |
| Vercel | 6.1 Tier 2 | `vercel` | `handle-dev-vercel` | Token-based setup through Nango Connect; create access token named `Handle Dev - Vercel` |
| Linear | 6.1 Tier 2 | `linear` | `handle-dev-linear` | Stage 4 rechecks scopes before writes ship |
| Google Sheets | 6.1 Tier 3 | `google-sheet` | `handle-dev-google-sheets` | Nango catalog uses singular `google-sheet` |
| Google Docs | 6.1 Tier 3 | `google` | `handle-dev-google-docs` | Uses generic Google OAuth provider with Docs scopes |
| Zapier | 6.1 Tier 3 | `zapier-nla` | `handle-dev-zapier` | Audit must verify NLA covers trigger, history, and Zap creation; split/defer unsupported surfaces if not |
| Obsidian | 6.1 Tier 3 | N/A | N/A | Local-vault connector mediated by SafetyGovernor, not Nango |

## Stage 1 Notes

- Redirect URI shown in the Settings UI for OAuth connectors: `https://api.nango.dev/oauth/callback`.
- Cloudflare and Vercel do not show redirect URI or OAuth client fields; their provider tokens are entered in Nango Connect and stored by Nango.
- Account aliases are global per connector. Project default account preferences are layered on top in later stages.
- OAuth Client IDs are stored in Postgres for display/setup state. OAuth Client Secrets and the Nango secret key are stored through the same Keychain-backed secret path as model provider keys.
- The Nango client is recreated from Settings on every service call, so changing the secret key or host does not require a backend restart.
