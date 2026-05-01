# Handle — Phase 2: Multi-Provider + Local LLM (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1 SIGNOFF before starting.

==================================================
GOAL
==================================================

Replace Phase 1's hardcoded OpenAI provider with a multi-provider
routing layer that supports four API providers plus local LLM with
automatic fallback.

Phase 2 ships in 2 weeks.

==================================================
SCOPE
==================================================

In scope:

- Provider abstraction
- 4 API providers: OpenAI, Anthropic, KIMI, OpenRouter
- Local LLM (OpenAI-compatible endpoint)
- Provider fallback chain
- Mac Keychain credential storage
- Settings → Providers tab matching design system
- OpenAI API key mode and ChatGPT subscription OAuth mode (custom
  Codex OAuth / localhost proxy flow; Nango not used here)
- Per-task provider override

Out of scope:

- Browser (Phase 3)
- Local execution (Phase 4)
- Memory (Phase 5)
- Integrations Nango (Phase 6)

==================================================
PROVIDER ABSTRACTION
==================================================

apps/api/src/providers/types.ts:

```typescript
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "kimi"
  | "openrouter"
  | "local";

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  primaryModel: string;
  fallbackOrder: number;
  authMode?: "apiKey" | "chatgpt-oauth"; // OpenAI only for chatgpt-oauth
  baseURL?: string; // For OpenAI-compatible providers
}

export interface ProviderInstance {
  id: ProviderId;
  config: ProviderConfig;
  description: string;
  createModel(modelOverride?: string): Promise<BaseChatModel>;
  isAvailable(): Promise<boolean>;
}

export interface ProviderRegistry {
  list(): ProviderInstance[];
  get(id: ProviderId): ProviderInstance | undefined;
  getEnabled(): ProviderInstance[];
  getFallbackChain(): ProviderInstance[];
  getActiveModel(
    taskOverride?: ProviderId,
  ): Promise<{ provider: ProviderInstance; model: BaseChatModel }>;
}
```

==================================================
KEYCHAIN HELPER
==================================================

apps/api/src/lib/keychain.ts:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const SERVICE = "com.perlantir.handle";

export async function getCredential(account: string): Promise<string> {
  try {
    const { stdout } = await execFileP("security", [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      account,
      "-w",
    ]);
    return stdout.trim();
  } catch (err: any) {
    if (err.code === 44) throw new Error(`Credential not found: ${account}`);
    throw err;
  }
}

export async function setCredential(
  account: string,
  value: string,
): Promise<void> {
  await execFileP("security", [
    "add-generic-password",
    "-s",
    SERVICE,
    "-a",
    account,
    "-w",
    value,
    "-U",
  ]);
}

export async function deleteCredential(account: string): Promise<void> {
  await execFileP("security", [
    "delete-generic-password",
    "-s",
    SERVICE,
    "-a",
    account,
  ]).catch(() => {});
}
```

Account naming:

- `openai:apiKey` / `openai:chatgpt-oauth:accessToken` / `openai:chatgpt-oauth:refreshToken` / `openai:chatgpt-oauth:expiresAt`
- `anthropic:apiKey`
- `kimi:apiKey`
- `openrouter:apiKey`
- `local:apiKey` (optional)

==================================================
PROVIDER IMPLEMENTATIONS
==================================================

apps/api/src/providers/openai.ts:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { getCredential } from "../lib/keychain";
import type { ProviderInstance, ProviderConfig } from "./types";

export function createOpenAIProvider(config: ProviderConfig): ProviderInstance {
  return {
    id: "openai",
    config,
    description: "OpenAI (gpt-4o, o1, o3)",
    async createModel(modelOverride?: string) {
      let apiKey: string;
      if (config.authMode === "chatgpt-oauth") {
        // Check expiration; refresh if needed
        const expiresAt = parseInt(
          await getCredential("openai:chatgpt-oauth:expiresAt"),
          10,
        );
        if (Date.now() > expiresAt - 60_000) {
          await refreshOpenAIChatGPTToken();
        }
        apiKey = await getCredential("openai:chatgpt-oauth:accessToken");
      } else {
        apiKey = await getCredential("openai:apiKey");
      }

      return new ChatOpenAI({
        model: modelOverride ?? config.primaryModel,
        apiKey,
        streaming: true,
        temperature: 0.7,
      });
    },
    async isAvailable() {
      try {
        if (config.authMode === "chatgpt-oauth") {
          await getCredential("openai:chatgpt-oauth:accessToken");
        } else {
          await getCredential("openai:apiKey");
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function refreshOpenAIChatGPTToken() {
  // Implementation in OpenAI ChatGPT subscription OAuth section below
}
```

apps/api/src/providers/anthropic.ts:

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { getCredential } from "../lib/keychain";
import type { ProviderInstance, ProviderConfig } from "./types";

export function createAnthropicProvider(
  config: ProviderConfig,
): ProviderInstance {
  return {
    id: "anthropic",
    config,
    description: "Anthropic (Claude Opus, Sonnet, Haiku)",
    async createModel(modelOverride?: string) {
      const apiKey = await getCredential("anthropic:apiKey");
      return new ChatAnthropic({
        model: modelOverride ?? config.primaryModel,
        apiKey,
        streaming: true,
        temperature: 0.7,
      });
    },
    async isAvailable() {
      try {
        await getCredential("anthropic:apiKey");
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

apps/api/src/providers/openaiCompatible.ts (used for KIMI,
OpenRouter, local):

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { getCredential } from "../lib/keychain";
import type { ProviderInstance, ProviderConfig, ProviderId } from "./types";

const ENDPOINTS: Record<Exclude<ProviderId, "openai" | "anthropic">, string> = {
  kimi: "https://api.moonshot.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  local: "http://127.0.0.1:11434/v1", // overridable
};

const DESCRIPTIONS: Record<string, string> = {
  kimi: "Moonshot KIMI (moonshot-v1)",
  openrouter: "OpenRouter (100+ models from many providers)",
  local: "Local LLM (OpenAI-compatible endpoint)",
};

function defaultHeadersFor(id: ProviderId) {
  if (id !== "openrouter") return undefined;

  const appURL =
    process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const appTitle = process.env.HANDLE_OPENROUTER_TITLE ?? "Handle";
  return {
    "HTTP-Referer": appURL,
    "X-OpenRouter-Title": appTitle,
    "X-Title": appTitle,
  };
}

export function createOpenAICompatibleProvider(
  config: ProviderConfig,
): ProviderInstance {
  const id = config.id;
  return {
    id,
    config,
    description: DESCRIPTIONS[id] ?? id,
    async createModel(modelOverride?: string) {
      const apiKey = await getCredential(`${id}:apiKey`).catch(
        () => "not-needed",
      );
      const baseURL = config.baseURL ?? ENDPOINTS[id as keyof typeof ENDPOINTS];
      return new ChatOpenAI({
        model: modelOverride ?? config.primaryModel,
        apiKey,
        configuration: {
          baseURL,
          defaultHeaders: defaultHeadersFor(id),
        },
        streaming: true,
        temperature: 0.7,
      });
    },
    async isAvailable() {
      if (id === "local") {
        // Local doesn't need a key; just check if reachable
        const baseURL = config.baseURL ?? ENDPOINTS.local;
        try {
          const res = await fetch(`${baseURL}/models`, {
            signal: AbortSignal.timeout(2000),
          });
          return res.ok;
        } catch {
          return false;
        }
      }
      try {
        await getCredential(`${id}:apiKey`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

==================================================
REGISTRY
==================================================

apps/api/src/providers/registry.ts:

```typescript
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import type {
  ProviderRegistry,
  ProviderInstance,
  ProviderConfig,
  ProviderId,
} from "./types";

export class ProviderRegistryImpl implements ProviderRegistry {
  private providers: Map<ProviderId, ProviderInstance> = new Map();

  async initialize() {
    const configs = await prisma.providerConfig.findMany();

    for (const dbConfig of configs) {
      const config: ProviderConfig = {
        id: dbConfig.id as ProviderId,
        enabled: dbConfig.enabled,
        primaryModel: dbConfig.primaryModel,
        fallbackOrder: dbConfig.fallbackOrder,
        authMode: dbConfig.authMode as "apiKey" | "chatgpt-oauth" | undefined,
        baseURL: dbConfig.baseURL ?? undefined,
      };

      let provider: ProviderInstance;
      if (config.id === "openai") provider = createOpenAIProvider(config);
      else if (config.id === "anthropic")
        provider = createAnthropicProvider(config);
      else provider = createOpenAICompatibleProvider(config);

      this.providers.set(config.id, provider);
    }
  }

  list() {
    return Array.from(this.providers.values());
  }
  get(id: ProviderId) {
    return this.providers.get(id);
  }
  getEnabled() {
    return this.list().filter((p) => p.config.enabled);
  }
  getFallbackChain() {
    return this.getEnabled().sort(
      (a, b) => a.config.fallbackOrder - b.config.fallbackOrder,
    );
  }

  async getActiveModel(taskOverride?: ProviderId) {
    const chain = taskOverride
      ? ([this.get(taskOverride), ...this.getFallbackChain()].filter(
          Boolean,
        ) as ProviderInstance[])
      : this.getFallbackChain();

    for (const provider of chain) {
      try {
        if (!(await provider.isAvailable())) {
          logger.warn({ provider: provider.id }, "unavailable, skipping");
          continue;
        }
        const model = await provider.createModel();
        return { provider, model };
      } catch (err) {
        logger.warn({ err, provider: provider.id }, "failed to create model");
      }
    }

    throw new Error("No providers available");
  }
}

export const providerRegistry = new ProviderRegistryImpl();
```

Update agent setup to use the registry:

```typescript
// apps/api/src/agent/createAgent.ts
const { provider, model } = await providerRegistry.getActiveModel(
  ctx.providerOverride,
);
logger.info(
  { providerId: provider.id, model: provider.config.primaryModel },
  "using provider",
);
// rest of agent setup uses `model`
```

When the primary provider fails and fallback selects another
provider, emit an SSE event before continuing:

```typescript
{
  type: 'provider_fallback',
  fromProvider,
  toProvider,
  reason,
  taskId,
}
```

The Workspace status bar updates the visible model name when this
event arrives. A subtle toast notifies the user that fallback
occurred. The task cost counter splits usage across providers
instead of merging all usage under the final provider.

==================================================
SCHEMA UPDATE
==================================================

Add ProviderConfig table:

```prisma
model ProviderConfig {
  id              String   @id           // 'openai' | ...
  enabled         Boolean  @default(false)
  primaryModel    String
  fallbackOrder   Int
  authMode        String   @default("apiKey")  // 'apiKey' | 'chatgpt-oauth'
  baseURL         String?               // OpenAI-compatible providers
  modelName       String?               // Display name
  updatedAt       DateTime @updatedAt
}

model Task {
  // ... existing fields ...
  providerOverride String?     // Optional per-task provider
}
```

Migration creates the 5 default rows (all disabled).

==================================================
SETTINGS API
==================================================

apps/api/src/routes/settings.ts:

```
GET    /api/settings/providers              List configs (no secrets)
PUT    /api/settings/providers/:id          Update config
POST   /api/settings/providers/:id/key      Set credential (writes Keychain)
DELETE /api/settings/providers/:id/key      Delete credential
POST   /api/settings/providers/:id/test     Test the model with "Hello"
```

Credential write behavior:

- When the user clicks Save on a key, write to Keychain and then
  immediately read it back. Surface failure if the read-back does
  not match.
- When the user clicks Test Connection, surface the actual provider
  error verbatim enough to distinguish Invalid API key, Rate
  limited, and Network unreachable. Do not replace these with a
  generic failure message.

==================================================
OPENAI CHATGPT SUBSCRIPTION OAUTH FLOW
==================================================

OpenAI supports two auth modes in Phase 2:

- `apiKey`: standard OpenAI Platform API key, billed to the user's
  Platform account
- `chatgpt-oauth`: Codex OAuth / ChatGPT subscription routing via a
  localhost proxy, billed to the user's ChatGPT subscription

In-app flow:

```
GET  /api/oauth/openai/start        → returns authUrl
GET  /api/oauth/openai/callback     → exchanges code for tokens
POST /api/oauth/openai/refresh      → refreshes access token
POST /api/oauth/openai/disconnect   → clears tokens
```

Implementation reference: numman-ali/opencode-openai-codex-auth.
The flow mirrors Codex CLI login with PKCE, stores tokens in Mac
Keychain through the Phase 2 keychain helper, and routes OpenAI
requests through a localhost proxy that translates between standard
chat-completion calls and the Codex CLI request shape.

Risks accepted for Phase 2:

- The pattern depends on mimicking Codex CLI request shape.
- OpenAI could change auth checks or policy.
- When ChatGPT subscription rate limits, fall back to `apiKey` mode
  if configured.

Document these risks in Phase 2 SIGNOFF.

==================================================
SETTINGS UI (PROVIDERS TAB)
==================================================

apps/web/app/(workspace)/settings/page.tsx — new route at /settings.

Per design system, use ProviderCard component for each provider.
Match Screen 11 layout: 2-column with settings nav (220) + content
(max-width 760).

For each provider:

- Avatar (letter avatar in colored circle)
- Provider name + description
- Enabled toggle
- Auth mode control. OpenAI shows API Key, ChatGPT Subscription
  (recommended), and Both (fallback). Other providers show API Key.
- Credential fields (per auth mode)
- Model selection dropdown
- Fallback order (drag handles or arrows)
- Test connection button
- Save button

==================================================
TESTS
==================================================

1. Each provider creates ChatModel correctly with mocked credentials
2. Keychain helper round-trips
3. ProviderRegistry.getFallbackChain orders correctly
4. ProviderRegistry.getActiveModel falls back on failure
5. Settings GET /api/settings/providers returns no secrets
6. Settings PUT updates DB
7. Settings POST /key writes Keychain
8. Settings POST /test calls the model
9. ChatGPT OAuth callback exchanges code for tokens (mocked)
10. ChatGPT OAuth refresh flow (mocked)
11. `pnpm smoke:e2e-providers` runs the canonical task against
    OpenAI API key, OpenAI ChatGPT OAuth, Anthropic, KIMI,
    OpenRouter, and local. It skips a
    provider when the corresponding Keychain credential or local
    endpoint is not configured. For each configured provider, it
    asserts status `STOPPED` and verifies more than 5 valid Hacker
    News entries with title, URL, and score.

==================================================
GATE CRITERIA
==================================================

1. All Phase 1 tests still pass
2. Phase 2 tests pass in CI 3 consecutive runs
3. User runs `pnpm smoke:e2e-providers` locally with all configured
   auth modes/providers; OpenAI API key, OpenAI ChatGPT OAuth,
   Anthropic, KIMI, OpenRouter, and local each produce more than 5
   valid Hacker News entries and finish with status `STOPPED`
4. Provider fallback works when primary fails, emits
   `provider_fallback`, updates the status bar model name, shows a
   subtle toast, and splits cost by provider
5. OpenAI API key mode and ChatGPT subscription OAuth mode complete
   end-to-end, including fallback from ChatGPT subscription rate
   limits to API key mode when both are configured
6. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase2-providers.md:

Section A: Provider smoke

- Configure OpenAI API key, OpenAI ChatGPT OAuth, Anthropic, KIMI,
  OpenRouter, and local
- Run `pnpm smoke:e2e-providers`
- Verify all configured auth modes/providers return more than 5
  valid Hacker News entries and finish with status `STOPPED`

Section B: Local LLM

- Configure Ollama at localhost:11434, run simpler task, verify

Section C: Fallback

- Configure OpenAI primary + Anthropic secondary
- Delete OpenAI key
- Run task, verify falls back to Anthropic
- Verify `provider_fallback` streams, the status bar model name
  updates, a subtle toast appears, and cost is split by provider

Section D: OpenAI ChatGPT Subscription OAuth

- Click Sign in with ChatGPT, authorize
- Run task, verify uses ChatGPT subscription OAuth
- Configure API key fallback, force subscription rate limit, verify
  fallback uses API key
- Disconnect, verify cleared

Section E: Keychain failure modes

- Save a provider key and verify the app confirms the Keychain
  read-back succeeded
- Test invalid credentials and verify the actual provider error is
  visible rather than a generic message

==================================================
IMPLEMENTATION ORDER
==================================================

1. Provider abstraction types
2. Keychain helper
3. OpenAI provider
4. Anthropic provider
5. OpenAI-compatible provider (KIMI/OpenRouter/local)
6. ProviderRegistry
7. ProviderConfig schema migration
8. Update agent setup to use registry
9. Settings API
10. Settings UI
11. OAuth routes
12. OAuth UI in Settings
13. Tests
14. Provider e2e smoke test
15. Manual audit harness
16. SIGNOFF

==================================================
END OF PHASE 2 SPEC
==================================================
