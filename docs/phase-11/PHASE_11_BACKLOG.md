# Phase 11 Backlog

## UX Polish

### Settings → Providers UX redesign

- Current state: all 5 provider cards visible simultaneously on /settings
- Issue: overwhelming for primary configuration; better suited as power-user admin view
- Proposal: wizard-style primary flow ("Which auth method?" → "Which provider?" → configure)
- Keep current layout accessible as "Advanced" view
- Reference: Cursor settings, Continue.dev onboarding
- Source: Phase 2 step 7 live UI test, May 1 2026

### Settings → OpenAI auth mode UX

- Current state: OpenAI can be configured for API key, ChatGPT Subscription OAuth, or Both (fallback), but `/test` runs the currently persisted auth mode with the single provider-level `primaryModel`.
- Issue: when Both is enabled, an API-key model such as `gpt-4o` can be sent through ChatGPT Subscription OAuth, which supports a different Codex model subset and fails confusingly.
- Proposal: run each available auth mode separately in the Test Connection flow and return per-mode results.
- Proposal: track separate model fields per auth mode, for example `gpt-4o` for API key and `gpt-5.3-codex` for ChatGPT Subscription OAuth.
- Source: Phase 2 provider smoke test, May 1 2026
