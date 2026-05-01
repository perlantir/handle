import http, { type Server } from "node:http";
import { redactSecrets } from "../lib/redact";
import {
  CHATGPT_BACKEND_BASE_URL,
  chatGptOAuthFailureMessage,
  defaultChatGptOAuthKeychain,
  readChatGptOAuthProfile,
  shouldRefreshChatGptOAuthProfile,
  type ChatGptOAuthKeychain,
  type ChatGptOAuthProfile,
} from "./openaiChatgptAuth";
import { getCodexInstructions } from "./openaiChatgptInstructions";
import { refreshChatGptOAuthTokens } from "./openaiChatgptOAuthFlow";

export const CHATGPT_OAUTH_PROXY_HOST = "127.0.0.1";
export const CHATGPT_OAUTH_PROXY_PORTS = [1456, 1457, 1458, 1459] as const;
export const CHATGPT_OAUTH_PROXY_HEALTH_PATH =
  "/__handle_chatgpt_oauth_proxy/health";

type FetchLike = typeof fetch;
type RefreshTokens = typeof refreshChatGptOAuthTokens;

interface ChatCompletionMessage {
  content?: unknown;
  name?: string;
  role: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    function?: { arguments?: string; name?: string };
    id?: string;
    type?: string;
  }>;
}

interface ChatCompletionRequestBody {
  messages?: ChatCompletionMessage[];
  model?: string;
  stream?: boolean;
  tool_choice?: unknown;
  tools?: Array<{
    function?: {
      description?: string;
      name?: string;
      parameters?: unknown;
      strict?: boolean;
    };
    type?: string;
  }>;
}

interface ResponseInputMessage {
  content: Array<{ text: string; type: "input_text" | "output_text" }>;
  role: "assistant" | "developer" | "system" | "user";
  type: "message";
}

interface ResponseFunctionCall {
  arguments: string;
  call_id: string;
  name: string;
  type: "function_call";
}

interface ResponseFunctionCallOutput {
  call_id: string;
  output: string;
  type: "function_call_output";
}

type ResponseInputItem =
  | ResponseFunctionCall
  | ResponseFunctionCallOutput
  | ResponseInputMessage;

interface ChatGptOAuthProxyServer {
  baseURL: string;
  port: number;
  reused: boolean;
  stop(): Promise<void>;
}

export interface ChatGptOAuthProxyManager {
  ensureStarted(): Promise<ChatGptOAuthProxyServer>;
  stop(): Promise<void>;
}

export interface CreateChatGptOAuthProxyManagerOptions {
  fetchUpstream?: FetchLike;
  getInstructions?: typeof getCodexInstructions;
  keychain?: ChatGptOAuthKeychain;
  ports?: readonly number[];
  refreshTokens?: RefreshTokens;
}

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function convertMessages(messages: ChatCompletionMessage[] = []) {
  const input: ResponseInputItem[] = [];

  for (const message of messages) {
    const content = textFromContent(message.content);
    if (content) {
      input.push({
        content: [
          {
            text: content,
            type: message.role === "assistant" ? "output_text" : "input_text",
          },
        ],
        role:
          message.role === "system"
            ? "developer"
            : message.role === "assistant"
              ? "assistant"
              : "user",
        type: "message",
      });
    }

    for (const toolCall of message.tool_calls ?? []) {
      input.push({
        arguments: toolCall.function?.arguments ?? "{}",
        call_id: toolCall.id ?? `call_${input.length}`,
        name: toolCall.function?.name ?? "unknown_tool",
        type: "function_call",
      });
    }

    if (message.role === "tool" && message.tool_call_id) {
      input.push({
        call_id: message.tool_call_id,
        output: content,
        type: "function_call_output",
      });
    }
  }

  return input;
}

function convertTools(tools: ChatCompletionRequestBody["tools"] = []) {
  return tools
    .filter((tool) => tool.type === "function" && tool.function?.name)
    .map((tool) => ({
      description: tool.function?.description ?? "",
      name: tool.function?.name ?? "unknown_tool",
      parameters: tool.function?.parameters ?? { type: "object" },
      strict: tool.function?.strict,
      type: "function",
    }));
}

export async function createCodexResponsesRequest(
  body: ChatCompletionRequestBody,
  getInstructions: typeof getCodexInstructions = getCodexInstructions,
) {
  const model = body.model ?? "gpt-5.1";

  return {
    include: ["reasoning.encrypted_content"],
    input: convertMessages(body.messages),
    instructions: await getInstructions({ model }),
    model,
    parallel_tool_calls: true,
    store: false,
    stream: true,
    text: { verbosity: "medium" },
    tool_choice: body.tool_choice ?? "auto",
    tools: convertTools(body.tools),
  };
}

function createUpstreamHeaders(profile: ChatGptOAuthProfile) {
  return {
    Authorization: `Bearer ${profile.accessToken}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "responses=experimental",
    accept: "text/event-stream",
    "chatgpt-account-id": profile.accountId,
    originator: "codex_cli_rs",
  };
}

function chatChunk({
  delta,
  finishReason = null,
  model,
}: {
  delta: Record<string, unknown>;
  finishReason?: string | null;
  model: string;
}) {
  return {
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: Math.floor(Date.now() / 1000),
    id: "chatcmpl-handle-chatgpt-oauth",
    model,
    object: "chat.completion.chunk",
  };
}

function sseData(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function parseSseEvents(text: string) {
  return text
    .split(/\n\n+/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter(Boolean)
    .filter((line) => line !== "[DONE]")
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null);
}

function responseTextDelta(event: Record<string, unknown>) {
  if (event.type === "response.output_text.delta") {
    return typeof event.delta === "string" ? event.delta : "";
  }
  if (event.type === "response.output_item.added") {
    const item = event.item as Record<string, unknown> | undefined;
    if (item?.type === "message" && typeof item.content === "string") {
      return item.content;
    }
  }
  return "";
}

function functionCallAdded(event: Record<string, unknown>) {
  if (event.type !== "response.output_item.added") return null;
  const item = event.item as Record<string, unknown> | undefined;
  if (item?.type !== "function_call") return null;

  return {
    id: String(item.call_id ?? item.id ?? `call_${Date.now()}`),
    name: String(item.name ?? "unknown_tool"),
  };
}

function functionCallDelta(event: Record<string, unknown>) {
  if (event.type !== "response.function_call_arguments.delta") return "";
  return typeof event.delta === "string" ? event.delta : "";
}

async function convertUpstreamSseToChatSse(response: Response, model: string) {
  const source = await response.text();
  const events = parseSseEvents(source);
  let sawToolCall = false;
  let output = "";
  let toolIndex = 0;
  let sse = "";

  for (const event of events) {
    const addedTool = functionCallAdded(event);
    if (addedTool) {
      sawToolCall = true;
      sse += sseData(
        chatChunk({
          delta: {
            tool_calls: [
              {
                function: { arguments: "", name: addedTool.name },
                id: addedTool.id,
                index: toolIndex,
                type: "function",
              },
            ],
          },
          model,
        }),
      );
      continue;
    }

    const argsDelta = functionCallDelta(event);
    if (argsDelta) {
      sse += sseData(
        chatChunk({
          delta: {
            tool_calls: [
              {
                function: { arguments: argsDelta },
                index: toolIndex,
              },
            ],
          },
          model,
        }),
      );
      continue;
    }

    const delta = responseTextDelta(event);
    if (delta) {
      output += delta;
      sse += sseData(chatChunk({ delta: { content: delta }, model }));
    }

    if (event.type === "response.output_item.done" && sawToolCall) {
      toolIndex += 1;
    }
  }

  sse += sseData(
    chatChunk({
      delta: {},
      finishReason: sawToolCall ? "tool_calls" : "stop",
      model,
    }),
  );
  sse += "data: [DONE]\n\n";

  return { output, sse };
}

function chatCompletionJson({
  content,
  model,
}: {
  content: string;
  model: string;
}) {
  return {
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        message: { content, role: "assistant" },
      },
    ],
    created: Math.floor(Date.now() / 1000),
    id: "chatcmpl-handle-chatgpt-oauth",
    model,
    object: "chat.completion",
  };
}

async function handleProxyRequest({
  body,
  fetchUpstream,
  getInstructions,
  keychain,
  refreshTokens,
}: {
  body: ChatCompletionRequestBody;
  fetchUpstream: FetchLike;
  getInstructions: typeof getCodexInstructions;
  keychain: ChatGptOAuthKeychain;
  refreshTokens: RefreshTokens;
}) {
  const codexRequest = await createCodexResponsesRequest(body, getInstructions);

  async function freshProfile() {
    const profile = await readChatGptOAuthProfile(keychain);
    if (!shouldRefreshChatGptOAuthProfile(profile)) return profile;

    try {
      return await refreshTokens({ keychain });
    } catch (err) {
      throw new Error(
        chatGptOAuthFailureMessage(
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }

  async function send(profile: ChatGptOAuthProfile) {
    return fetchUpstream(`${CHATGPT_BACKEND_BASE_URL}/codex/responses`, {
      body: JSON.stringify(codexRequest),
      headers: createUpstreamHeaders(profile),
      method: "POST",
    });
  }

  const profile = await freshProfile();
  let upstream = await send(profile);

  if (upstream.status === 401) {
    const originalBody = await upstream.text().catch(() => "");
    try {
      upstream = await send(await refreshTokens({ keychain }));
    } catch (err) {
      return Response.json(
        {
          error: chatGptOAuthFailureMessage(
            err instanceof Error ? err.message : String(err),
          ),
          originalError: redactSecrets(originalBody),
        },
        { status: 502 },
      );
    }
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return Response.json(
      { error: chatGptOAuthFailureMessage(redactSecrets(text)) },
      { status: upstream.status },
    );
  }

  const { output, sse } = await convertUpstreamSseToChatSse(
    upstream,
    body.model ?? "gpt-5.1",
  );

  if (body.stream !== false) {
    return new Response(sse, {
      headers: { "Content-Type": "text/event-stream" },
      status: 200,
    });
  }

  return Response.json(
    chatCompletionJson({ content: output, model: body.model ?? "gpt-5.1" }),
  );
}

async function requestJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as
    | ChatCompletionRequestBody
    | Record<string, never>;
}

async function writeWebResponse(res: http.ServerResponse, response: Response) {
  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries()),
  );
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

function isAddressInUse(err: unknown) {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "EADDRINUSE"
  );
}

async function listen(server: Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, CHATGPT_OAUTH_PROXY_HOST);
  });
}

async function isHandleProxyOnPort(port: number) {
  const response = await fetch(
    `http://${CHATGPT_OAUTH_PROXY_HOST}:${port}${CHATGPT_OAUTH_PROXY_HEALTH_PATH}`,
    { signal: AbortSignal.timeout(500) },
  ).catch(() => null);

  return response?.ok ?? false;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export function createChatGptOAuthProxyManager({
  fetchUpstream = fetch,
  getInstructions = getCodexInstructions,
  keychain = defaultChatGptOAuthKeychain,
  ports = CHATGPT_OAUTH_PROXY_PORTS,
  refreshTokens = refreshChatGptOAuthTokens,
}: CreateChatGptOAuthProxyManagerOptions = {}): ChatGptOAuthProxyManager {
  let current: ChatGptOAuthProxyServer | null = null;

  return {
    async ensureStarted() {
      if (current) return current;

      for (const port of ports) {
        // Personal-use Phase 2: an already-running Handle proxy on this port
        // belongs to the same local user, so reuse it instead of starting a
        // duplicate backend process that fights for the same Codex OAuth port.
        if (await isHandleProxyOnPort(port)) {
          current = {
            baseURL: `http://${CHATGPT_OAUTH_PROXY_HOST}:${port}/v1`,
            port,
            reused: true,
            stop: async () => {
              current = null;
            },
          };
          return current;
        }

        const server = http.createServer(async (req, res) => {
          const url = new URL(
            req.url ?? "/",
            `http://${CHATGPT_OAUTH_PROXY_HOST}:${port}`,
          );

          if (url.pathname === CHATGPT_OAUTH_PROXY_HEALTH_PATH) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ service: "handle-chatgpt-oauth-proxy" }));
            return;
          }

          if (
            req.method !== "POST" ||
            !["/v1/chat/completions", "/chat/completions"].includes(
              url.pathname,
            )
          ) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
            return;
          }

          try {
            const body = await requestJson(req);
            const response = await handleProxyRequest({
              body,
              fetchUpstream,
              getInstructions,
              keychain,
              refreshTokens,
            });
            await writeWebResponse(res, response);
          } catch (err) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: chatGptOAuthFailureMessage(
                  err instanceof Error ? err.message : String(err),
                ),
              }),
            );
          }
        });

        try {
          const selectedPort = await listen(server, port);
          current = {
            baseURL: `http://${CHATGPT_OAUTH_PROXY_HOST}:${selectedPort}/v1`,
            port: selectedPort,
            reused: false,
            stop: async () => closeServer(server),
          };
          return current;
        } catch (err) {
          await closeServer(server).catch(() => undefined);
          if (!isAddressInUse(err)) {
            throw err;
          }
        }
      }

      throw new Error(
        `Unable to start ChatGPT OAuth proxy. Ports ${ports.join(
          ", ",
        )} are unavailable.`,
      );
    },

    async stop() {
      const proxy = current;
      current = null;
      if (proxy && !proxy.reused) await proxy.stop();
    },
  };
}

export const chatGptOAuthProxyManager = createChatGptOAuthProxyManager();

export async function stopChatGptOAuthProxy() {
  await chatGptOAuthProxyManager.stop();
}
