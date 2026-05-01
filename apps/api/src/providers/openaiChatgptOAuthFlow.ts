import { randomBytes } from "node:crypto";
import http, { type Server } from "node:http";
import { generatePKCE } from "@openauthjs/openauth/pkce";
import { redactSecrets } from "../lib/redact";
import {
  CHATGPT_OAUTH_AUTHORIZE_URL,
  CHATGPT_OAUTH_CLIENT_ID,
  CHATGPT_OAUTH_SCOPE,
  CHATGPT_OAUTH_TOKEN_URL,
  createChatGptOAuthProfile,
  defaultChatGptOAuthKeychain,
  deleteChatGptOAuthProfile,
  getChatGptOAuthStatus,
  readChatGptOAuthProfile,
  writeChatGptOAuthProfile,
  type ChatGptOAuthKeychain,
  type ChatGptOAuthStatus,
} from "./openaiChatgptAuth";

export const CHATGPT_OAUTH_CALLBACK_HOST = "127.0.0.1";
export const CHATGPT_OAUTH_REDIRECT_HOST = "localhost";
export const CHATGPT_OAUTH_CALLBACK_PATH = "/auth/callback";
export const CHATGPT_OAUTH_CALLBACK_PORTS = [1455, 1457] as const;

const FLOW_TIMEOUT_MS = 10 * 60 * 1000;

type FetchLike = typeof fetch;

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  id_token?: string;
  refresh_token: string;
}

interface ActiveOAuthFlow {
  close(): Promise<void>;
  error: string | null;
  port: number;
  redirectUri: string;
  state: string;
  userId: string;
}

export interface StartChatGptOAuthResult {
  authUrl: string;
  expiresInMs: number;
  port: number;
  redirectUri: string;
  state: string;
}

export interface ChatGptOAuthService {
  disconnect(): Promise<void>;
  refresh(): Promise<ChatGptOAuthStatus>;
  start(userId: string): Promise<StartChatGptOAuthResult>;
  status(userId?: string): Promise<
    ChatGptOAuthStatus & {
      flowError: string | null;
      flowState: string | null;
      port: number | null;
    }
  >;
}

export interface CreateChatGptOAuthServiceOptions {
  callbackPorts?: readonly number[];
  fetchToken?: FetchLike;
  keychain?: ChatGptOAuthKeychain;
}

function createState() {
  return randomBytes(32).toString("base64url");
}

function redirectUri(port: number) {
  return `http://${CHATGPT_OAUTH_REDIRECT_HOST}:${port}${CHATGPT_OAUTH_CALLBACK_PATH}`;
}

export function buildChatGptOAuthAuthorizeUrl({
  codeChallenge,
  redirectUri: flowRedirectUri,
  state,
}: {
  codeChallenge: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(CHATGPT_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CHATGPT_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", flowRedirectUri);
  url.searchParams.set("scope", CHATGPT_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("originator", "codex_cli_rs");

  return url.toString();
}

function sanitizeOAuthError(err: unknown) {
  if (err instanceof Error) return redactSecrets(err.message);
  if (typeof err === "string") return redactSecrets(err);
  return "Unknown ChatGPT OAuth error";
}

async function parseTokenResponse(response: Response, action: string) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `ChatGPT OAuth ${action} failed: ${response.status} ${redactSecrets(text)}`,
    );
  }

  const parsed = JSON.parse(text) as Partial<TokenResponse>;
  if (!parsed.access_token || !parsed.refresh_token) {
    throw new Error(`ChatGPT OAuth ${action} returned incomplete tokens`);
  }

  return parsed as TokenResponse;
}

export async function exchangeChatGptOAuthCode({
  code,
  codeVerifier,
  fetchToken = fetch,
  redirectUri: flowRedirectUri,
}: {
  code: string;
  codeVerifier: string;
  fetchToken?: FetchLike;
  redirectUri: string;
}) {
  const response = await fetchToken(CHATGPT_OAUTH_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: flowRedirectUri,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const tokens = await parseTokenResponse(response, "token exchange");

  return createChatGptOAuthProfile({
    accessToken: tokens.access_token,
    ...(tokens.expires_in !== undefined
      ? { expiresInSeconds: tokens.expires_in }
      : {}),
    ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    refreshToken: tokens.refresh_token,
  });
}

export async function refreshChatGptOAuthTokens({
  fetchToken = fetch,
  keychain = defaultChatGptOAuthKeychain,
}: {
  fetchToken?: FetchLike;
  keychain?: ChatGptOAuthKeychain;
} = {}) {
  const current = await readChatGptOAuthProfile(keychain);
  const response = await fetchToken(CHATGPT_OAUTH_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const tokens = await parseTokenResponse(response, "token refresh");
  const refreshed = createChatGptOAuthProfile({
    accessToken: tokens.access_token,
    ...(tokens.expires_in !== undefined
      ? { expiresInSeconds: tokens.expires_in }
      : {}),
    ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    refreshToken: tokens.refresh_token,
  });

  await writeChatGptOAuthProfile(refreshed, keychain);

  return refreshed;
}

function successHtml() {
  return `<!doctype html><html><head><title>Handle ChatGPT OAuth</title></head><body><p>ChatGPT subscription auth is connected. You can close this window.</p></body></html>`;
}

function errorHtml(message: string) {
  return `<!doctype html><html><head><title>Handle ChatGPT OAuth</title></head><body><p>ChatGPT subscription auth failed.</p><pre>${message}</pre></body></html>`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function listen(server: Server, port: number) {
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, CHATGPT_OAUTH_CALLBACK_HOST);
  });
}

function responseText(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "Connection": "close",
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(body);
}

export function createChatGptOAuthService({
  callbackPorts = CHATGPT_OAUTH_CALLBACK_PORTS,
  fetchToken = fetch,
  keychain = defaultChatGptOAuthKeychain,
}: CreateChatGptOAuthServiceOptions = {}): ChatGptOAuthService {
  let activeFlow: ActiveOAuthFlow | null = null;

  async function stopActiveFlow() {
    const flow = activeFlow;
    activeFlow = null;
    if (flow) await flow.close();
  }

  async function startCallbackServer({
    codeVerifier,
    state,
    userId,
  }: {
    codeVerifier: string;
    state: string;
    userId: string;
  }): Promise<ActiveOAuthFlow> {
    let selectedPort: number | null = null;
    let lastError: Error | null = null;

    const server = http.createServer(async (req, res) => {
      const port = selectedPort ?? callbackPorts[0] ?? 1455;
      const requestUrl = new URL(
        req.url ?? "/",
        `http://${CHATGPT_OAUTH_REDIRECT_HOST}:${port}`,
      );

      if (requestUrl.pathname !== CHATGPT_OAUTH_CALLBACK_PATH) {
        responseText(res, 404, "Not found");
        return;
      }

      if (requestUrl.searchParams.get("state") !== state) {
        activeFlow = activeFlow
          ? { ...activeFlow, error: "ChatGPT OAuth state mismatch" }
          : activeFlow;
        responseText(res, 400, errorHtml("ChatGPT OAuth state mismatch"));
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        activeFlow = activeFlow
          ? { ...activeFlow, error: "ChatGPT OAuth callback missing code" }
          : activeFlow;
        responseText(res, 400, errorHtml("ChatGPT OAuth callback missing code"));
        return;
      }

      try {
        const profile = await exchangeChatGptOAuthCode({
          code,
          codeVerifier,
          fetchToken,
          redirectUri: redirectUri(port),
        });
        await writeChatGptOAuthProfile(profile, keychain);
        responseText(res, 200, successHtml());
        setTimeout(() => {
          void stopActiveFlow();
        }, 50).unref();
      } catch (err) {
        const message = sanitizeOAuthError(err);
        activeFlow = activeFlow ? { ...activeFlow, error: message } : activeFlow;
        responseText(res, 500, errorHtml(message));
      }
    });

    for (const port of callbackPorts) {
      try {
        await listen(server, port);
        const address = server.address();
        selectedPort =
          typeof address === "object" && address ? address.port : port;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (selectedPort === null) {
      throw new Error(
        `Unable to start ChatGPT OAuth callback listener on ports ${callbackPorts.join(", ")}: ${
          lastError?.message ?? "unknown error"
        }`,
      );
    }

    const timeout = setTimeout(() => {
      activeFlow = activeFlow
        ? { ...activeFlow, error: "ChatGPT OAuth flow timed out" }
        : activeFlow;
      void stopActiveFlow();
    }, FLOW_TIMEOUT_MS);
    timeout.unref();

    return {
      close: async () => {
        clearTimeout(timeout);
        await closeServer(server);
      },
      error: null,
      port: selectedPort,
      redirectUri: redirectUri(selectedPort),
      state,
      userId,
    };
  }

  return {
    async disconnect() {
      await stopActiveFlow();
      await deleteChatGptOAuthProfile(keychain);
    },

    async refresh() {
      await refreshChatGptOAuthTokens({ fetchToken, keychain });
      return getChatGptOAuthStatus(keychain);
    },

    async start(userId: string) {
      await stopActiveFlow();
      const pkce = await generatePKCE();
      const state = createState();
      const flow = await startCallbackServer({
        codeVerifier: pkce.verifier,
        state,
        userId,
      });

      activeFlow = flow;

      return {
        authUrl: buildChatGptOAuthAuthorizeUrl({
          codeChallenge: pkce.challenge,
          redirectUri: flow.redirectUri,
          state,
        }),
        expiresInMs: FLOW_TIMEOUT_MS,
        port: flow.port,
        redirectUri: flow.redirectUri,
        state,
      };
    },

    async status(userId?: string) {
      const status = await getChatGptOAuthStatus(keychain);
      const flow =
        activeFlow && (!userId || activeFlow.userId === userId)
          ? activeFlow
          : null;

      return {
        ...status,
        flowError: flow?.error ?? null,
        flowState: flow?.state ?? null,
        port: flow?.port ?? null,
      };
    },
  };
}
