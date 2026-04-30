# Handle — Phase 2: Multi-Provider + Local LLM (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1 SIGNOFF before starting.

==================================================
GOAL
==================================================

Replace Phase 1's hardcoded OpenAI provider with a multi-provider
routing layer that supports five API providers plus local LLM with
automatic fallback.

Phase 2 ships in 2 weeks.

==================================================
SCOPE
==================================================

In scope:
- Provider abstraction
- 5 API providers: OpenAI, Anthropic, QWEN, KIMI, xAI
- Local LLM (OpenAI-compatible endpoint)
- Provider fallback chain
- Mac Keychain credential storage
- Settings → Providers tab matching design system
- OpenAI OAuth (custom flow; Nango not used here)
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
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ProviderId = 'openai' | 'anthropic' | 'qwen' | 'kimi' | 'xai' | 'local';

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  primaryModel: string;
  fallbackOrder: number;
  authMode?: 'apiKey' | 'oauth';   // OpenAI only for oauth
  baseURL?: string;                 // For local LLM
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
  getActiveModel(taskOverride?: ProviderId): Promise<{ provider: ProviderInstance; model: BaseChatModel }>;
}
```

==================================================
KEYCHAIN HELPER
==================================================

apps/api/src/lib/keychain.ts:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const SERVICE = 'com.perlantir.handle';

export async function getCredential(account: string): Promise<string> {
  try {
    const { stdout } = await execFileP('security', [
      'find-generic-password',
      '-s', SERVICE,
      '-a', account,
      '-w',
    ]);
    return stdout.trim();
  } catch (err: any) {
    if (err.code === 44) throw new Error(`Credential not found: ${account}`);
    throw err;
  }
}

export async function setCredential(account: string, value: string): Promise<void> {
  await execFileP('security', [
    'add-generic-password',
    '-s', SERVICE,
    '-a', account,
    '-w', value,
    '-U',
  ]);
}

export async function deleteCredential(account: string): Promise<void> {
  await execFileP('security', [
    'delete-generic-password',
    '-s', SERVICE,
    '-a', account,
  ]).catch(() => {});
}
```

Account naming:
- `openai:apiKey` / `openai:oauth:accessToken` / `openai:oauth:refreshToken` / `openai:oauth:clientId` / `openai:oauth:clientSecret` / `openai:oauth:expiresAt`
- `anthropic:apiKey`
- `qwen:apiKey`
- `kimi:apiKey`
- `xai:apiKey`
- `local:apiKey` (optional)

==================================================
PROVIDER IMPLEMENTATIONS
==================================================

apps/api/src/providers/openai.ts:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { getCredential } from '../lib/keychain';
import type { ProviderInstance, ProviderConfig } from './types';

export function createOpenAIProvider(config: ProviderConfig): ProviderInstance {
  return {
    id: 'openai',
    config,
    description: 'OpenAI (gpt-4o, o1, o3)',
    async createModel(modelOverride?: string) {
      let apiKey: string;
      if (config.authMode === 'oauth') {
        // Check expiration; refresh if needed
        const expiresAt = parseInt(await getCredential('openai:oauth:expiresAt'), 10);
        if (Date.now() > expiresAt - 60_000) {
          await refreshOpenAIToken();
        }
        apiKey = await getCredential('openai:oauth:accessToken');
      } else {
        apiKey = await getCredential('openai:apiKey');
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
        if (config.authMode === 'oauth') {
          await getCredential('openai:oauth:accessToken');
        } else {
          await getCredential('openai:apiKey');
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function refreshOpenAIToken() {
  // Implementation in OAuth section below
}
```

apps/api/src/providers/anthropic.ts:

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { getCredential } from '../lib/keychain';
import type { ProviderInstance, ProviderConfig } from './types';

export function createAnthropicProvider(config: ProviderConfig): ProviderInstance {
  return {
    id: 'anthropic',
    config,
    description: 'Anthropic (Claude Opus, Sonnet, Haiku)',
    async createModel(modelOverride?: string) {
      const apiKey = await getCredential('anthropic:apiKey');
      return new ChatAnthropic({
        model: modelOverride ?? config.primaryModel,
        apiKey,
        streaming: true,
        temperature: 0.7,
      });
    },
    async isAvailable() {
      try { await getCredential('anthropic:apiKey'); return true; } catch { return false; }
    },
  };
}
```

apps/api/src/providers/openaiCompatible.ts (used for QWEN, KIMI,
xAI, local):

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { getCredential } from '../lib/keychain';
import type { ProviderInstance, ProviderConfig, ProviderId } from './types';

const ENDPOINTS: Record<Exclude<ProviderId, 'openai' | 'anthropic'>, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi: 'https://api.moonshot.cn/v1',
  xai: 'https://api.x.ai/v1',
  local: 'http://localhost:11434/v1',  // overridable
};

const DESCRIPTIONS: Record<string, string> = {
  qwen: 'Alibaba QWEN (qwen-max, qwen-plus, qwen-turbo)',
  kimi: 'Moonshot KIMI (moonshot-v1)',
  xai: 'xAI Grok (grok-4, grok-3)',
  local: 'Local LLM (OpenAI-compatible endpoint)',
};

export function createOpenAICompatibleProvider(config: ProviderConfig): ProviderInstance {
  const id = config.id;
  return {
    id,
    config,
    description: DESCRIPTIONS[id] ?? id,
    async createModel(modelOverride?: string) {
      const apiKey = await getCredential(`${id}:apiKey`).catch(() => 'not-needed');
      const baseURL = config.baseURL ?? ENDPOINTS[id as keyof typeof ENDPOINTS];
      return new ChatOpenAI({
        model: modelOverride ?? config.primaryModel,
        apiKey,
        configuration: { baseURL },
        streaming: true,
        temperature: 0.7,
      });
    },
    async isAvailable() {
      if (id === 'local') {
        // Local doesn't need a key; just check if reachable
        const baseURL = config.baseURL ?? ENDPOINTS.local;
        try {
          const res = await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(2000) });
          return res.ok;
        } catch {
          return false;
        }
      }
      try { await getCredential(`${id}:apiKey`); return true; } catch { return false; }
    },
  };
}
```

==================================================
REGISTRY
==================================================

apps/api/src/providers/registry.ts:

```typescript
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createOpenAICompatibleProvider } from './openaiCompatible';
import type { ProviderRegistry, ProviderInstance, ProviderConfig, ProviderId } from './types';

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
        authMode: dbConfig.authMode as 'apiKey' | 'oauth' | undefined,
        baseURL: dbConfig.baseURL ?? undefined,
      };

      let provider: ProviderInstance;
      if (config.id === 'openai') provider = createOpenAIProvider(config);
      else if (config.id === 'anthropic') provider = createAnthropicProvider(config);
      else provider = createOpenAICompatibleProvider(config);

      this.providers.set(config.id, provider);
    }
  }

  list() { return Array.from(this.providers.values()); }
  get(id: ProviderId) { return this.providers.get(id); }
  getEnabled() { return this.list().filter(p => p.config.enabled); }
  getFallbackChain() {
    return this.getEnabled().sort((a, b) => a.config.fallbackOrder - b.config.fallbackOrder);
  }

  async getActiveModel(taskOverride?: ProviderId) {
    const chain = taskOverride
      ? [this.get(taskOverride), ...this.getFallbackChain()].filter(Boolean) as ProviderInstance[]
      : this.getFallbackChain();

    for (const provider of chain) {
      try {
        if (!(await provider.isAvailable())) {
          logger.warn({ provider: provider.id }, 'unavailable, skipping');
          continue;
        }
        const model = await provider.createModel();
        return { provider, model };
      } catch (err) {
        logger.warn({ err, provider: provider.id }, 'failed to create model');
      }
    }

    throw new Error('No providers available');
  }
}

export const providerRegistry = new ProviderRegistryImpl();
```

Update agent setup to use the registry:

```typescript
// apps/api/src/agent/createAgent.ts
const { provider, model } = await providerRegistry.getActiveModel(ctx.providerOverride);
logger.info({ providerId: provider.id, model: provider.config.primaryModel }, 'using provider');
// rest of agent setup uses `model`
```

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
  authMode        String   @default("apiKey")  // 'apiKey' | 'oauth'
  baseURL         String?               // Local LLM
  modelName       String?               // Local LLM display name
  updatedAt       DateTime @updatedAt
}

model Task {
  // ... existing fields ...
  providerOverride String?     // Optional per-task provider
}
```

Migration creates the 6 default rows (all disabled).

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

==================================================
OPENAI OAUTH FLOW
==================================================

Manual setup:
1. User registers Handle as OpenAI OAuth app at OpenAI's developer
   portal (URL TBD; check https://platform.openai.com when
   implementing — OAuth offerings change over time)
2. Redirect URI: http://localhost:3001/api/oauth/openai/callback
3. User enters client ID + secret in Settings → Providers → OpenAI

In-app flow:

```
GET  /api/oauth/openai/start        → returns authUrl
GET  /api/oauth/openai/callback     → exchanges code for tokens
POST /api/oauth/openai/refresh      → refreshes access token
POST /api/oauth/openai/disconnect   → clears tokens
```

If OpenAI's OAuth doesn't yet support agentic API usage when you
implement this, fall back to API-key-only and document the
limitation in the SIGNOFF.

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
- Auth mode dropdown (API Key | OAuth — only OpenAI shows OAuth)
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
9. OAuth callback exchanges code for tokens (mocked)
10. OAuth refresh flow (mocked)

==================================================
GATE CRITERIA
==================================================

1. All Phase 1 tests still pass
2. Phase 2 tests pass in CI 3 consecutive runs
3. User configures each of 5 API providers and runs canonical
   task with each
4. User configures local LLM (Ollama or LM Studio) and runs
   simpler task
5. Provider fallback works when primary fails
6. OpenAI OAuth completes end-to-end
7. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase2-providers.md:

Section A: Each of 5 API providers
- Configure key, run canonical task, verify completion

Section B: Local LLM
- Configure Ollama at localhost:11434, run simpler task, verify

Section C: Fallback
- Configure OpenAI primary + Anthropic secondary
- Delete OpenAI key
- Run task, verify falls back to Anthropic

Section D: OpenAI OAuth
- Configure client ID + secret
- Click Connect, authorize
- Run task, verify uses OAuth
- Disconnect, verify cleared

==================================================
IMPLEMENTATION ORDER
==================================================

1. Provider abstraction types
2. Keychain helper
3. OpenAI provider
4. Anthropic provider
5. OpenAI-compatible provider (QWEN/KIMI/xAI/local)
6. ProviderRegistry
7. ProviderConfig schema migration
8. Update agent setup to use registry
9. Settings API
10. Settings UI
11. OAuth routes
12. OAuth UI in Settings
13. Tests
14. Manual audit harness
15. SIGNOFF

==================================================
END OF PHASE 2 SPEC
==================================================
