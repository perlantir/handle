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

## Provider Reliability

### KIMI agent-path thinking-mode disable

- Current state: KIMI Settings `/test` works with `kimi-k2.6`, but the canonical agent loop fails with `400 thinking is enabled but reasoning_content is missing in assistant tool call message at index 2`.
- Issue: Phase 2 commit `8191dd2` attempted to disable thinking mode, but the disable flag is not reaching the agent invoke path.
- Proposal: verify which provider/model construction path the disable flag flows through and ensure it applies to agent execution, not only the test endpoint.
- Source: Phase 2 provider smoke test, May 1 2026

### OpenAI ChatGPT OAuth tool-call translation

- Current state: OpenAI ChatGPT OAuth Settings `/test` works through the localhost proxy, but the canonical agent loop reaches `STOPPED` without emitting a `tool_call`.
- Issue: the localhost proxy is not translating `/codex/responses` function-call output back into the OpenAI Chat Completions `tool_calls` array expected by LangChain.
- Proposal: extend proxy translation for `response.output[].type === "function_call"` into standard `tool_calls`.
- Source: Phase 2 provider smoke test, May 1 2026

### Local model recommendations

- Current state: Local/Ollama with `llama3.1:8b` fails `/test` and agent execution with malformed JSON output.
- Issue: Llama 3.1 8B does not reliably produce strict tool-call JSON for Handle's current agent loop.
- Proposal: document recommended local models such as `llama3.3:70b` and `qwen2.5:32b`, and add Settings UI helper text.
- Source: Phase 2 provider smoke test, May 1 2026
