import { describe, expect, it, vi } from "vitest";
import {
  buildChatGptOAuthAuthorizeUrl,
  createChatGptOAuthService,
  exchangeChatGptOAuthCode,
  refreshChatGptOAuthTokens,
} from "./openaiChatgptOAuthFlow";
import {
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS,
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

function tokenResponse(accountId = "account-123") {
  return {
    access_token: jwt({
      exp: 1_800_000_000,
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId,
        chatgpt_plan_type: "plus",
      },
    }),
    expires_in: 3600,
    id_token: jwt({
      email: "perlantir@example.com",
      exp: 1_800_000_000,
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId,
        chatgpt_plan_type: "plus",
      },
    }),
    refresh_token: "refresh-token-not-real",
  };
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

describe("OpenAI ChatGPT OAuth flow", () => {
  it("builds the Codex OAuth authorize URL with required parameters", () => {
    const authUrl = new URL(
      buildChatGptOAuthAuthorizeUrl({
        codeChallenge: "challenge-not-real",
        redirectUri: "http://localhost:1455/auth/callback",
        state: "state-not-real",
      }),
    );

    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://auth.openai.com/oauth/authorize",
    );
    expect(authUrl.searchParams.get("client_id")).toBe(
      CHATGPT_OAUTH_CLIENT_ID,
    );
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:1455/auth/callback",
    );
    expect(authUrl.searchParams.get("code_challenge")).toBe(
      "challenge-not-real",
    );
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(authUrl.searchParams.get("originator")).toBe("codex_cli_rs");
  });

  it("exchanges an authorization code for a Keychain-ready profile", async () => {
    const fetchToken = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse("account-exchange")), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    const profile = await exchangeChatGptOAuthCode({
      code: "code-not-real",
      codeVerifier: "verifier-not-real",
      fetchToken,
      redirectUri: "http://localhost:1455/auth/callback",
    });

    expect(profile).toMatchObject({
      accountId: "account-exchange",
      email: "perlantir@example.com",
      expires: 1_800_000_000_000,
      planType: "plus",
      refreshToken: "refresh-token-not-real",
    });
    expect(fetchToken).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchToken.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe(CHATGPT_OAUTH_CLIENT_ID);
    expect(body.get("code")).toBe("code-not-real");
  });

  it("refreshes tokens and writes the refreshed profile", async () => {
    const { keychain, values } = memoryKeychain({
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken]: jwt({
        exp: 1_700_000_000,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "account-old",
        },
      }),
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId]: "account-old",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires]: "1700000000000",
      [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken]:
        "old-refresh-token-not-real",
    });
    const fetchToken = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse("account-new")), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await refreshChatGptOAuthTokens({ fetchToken, keychain });

    const body = fetchToken.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh-token-not-real");
    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId)).toBe(
      "account-new",
    );
  });

  it("starts a callback listener and stores tokens after callback", async () => {
    const { keychain, values } = memoryKeychain();
    const fetchToken = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tokenResponse("account-callback")), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const service = createChatGptOAuthService({
      callbackPorts: [0],
      fetchToken,
      keychain,
    });

    const flow = await service.start("user-test");
    const callback = new URL(flow.redirectUri);
    callback.searchParams.set("code", "callback-code-not-real");
    callback.searchParams.set("state", flow.state);

    const response = await fetch(callback);

    expect(response.status).toBe(200);
    expect(values.get(CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId)).toBe(
      "account-callback",
    );
    await service.disconnect();
  });

  it("surfaces token endpoint failures without leaking request secrets", async () => {
    const fetchToken = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          refresh_token: "secret-refresh-token",
        }),
        { status: 400 },
      ),
    );

    await expect(
      exchangeChatGptOAuthCode({
        code: "secret-code",
        codeVerifier: "secret-verifier",
        fetchToken,
        redirectUri: "http://localhost:1455/auth/callback",
      }),
    ).rejects.toThrow("ChatGPT OAuth token exchange failed: 400");
    await expect(
      exchangeChatGptOAuthCode({
        code: "secret-code",
        codeVerifier: "secret-verifier",
        fetchToken,
        redirectUri: "http://localhost:1455/auth/callback",
      }),
    ).rejects.not.toThrow("secret-refresh-token");
  });
});
