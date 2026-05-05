import type { MemoryScope, SearchProviderId } from "@handle/shared";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import {
  deleteCredential as defaultDeleteCredential,
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
} from "../lib/keychain";
import { logger } from "../lib/logger";

export type SearchFallbackProvider = SearchProviderId | "BUILT_IN";

export interface SearchProviderDefinition {
  docsUrl: string;
  id: SearchProviderId;
  label: string;
}

export const SEARCH_PROVIDERS: SearchProviderDefinition[] = [
  {
    docsUrl: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    id: "TAVILY",
    label: "Tavily",
  },
  {
    docsUrl: "https://serper.dev/",
    id: "SERPER",
    label: "Serper",
  },
  {
    docsUrl: "https://brave.com/search/api/",
    id: "BRAVE",
    label: "Brave Search",
  },
];

export const DEFAULT_SEARCH_FALLBACK_ORDER: SearchFallbackProvider[] = [
  "TAVILY",
  "SERPER",
  "BRAVE",
  "BUILT_IN",
];

export interface SearchKeychainLike {
  deleteCredential(account: string): Promise<void>;
  getCredential(account: string): Promise<string>;
  setCredential(account: string, value: string): Promise<void>;
}

export interface SearchProviderConfigRow {
  enabled: boolean;
  keychainAlias: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastTestedAt: Date | string | null;
  memoryScope: string;
  providerId: string;
  rateLimitPerMinute: number | null;
  updatedAt?: Date | string;
}

export interface ProjectSearchSettingsRow {
  defaultProvider: string | null;
  fallbackOrder: unknown;
  memoryScope: string;
  projectId: string;
  updatedAt?: Date | string | null;
}

export interface SearchProviderStore {
  projectSearchSettings?: {
    findUnique(args: unknown): Promise<ProjectSearchSettingsRow | null>;
    upsert(args: unknown): Promise<ProjectSearchSettingsRow>;
  };
  searchProviderConfig: {
    deleteMany?(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<SearchProviderConfigRow[]>;
    findUnique(args: unknown): Promise<SearchProviderConfigRow | null>;
    update(args: unknown): Promise<SearchProviderConfigRow>;
    upsert(args: unknown): Promise<SearchProviderConfigRow>;
  };
}

export interface NormalizedSearchResult {
  publishedAt?: string | null;
  score?: number | null;
  snippet: string;
  snippetTruncated?: boolean;
  sourceProvider: SearchProviderId;
  title: string;
  url: string;
}

export interface SearchProviderClientResponse {
  providerId: SearchProviderId;
  results: NormalizedSearchResult[];
}

export class SearchProviderError extends Error {
  code: string;
  providerId?: SearchProviderId;
  status?: number;

  constructor(message: string, options: { code: string; providerId?: SearchProviderId; status?: number }) {
    super(message);
    this.name = "SearchProviderError";
    this.code = options.code;
    if (options.providerId) this.providerId = options.providerId;
    if (options.status !== undefined) this.status = options.status;
  }
}

function normalizeResultUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isSearchProviderId(value: string): value is SearchProviderId {
  return value === "TAVILY" || value === "SERPER" || value === "BRAVE";
}

function keychainAccount(userId: string, providerId: SearchProviderId) {
  return `search:${userId}:${providerId.toLowerCase()}:apiKey`;
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function providerStatus(row: SearchProviderConfigRow | null, hasApiKey: boolean) {
  if (!hasApiKey) return "missing_key" as const;
  if (row?.lastErrorCode === "rate_limited") return "rate_limited" as const;
  if (row?.lastErrorCode) return "error" as const;
  return "configured" as const;
}

async function hasKey(keychain: SearchKeychainLike, alias: string | null | undefined) {
  if (!alias) return false;
  try {
    await keychain.getCredential(alias);
    return true;
  } catch {
    return false;
  }
}

function normalizeFallbackOrder(value: unknown): SearchFallbackProvider[] {
  if (!Array.isArray(value)) return DEFAULT_SEARCH_FALLBACK_ORDER;
  const normalized = value.filter(
    (item): item is SearchFallbackProvider =>
      item === "BUILT_IN" || (typeof item === "string" && isSearchProviderId(item)),
  );
  return normalized.length > 0 ? normalized : DEFAULT_SEARCH_FALLBACK_ORDER;
}

function rowToSummary(
  definition: SearchProviderDefinition,
  row: SearchProviderConfigRow | null,
  hasApiKey: boolean,
) {
  return {
    docsUrl: definition.docsUrl,
    enabled: row?.enabled ?? false,
    hasApiKey,
    id: definition.id,
    label: definition.label,
    lastErrorCode: row?.lastErrorCode ?? null,
    lastErrorMessage: row?.lastErrorMessage ?? null,
    lastTestedAt: serializeDate(row?.lastTestedAt ?? null),
    memoryScope: (row?.memoryScope ?? "NONE") as MemoryScope,
    rateLimitPerMinute: row?.rateLimitPerMinute ?? null,
    status: providerStatus(row, hasApiKey),
  };
}

function projectSettingsToSummary(row: ProjectSearchSettingsRow) {
  return {
    defaultProvider: isSearchProviderId(row.defaultProvider ?? "") ? (row.defaultProvider as SearchProviderId) : null,
    fallbackOrder: normalizeFallbackOrder(row.fallbackOrder),
    memoryScope: (row.memoryScope ?? "NONE") as MemoryScope,
    projectId: row.projectId,
    updatedAt: serializeDate(row.updatedAt ?? null),
  };
}

async function ensureProviderRows(store: SearchProviderStore, userId: string) {
  const rows = await Promise.all(
    SEARCH_PROVIDERS.map((definition) =>
      store.searchProviderConfig.upsert({
        create: {
          enabled: false,
          memoryScope: "NONE",
          providerId: definition.id,
          userId,
        },
        update: {},
        where: { userId_providerId: { providerId: definition.id, userId } },
      }),
    ),
  );
  return rows;
}

async function ensureProjectSettings(store: SearchProviderStore, projectId: string) {
  if (!store.projectSearchSettings) return null;
  return store.projectSearchSettings.upsert({
    create: {
      fallbackOrder: DEFAULT_SEARCH_FALLBACK_ORDER,
      memoryScope: "NONE",
      projectId,
    },
    update: {},
    where: { projectId },
  });
}

export async function listSearchSettings({
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  projectId,
  store = prisma,
  userId,
}: {
  keychain?: SearchKeychainLike;
  projectId?: string;
  store?: SearchProviderStore;
  userId: string;
}) {
  const rows = await ensureProviderRows(store, userId);
  const rowByProvider = new Map(rows.map((row) => [row.providerId, row]));
  const providers = await Promise.all(
    SEARCH_PROVIDERS.map(async (definition) => {
      const row = rowByProvider.get(definition.id) ?? null;
      const hasApiKey = await hasKey(keychain, row?.keychainAlias);
      return rowToSummary(definition, row, hasApiKey);
    }),
  );
  const project = projectId ? await ensureProjectSettings(store, projectId) : null;
  return {
    project: project ? projectSettingsToSummary(project) : null,
    providers,
  };
}

export async function updateSearchProviderConfig({
  input,
  providerId,
  store = prisma,
  userId,
}: {
  input: {
    enabled?: boolean;
    memoryScope?: MemoryScope;
    rateLimitPerMinute?: number | null;
  };
  providerId: SearchProviderId;
  store?: SearchProviderStore;
  userId: string;
}) {
  const data: Record<string, unknown> = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.memoryScope !== undefined) data.memoryScope = input.memoryScope;
  if (input.rateLimitPerMinute !== undefined) data.rateLimitPerMinute = input.rateLimitPerMinute;

  return store.searchProviderConfig.upsert({
    create: {
      ...data,
      memoryScope: input.memoryScope ?? "NONE",
      providerId,
      userId,
    },
    update: data,
    where: { userId_providerId: { providerId, userId } },
  });
}

export async function saveSearchProviderKey({
  apiKey,
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  providerId,
  store = prisma,
  userId,
}: {
  apiKey: string;
  keychain?: SearchKeychainLike;
  providerId: SearchProviderId;
  store?: SearchProviderStore;
  userId: string;
}) {
  const alias = keychainAccount(userId, providerId);
  await keychain.setCredential(alias, apiKey);
  return store.searchProviderConfig.upsert({
    create: {
      enabled: true,
      keychainAlias: alias,
      memoryScope: "NONE",
      providerId,
      userId,
    },
    update: {
      enabled: true,
      keychainAlias: alias,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    where: { userId_providerId: { providerId, userId } },
  });
}

export async function deleteSearchProviderKey({
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  providerId,
  store = prisma,
  userId,
}: {
  keychain?: SearchKeychainLike;
  providerId: SearchProviderId;
  store?: SearchProviderStore;
  userId: string;
}) {
  const row = await store.searchProviderConfig.findUnique({
    where: { userId_providerId: { providerId, userId } },
  });
  if (row?.keychainAlias) await keychain.deleteCredential(row.keychainAlias);
  return store.searchProviderConfig.upsert({
    create: {
      enabled: false,
      keychainAlias: null,
      memoryScope: "NONE",
      providerId,
      userId,
    },
    update: {
      enabled: false,
      keychainAlias: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    where: { userId_providerId: { providerId, userId } },
  });
}

export async function updateProjectSearchSettings({
  input,
  projectId,
  store = prisma,
}: {
  input: {
    defaultProvider?: SearchProviderId | null;
    fallbackOrder?: SearchFallbackProvider[];
    memoryScope?: MemoryScope;
  };
  projectId: string;
  store?: SearchProviderStore;
}) {
  if (!store.projectSearchSettings) {
    throw new Error("Project search settings store is unavailable.");
  }
  const data: Record<string, unknown> = {};
  if (input.defaultProvider !== undefined) data.defaultProvider = input.defaultProvider;
  if (input.fallbackOrder !== undefined) data.fallbackOrder = input.fallbackOrder;
  if (input.memoryScope !== undefined) data.memoryScope = input.memoryScope;
  return store.projectSearchSettings.upsert({
    create: {
      defaultProvider: input.defaultProvider ?? null,
      fallbackOrder: input.fallbackOrder ?? DEFAULT_SEARCH_FALLBACK_ORDER,
      memoryScope: input.memoryScope ?? "NONE",
      projectId,
    },
    update: data,
    where: { projectId },
  });
}

async function checkedJson(response: Response, providerId: SearchProviderId): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const code = response.status === 429 ? "rate_limited" : "provider_error";
    throw new SearchProviderError(`${providerId} search failed with HTTP ${response.status}`, {
      code,
      providerId,
      status: response.status,
    });
  }
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new SearchProviderError(`${providerId} search returned malformed JSON`, {
      code: "malformed_response",
      providerId,
      status: response.status,
    });
  }
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const SEARCH_RESULT_SNIPPET_MAX_CHARS = 1_200;
const SEARCH_RESULT_TITLE_MAX_CHARS = 300;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxChars: number) {
  const normalized = collapseWhitespace(value);
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  return {
    text: `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`,
    truncated: true,
  };
}

function normalizeResults(providerId: SearchProviderId, payload: unknown): NormalizedSearchResult[] {
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const raw =
    providerId === "TAVILY"
      ? asRecords(body.results)
      : providerId === "SERPER"
        ? asRecords(body.organic)
        : asRecords((body.web as Record<string, unknown> | undefined)?.results);

  const normalized: NormalizedSearchResult[] = [];

  for (const item of raw) {
      const title = truncateText(asString(item.title), SEARCH_RESULT_TITLE_MAX_CHARS).text;
      const url = normalizeResultUrl(providerId === "SERPER" ? asString(item.link) : asString(item.url));
      const rawSnippet =
        providerId === "TAVILY"
          ? asString(item.content)
          : providerId === "BRAVE"
            ? asString(item.description)
            : asString(item.snippet);
      const snippet = truncateText(rawSnippet, SEARCH_RESULT_SNIPPET_MAX_CHARS);
      if (!title || !url) continue;
      const publishedAt = asString(item.published_date) || asString(item.date) || asString(item.page_age) || null;
      normalized.push({
        ...(publishedAt ? { publishedAt } : {}),
        score: asNumber(item.score),
        snippet: snippet.text,
        ...(snippet.truncated ? { snippetTruncated: true } : {}),
        sourceProvider: providerId,
        title,
        url,
      });
  }

  return normalized;
}

export async function queryProvider({
  apiKey,
  fetchImpl = fetch,
  maxResults,
  providerId,
  query,
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxResults: number;
  providerId: SearchProviderId;
  query: string;
}): Promise<SearchProviderClientResponse> {
  const count = Math.max(1, Math.min(maxResults, 10));
  let response: Response;

  if (providerId === "TAVILY") {
    response = await fetchImpl("https://api.tavily.com/search", {
      body: JSON.stringify({
        include_answer: false,
        max_results: count,
        query,
        search_depth: "basic",
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } else if (providerId === "SERPER") {
    response = await fetchImpl("https://google.serper.dev/search", {
      body: JSON.stringify({ num: count, q: query }),
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      method: "POST",
    });
  } else {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
  }

  const payload = await checkedJson(response, providerId);
  return {
    providerId,
    results: normalizeResults(providerId, payload),
  };
}

async function providerRowsById(store: SearchProviderStore, userId: string) {
  const rows = await store.searchProviderConfig.findMany({
    where: { userId },
  });
  return new Map(rows.map((row) => [row.providerId, row]));
}

async function orderedProviderIds({
  explicitProvider,
  projectId,
  store,
}: {
  explicitProvider?: SearchProviderId;
  projectId?: string;
  store: SearchProviderStore;
}): Promise<SearchFallbackProvider[]> {
  if (explicitProvider) return [explicitProvider];
  if (projectId && store.projectSearchSettings) {
    const project = await store.projectSearchSettings.findUnique({ where: { projectId } });
    if (project?.defaultProvider && isSearchProviderId(project.defaultProvider)) {
      return [project.defaultProvider, ...DEFAULT_SEARCH_FALLBACK_ORDER.filter((id) => id !== project.defaultProvider)];
    }
    if (project) return normalizeFallbackOrder(project.fallbackOrder);
  }
  return DEFAULT_SEARCH_FALLBACK_ORDER;
}

export async function webSearch({
  fetchImpl = fetch,
  maxResults = 5,
  projectId,
  providerId,
  query,
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  store = prisma,
  userId,
}: {
  fetchImpl?: typeof fetch;
  keychain?: SearchKeychainLike;
  maxResults?: number;
  projectId?: string;
  providerId?: SearchProviderId;
  query: string;
  store?: SearchProviderStore;
  userId: string;
}): Promise<SearchProviderClientResponse> {
  const rows = await providerRowsById(store, userId);
  const order = await orderedProviderIds({
    ...(providerId ? { explicitProvider: providerId } : {}),
    ...(projectId ? { projectId } : {}),
    store,
  });
  const failures: string[] = [];

  for (const candidate of order) {
    if (candidate === "BUILT_IN") {
      failures.push("built-in provider unavailable from the Handle API tool surface");
      continue;
    }

    const row = rows.get(candidate);
    if (!row?.enabled) {
      failures.push(`${candidate}: disabled`);
      continue;
    }
    if (!row.keychainAlias) {
      failures.push(`${candidate}: missing API key`);
      continue;
    }

    try {
      const apiKey = await keychain.getCredential(row.keychainAlias);
      const response = await queryProvider({
        apiKey,
        fetchImpl,
        maxResults,
        providerId: candidate,
        query,
      });
      await store.searchProviderConfig.update({
        data: {
          lastErrorCode: null,
          lastErrorMessage: null,
          lastTestedAt: new Date(),
        },
        where: { userId_providerId: { providerId: candidate, userId } },
      });
      return response;
    } catch (err) {
      const code = err instanceof SearchProviderError ? err.code : "provider_error";
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${candidate}: ${message}`);
      await store.searchProviderConfig.update({
        data: {
          lastErrorCode: code,
          lastErrorMessage: redactSecrets(message),
          lastTestedAt: new Date(),
        },
        where: { userId_providerId: { providerId: candidate, userId } },
      }).catch((updateErr: unknown) => {
        logger.warn({ err: updateErr, providerId: candidate }, "Failed to record search provider error");
      });
      if (providerId) break;
    }
  }

  throw new SearchProviderError(`No configured BYOK web search provider succeeded. ${failures.join("; ")}`, {
    code: failures.some((failure) => failure.includes("rate")) ? "rate_limited" : "no_provider_available",
    ...(providerId ? { providerId } : {}),
  });
}

export async function webFetch({
  fetchImpl = fetch,
  maxBytes = 120_000,
  timeoutMs = 15_000,
  url,
}: {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  url: string;
}) {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new SearchProviderError("web_fetch only supports http and https URLs.", {
      code: "unsupported_url",
    });
  }
  const response = await fetchImpl(target, {
    headers: {
      Accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.8",
      "User-Agent": "Handle/0.6.5 (+https://handle.local)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new SearchProviderError(`web_fetch failed with HTTP ${response.status}`, {
      code: response.status === 429 ? "rate_limited" : "fetch_failed",
      status: response.status,
    });
  }
  return {
    content: text.slice(0, Math.max(1, Math.min(maxBytes, 500_000))),
    contentType: response.headers.get("content-type"),
    truncated: text.length > maxBytes,
    url: target.toString(),
  };
}

export function parseSearchProviderId(value: string | undefined): SearchProviderId | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return isSearchProviderId(upper) ? upper : null;
}
