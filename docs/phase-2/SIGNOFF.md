# Phase 2 Signoff: Multi-Provider

Status: Ready for review

Branch: `phase-2/multi-provider`

Manual auditor: `perlantir`

Manual audit result: Passed with deferrals

## Shipped

Phase 2 shipped the multi-provider foundation for Handle:

- Multi-provider architecture, including the provider config schema, `Task.providerOverride`, registry selection, and provider fallback.
- Five provider implementations: OpenAI, Anthropic, KIMI, OpenRouter, and Local/Ollama.
- OpenAI-compatible provider support for KIMI, OpenRouter, and Local/Ollama.
- Settings Providers API: list/update provider config, save/delete provider keys, and test provider connections.
- Settings UI with five provider cards, Save/Test/Delete flows, KIMI and Local `baseURL` fields, and OpenAI API key / ChatGPT Subscription / Both auth modes.
- OpenAI Codex OAuth for ChatGPT Subscription routing: auth profile schema, PKCE flow, localhost callback, Keychain token storage, localhost proxy, transport translation, and token refresh.
- Sampler default suppression for OpenAI, Anthropic, and OpenAI-compatible providers.
- `provider_fallback` SSE events.
- Provider e2e smoke harness at `scripts/smoke/e2e-providers.mjs`, including the `--only` flag for single-provider testing.
- Plan generation diagnostic logging, active-provider plan model construction, 60 second timeout, and try/catch error handling with proper task error status.

## End-to-End Verified

Three of six provider configurations passed the canonical Hacker News task end to end:

- OpenAI API key with `gpt-4o`: `STOPPED`, 657-910 SSE events, 10 valid Hacker News entries.
- Anthropic API key with `claude-opus-4-7`: `STOPPED`, 39-44 SSE events, 10 valid Hacker News entries.
- OpenRouter API key with `anthropic/claude-opus-4.7`: `STOPPED`, 230-297 SSE events, 10 valid Hacker News entries.

All Settings `/test` flows were verified with real provider roundtrips before the e2e smoke pass.

## Implementation Present, E2E Deferred To Phase 11

Three provider configurations are implemented and configurable, but their canonical agent-loop e2e verification is deferred to Phase 11.

### KIMI

Provider: KIMI with `kimi-k2.6`

Settings `/test`: Works

Agent-loop result: Fails with:

```text
400 thinking is enabled but reasoning_content is missing in assistant tool call message at index 2
```

Commit `8191dd2` attempted to disable KIMI thinking mode for tool-calling compatibility, but the disable flag is not actually being applied at runtime in the agent path. Phase 11 should verify which path the disable flag flows through and ensure it reaches the agent's invoke calls, not just the test endpoint.

### OpenAI ChatGPT OAuth

Provider: OpenAI `chatgpt-oauth` with `gpt-5.3-codex`

Settings `/test`: Works via the localhost proxy and transport translation

Agent-loop result: Reaches `STOPPED` without ever emitting a `tool_call` event. The model produces the plan as text, but the proxy is not translating tool calls from `/codex/responses` format back to the OpenAI Chat Completions `tool_calls` array expected by the LangChain agent.

Phase 11 should extend the localhost proxy translation layer to map `response.output[].type === "function_call"` to the `tool_calls` array.

### Local

Provider: Local/Ollama with `llama3.1:8b`

Settings `/test`: Fails with malformed JSON output

Agent-loop result: Fails with malformed JSON output

This is a model capability limitation for the 4.9 GB Llama 3.1 8B model, not a Handle architecture bug. Phase 11 should document recommended local models such as `llama3.3:70b` and `qwen2.5:32b`, and add a "Local model recommendations" section to the Settings UI.

## Bugs Found And Fixed During Phase 2

- CORS misconfiguration from the Phase 1 audit follow-on.
- Anthropic Opus 4.7 rejected `top_p: -1`; sampler default suppression was added.
- KIMI default endpoint was stale (`api.moonshot.cn` instead of `api.moonshot.ai`); defaults and existing rows were updated.
- KIMI key format handling was corrected after live testing.
- KIMI thinking mode rejects multi-step tool calls when `reasoning_content` is not preserved; a partial disable-mode fix landed, with the remaining agent-path verification deferred.
- Existing KIMI `baseURL` rows could remain stale after the source default changed; live testing required a UI re-save.
- KIMI can return misleading `401 Invalid Authentication` responses for parameter validation issues; this is documented in code.
- Settings API key save payload used `value` instead of `apiKey`; fixed to match the spec and UI.
- Anthropic provider sent unsupported sampler params for Opus 4.7; fixed with default suppression.
- Plan generation could hang silently for more than seven minutes when the active provider model was not threaded through correctly; fixed by using the active provider, adding a 60 second timeout, and emitting proper error/status events.
- LangChain's OpenAI-specific tools agent could not parse non-string Anthropic content blocks; fixed by switching to `createToolCallingAgent` for cross-provider compatibility.
- Multiple stale Node processes occupied ports `3000`/`3001` during manual testing; this was an environment hygiene issue, not a Handle bug, and is documented in handover notes.

## Architectural Decisions Confirmed

- Use LangChain `createToolCallingAgent`, not the OpenAI-specific tools agent, for cross-provider compatibility.
- Preserve per-subsystem commits per Rule 11, including isolated audit/debug fixes instead of squash-style changes.
- The 5+ commits per hour stop condition triggered once during Phase 2; work paused before continuing.
- Diagnostic logging discipline is now established: when bugs surface in production-shaped tests, add diagnostic logging first, then fix from evidence.
- Live testing surfaces real-world bugs unit tests miss; every phase needs e2e smoke coverage.

## Phase 11 Backlog Items Added

- Settings UX redesign: wizard-style primary setup flow with the current provider-card layout retained as an Advanced view.
- `/test` endpoint per-auth-mode results.
- Settings UI separate model fields per OpenAI auth mode, for example `gpt-4o` for API key and `gpt-5.3-codex` for ChatGPT Subscription OAuth.
- KIMI agent-path thinking-mode disable verification.
- OpenAI ChatGPT OAuth localhost proxy tool-call translation.
- Local model recommendations and Settings UI helper text.

## Signoff

Phase 2's architecture gate is met. Provider configuration, routing, fallback, Settings API/UI, and OpenAI ChatGPT OAuth are implemented. Three providers are end-to-end verified through the canonical agent task, and three provider-specific agent-loop issues are explicitly deferred to Phase 11.

The branch remains unmerged for human review.
