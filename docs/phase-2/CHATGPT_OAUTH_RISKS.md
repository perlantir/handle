# ChatGPT Subscription OAuth Risks

Phase 2's `chatgpt-oauth` mode depends on OpenAI's Codex CLI OAuth
surface instead of the standard OpenAI Platform API-key surface.

The Codex OAuth client ID, `app_EMoamEEZ73f0CkXaXp7hrann`, is OpenAI's
official Codex CLI OAuth client ID. Handle uses it because it is the
only known OAuth client that OpenAI currently issues ChatGPT
subscription-billing tokens for.

This is intentionally documented as a fragile dependency. If OpenAI
revokes that client, changes the Codex CLI authorization flow, or
changes the ChatGPT backend request-shape checks, Handle's
`chatgpt-oauth` mode will stop working until updated.

Implementation references:

- numman-ali/opencode-openai-codex-auth
- OpenClaw OAuth docs
