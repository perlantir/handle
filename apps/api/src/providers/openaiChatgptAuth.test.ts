import { describe, expect, it, vi } from "vitest";
import {
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS,
  createChatGptOAuthProfile,
  deleteChatGptOAuthProfile,
  getChatGptOAuthStatus,
  parseChatGptJwtClaims,
  readChatGptOAuthProfile,
  writeChatGptOAuthProfile,
  type ChatGptOAuthKeychain,
} from "./openaiChatgptAuth";

function jwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
    .toString("base64url")
    .replace(/=+$/, "");
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64url")
    .replace(/=+$/, "");

  return `${header}.${body}.signature`;
}

function memoryKeychain(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const keychain: ChatGptOAuthKeychain = {
    deleteCredential: vi.fn(async (account: string) => {
      values.delete(account);
    }),
    getCredential: vi.fn(async (account: string) => {
      const value = values.get(account);
      if (!value) throw new Error(`Credential not found: ${account}`);
      return value;
    }),
    setCredential: vi.fn(async (account: string, value: string) => {
      values.set(account, value);
    }),
  };

  return { keychain, values };
}

describe("OpenAI ChatGPT OAuth auth profile", () => {
  it("documents the official Codex OAuth client ID dependency", () => {
    expect(CHATGPT_OAUTH_CLIENT_ID).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
  });

  it("parses ChatGPT account, email, plan, and expiry claims", () => {
    const token = jwt({
      email: "perlantir@example.com",
      exp: 1_800_000_000,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-123",
        chatgpt_plan_type: "plus",
        chatgpt_user_id: "user-123",
      },
    });

    expect(parseChatGptJwtClaims(token)).toEqual({
      accountId: "account-123",
      email: "perlantir@example.com",
      expires: 1_800_000_000,
      planType: "plus",
      userId: "user-123",
    });
  });

  it("creates a profile from OAuth token response fields", () => {
    const idToken = jwt({
      exp: 1_800_000_001,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-456",
        chatgpt_plan_type: "pro",
      },
      "https://api.openai.com/profile": {
        email: "profile@example.com",
      },
    });

    expect(
      createChatGptOAuthProfile({
        accessToken: "access-token-not-real",
        idToken,
        refreshToken: "refresh-token-not-real",
      }),
    ).toEqual({
      accessToken: "access-token-not-real",
      accountId: "account-456",
      email: "profile@example.com",
      expires: 1_800_000_001_000,
      planType: "pro",
      refreshToken: "refresh-token-not-real",
    });
  });

  it("writes and reads profile fields through the expected Keychain accounts", async () => {
    const { keychain, values } = memoryKeychain();
    const profile = {
      accessToken: "access-token-not-real",
      accountId: "account-789",
      email: "saved@example.com",
      expires: 1_800_000_002_000,
      planType: "team",
      refreshToken: "refresh-token-not-real",
    };

    await writeChatGptOAuthProfile(profile, keychain);

    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken)).toBe(
      "access-token-not-real",
    );
    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken)).toBe(
      "refresh-token-not-real",
    );
    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires)).toBe(
      "1800000002000",
    );
    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId)).toBe(
      "account-789",
    );

    await expect(readChatGptOAuthProfile(keychain)).resolves.toEqual(profile);
  });

  it("reports signed-out status when required credentials are missing", async () => {
    const { keychain } = memoryKeychain();

    await expect(getChatGptOAuthStatus(keychain)).resolves.toEqual({
      accountId: null,
      email: null,
      expires: null,
      planType: null,
      signedIn: false,
    });
  });

  it("deletes all ChatGPT OAuth Keychain accounts", async () => {
    const { keychain } = memoryKeychain({
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken]: "access",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId]: "account",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.email]: "email@example.com",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires]: "1800000003000",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.planType]: "plus",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken]: "refresh",
    });

    await deleteChatGptOAuthProfile(keychain);

    expect(keychain.deleteCredential).toHaveBeenCalledTimes(6);
    expect(keychain.deleteCredential).toHaveBeenCalledWith(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken,
    );
    expect(keychain.deleteCredential).toHaveBeenCalledWith(
      CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken,
    );
  });
});
