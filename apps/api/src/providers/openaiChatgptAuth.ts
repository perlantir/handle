import { z } from "zod";
import {
  deleteCredential as defaultDeleteCredential,
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
} from "../lib/keychain";
import { redactSecrets } from "../lib/redact";

export const CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS = {
  accessToken: "openai:chatgpt:accessToken",
  accountId: "openai:chatgpt:accountId",
  email: "openai:chatgpt:email",
  expires: "openai:chatgpt:expires",
  planType: "openai:chatgpt:planType",
  refreshToken: "openai:chatgpt:refreshToken",
} as const;

export const CHATGPT_OAUTH_ACCOUNT_KEYS = Object.values(
  CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS,
);

export const CHATGPT_BACKEND_BASE_URL = "https://chatgpt.com/backend-api";
export const CHATGPT_OAUTH_AUTHORIZE_URL =
  "https://auth.openai.com/oauth/authorize";
export const CHATGPT_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CHATGPT_OAUTH_SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke";
export const CHATGPT_OAUTH_REFRESH_WINDOW_MS = 5 * 60 * 1000;
export const CHATGPT_OAUTH_FALLBACK_HINT =
  "To enable fallback, also configure your OpenAI API key, Anthropic, OpenRouter, or another provider.";

/*
 * OpenAI's official Codex CLI OAuth client ID. Handle uses this client ID
 * because it is the only known OpenAI OAuth client that issues tokens which
 * route model calls to a user's ChatGPT subscription instead of Platform API
 * billing. This is a known fragile dependency: if OpenAI revokes the client,
 * changes Codex CLI auth, or changes the ChatGPT backend request-shape check,
 * chatgpt-oauth mode will stop working until updated.
 *
 * References: numman-ali/opencode-openai-codex-auth and OpenClaw OAuth docs.
 */
export const CHATGPT_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const chatGptOAuthProfileSchema = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().min(1),
  email: z.string().email().optional(),
  expires: z.number().int().positive(),
  planType: z.string().min(1).optional(),
  refreshToken: z.string().min(1),
});

export type ChatGptOAuthProfile = z.infer<typeof chatGptOAuthProfileSchema>;

export interface ChatGptOAuthStatus {
  accountId: string | null;
  email: string | null;
  expires: number | null;
  planType: string | null;
  signedIn: boolean;
}

export interface ChatGptJwtClaims {
  accountId?: string;
  email?: string;
  expires?: number;
  planType?: string;
  userId?: string;
}

export interface ChatGptOAuthKeychain {
  deleteCredential(account: string): Promise<void>;
  getCredential(account: string): Promise<string>;
  setCredential(account: string, value: string): Promise<void>;
}

export const defaultChatGptOAuthKeychain: ChatGptOAuthKeychain = {
  deleteCredential: defaultDeleteCredential,
  getCredential: defaultGetCredential,
  setCredential: defaultSetCredential,
};

export function chatGptOAuthFailureMessage(reason: string) {
  const redacted = redactSecrets(reason);
  if (redacted.startsWith("OpenAI ChatGPT Subscription auth failed:")) {
    return redacted;
  }

  return `OpenAI ChatGPT Subscription auth failed: ${redacted}. ${CHATGPT_OAUTH_FALLBACK_HINT}`;
}

export function shouldRefreshChatGptOAuthProfile(
  profile: Pick<ChatGptOAuthProfile, "expires">,
  now = Date.now(),
) {
  return profile.expires - now <= CHATGPT_OAUTH_REFRESH_WINDOW_MS;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return Buffer.from(padded, "base64").toString("utf8");
}

function parseJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  if (!payload) throw new Error("Invalid ChatGPT OAuth token: malformed JWT");

  const parsed = JSON.parse(decodeBase64Url(payload)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid ChatGPT OAuth token: unexpected JWT payload");
  }

  return parsed as Record<string, unknown>;
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberClaim(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function parseChatGptJwtClaims(jwt: string): ChatGptJwtClaims {
  const payload = parseJwtPayload(jwt);
  const profile = payload["https://api.openai.com/profile"];
  const auth = payload["https://api.openai.com/auth"];
  const profileClaims =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile as Record<string, unknown>)
      : {};
  const authClaims =
    auth && typeof auth === "object" && !Array.isArray(auth)
      ? (auth as Record<string, unknown>)
      : {};

  const claims: ChatGptJwtClaims = {};
  const accountId = stringClaim(authClaims.chatgpt_account_id);
  const email = stringClaim(payload.email) ?? stringClaim(profileClaims.email);
  const expires = numberClaim(payload.exp);
  const planType = stringClaim(authClaims.chatgpt_plan_type);
  const userId =
    stringClaim(authClaims.chatgpt_user_id) ?? stringClaim(authClaims.user_id);

  if (accountId) claims.accountId = accountId;
  if (email) claims.email = email;
  if (expires !== undefined) claims.expires = expires;
  if (planType) claims.planType = planType;
  if (userId) claims.userId = userId;

  return claims;
}

export function createChatGptOAuthProfile({
  accessToken,
  expiresInSeconds,
  idToken,
  refreshToken,
}: {
  accessToken: string;
  expiresInSeconds?: number;
  idToken?: string;
  refreshToken: string;
}): ChatGptOAuthProfile {
  const claims = parseChatGptJwtClaims(idToken ?? accessToken);
  const expires =
    claims.expires !== undefined
      ? claims.expires * 1000
      : Date.now() + (expiresInSeconds ?? 3600) * 1000;

  if (!claims.accountId) {
    throw new Error(
      "Invalid ChatGPT OAuth token: missing chatgpt_account_id claim",
    );
  }

  return chatGptOAuthProfileSchema.parse({
    accessToken,
    accountId: claims.accountId,
    email: claims.email,
    expires,
    planType: claims.planType,
    refreshToken,
  });
}

export async function readChatGptOAuthProfile(
  keychain: ChatGptOAuthKeychain = defaultChatGptOAuthKeychain,
): Promise<ChatGptOAuthProfile> {
  const [accessToken, refreshToken, expiresRaw, accountId, email, planType] =
    await Promise.all([
      keychain.getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken),
      keychain.getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken),
      keychain.getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires),
      keychain.getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId),
      keychain
        .getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.email)
        .catch(() => ""),
      keychain
        .getCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.planType)
        .catch(() => ""),
    ]);

  return chatGptOAuthProfileSchema.parse({
    accessToken,
    accountId,
    ...(email ? { email } : {}),
    expires: Number.parseInt(expiresRaw, 10),
    ...(planType ? { planType } : {}),
    refreshToken,
  });
}

export async function writeChatGptOAuthProfile(
  profile: ChatGptOAuthProfile,
  keychain: ChatGptOAuthKeychain = defaultChatGptOAuthKeychain,
) {
  const parsed = chatGptOAuthProfileSchema.parse(profile);

  await Promise.all([
    keychain.setCredential(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken,
      parsed.accessToken,
    ),
    keychain.setCredential(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken,
      parsed.refreshToken,
    ),
    keychain.setCredential(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires,
      String(parsed.expires),
    ),
    keychain.setCredential(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId,
      parsed.accountId,
    ),
    parsed.email
      ? keychain.setCredential(
          CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.email,
          parsed.email,
        )
      : keychain.deleteCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.email),
    parsed.planType
      ? keychain.setCredential(
          CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.planType,
          parsed.planType,
        )
      : keychain.deleteCredential(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.planType),
  ]);
}

export async function deleteChatGptOAuthProfile(
  keychain: ChatGptOAuthKeychain = defaultChatGptOAuthKeychain,
) {
  await Promise.all(
    CHATGPT_OAUTH_ACCOUNT_KEYS.map((account) =>
      keychain.deleteCredential(account),
    ),
  );
}

export async function getChatGptOAuthStatus(
  keychain: ChatGptOAuthKeychain = defaultChatGptOAuthKeychain,
): Promise<ChatGptOAuthStatus> {
  try {
    const profile = await readChatGptOAuthProfile(keychain);

    return {
      accountId: profile.accountId,
      email: profile.email ?? null,
      expires: profile.expires,
      planType: profile.planType ?? null,
      signedIn: true,
    };
  } catch {
    return {
      accountId: null,
      email: null,
      expires: null,
      planType: null,
      signedIn: false,
    };
  }
}
