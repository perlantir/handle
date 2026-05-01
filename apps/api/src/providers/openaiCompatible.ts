import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";
import type {
  CreateModelDiagnostics,
  ProviderConfig,
  ProviderId,
  ProviderInstance,
} from "./types";

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

type OpenAICompatibleProviderId = Exclude<ProviderId, "openai" | "anthropic">;

const omittedSamplingParams = {
  frequency_penalty: undefined,
  n: undefined,
  presence_penalty: undefined,
  temperature: undefined,
  top_p: undefined,
};

const diagnosticSamplingParams = Object.fromEntries(
  Object.keys(omittedSamplingParams).map((key) => [key, "[undefined]"]),
);

export const OPENAI_COMPATIBLE_ENDPOINTS: Record<
  OpenAICompatibleProviderId,
  string
> = {
  kimi: "https://api.moonshot.ai/v1",
  local: "http://127.0.0.1:11434/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const DESCRIPTIONS: Record<OpenAICompatibleProviderId, string> = {
  kimi: "Moonshot KIMI",
  local: "Local LLM",
  openrouter: "OpenRouter (100+ models from many providers)",
};

interface OpenAICompatibleProviderDependencies {
  createChatModel?: (args: ChatOpenAIArgs) => BaseChatModel;
  fetchModels?: typeof fetch;
  getCredential?: typeof defaultGetCredential;
}

function isOpenAICompatibleProviderId(
  id: ProviderId,
): id is OpenAICompatibleProviderId {
  return id !== "openai" && id !== "anthropic";
}

function modelListURL(baseURL: string) {
  return `${baseURL.replace(/\/$/, "")}/models`;
}

function getOpenRouterHeaders() {
  const appURL =
    process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const appTitle = process.env.HANDLE_OPENROUTER_TITLE ?? "Handle";

  return {
    "HTTP-Referer": appURL,
    "X-OpenRouter-Title": appTitle,
    "X-Title": appTitle,
  };
}

function redactDiagnosticBody(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) return null;
  if (typeof body !== "string") return "[non-string request body]";

  const redacted = redactSecrets(body);
  try {
    return JSON.parse(redacted);
  } catch {
    return redacted;
  }
}

function diagnosticErrorMessage(err: unknown) {
  if (err instanceof Error) return redactSecrets(err.message);
  if (typeof err === "string") return redactSecrets(err);
  return "Unknown upstream fetch error";
}

function diagnosticErrorCause(err: unknown) {
  if (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    err.cause !== undefined
  ) {
    return diagnosticErrorMessage(err.cause);
  }

  return null;
}

function createDiagnosticFetch({
  baseURL,
  diagnostics,
  model,
  providerId,
}: {
  baseURL: string;
  diagnostics: CreateModelDiagnostics;
  model: string;
  providerId: OpenAICompatibleProviderId;
}): typeof fetch {
  return async (input, init) => {
    const requestBody = redactDiagnosticBody(init?.body);
    let response: Response;

    try {
      response = await fetch(input, init);
    } catch (err) {
      logger.error(
        {
          baseURL,
          cause: diagnosticErrorCause(err),
          label: diagnostics.label,
          message: diagnosticErrorMessage(err),
          model,
          providerId,
          requestBody,
          url: String(input),
        },
        "OpenAI-compatible provider upstream diagnostic fetch failure",
      );
      throw err;
    }

    const responseBody = await response
      .clone()
      .text()
      .then(redactSecrets)
      .catch((err: unknown) =>
        err instanceof Error
          ? `Unable to read response body: ${err.message}`
          : "Unable to read response body",
      );

    logger.info(
      {
        baseURL,
        label: diagnostics.label,
        model,
        providerId,
        requestBody,
        responseBody,
        status: response.status,
        url: String(input),
      },
      "OpenAI-compatible provider upstream diagnostic",
    );

    return response;
  };
}

export function createOpenAICompatibleProvider(
  config: ProviderConfig,
  {
    createChatModel = (args) => new ChatOpenAI(args),
    fetchModels = fetch,
    getCredential = defaultGetCredential,
  }: OpenAICompatibleProviderDependencies = {},
): ProviderInstance {
  if (!isOpenAICompatibleProviderId(config.id)) {
    throw new Error(`Unsupported OpenAI-compatible provider: ${config.id}`);
  }

  const id = config.id;

  return {
    config,
    description: DESCRIPTIONS[id],
    id,

    async createModel(modelOverride, options) {
      const apiKey =
        id === "local"
          ? await getCredential("local:apiKey").catch(() => "not-needed")
          : await getCredential(`${id}:apiKey`);
      const baseURL = config.baseURL ?? OPENAI_COMPATIBLE_ENDPOINTS[id];
      const model = modelOverride ?? config.primaryModel;

      if (options?.diagnostics) {
        logger.info(
          {
            apiKeyLength: apiKey.length,
            baseURL,
            label: options.diagnostics.label,
            model,
            modelKwargs: diagnosticSamplingParams,
            providerId: id,
          },
          "OpenAI-compatible provider test diagnostic",
        );
      }

      return createChatModel({
        apiKey,
        configuration: {
          baseURL,
          ...(options?.diagnostics
            ? {
                fetch: createDiagnosticFetch({
                  baseURL,
                  diagnostics: options.diagnostics,
                  model,
                  providerId: id,
                }),
              }
            : {}),
          ...(id === "openrouter"
            ? { defaultHeaders: getOpenRouterHeaders() }
            : {}),
        },
        // Kimi K2.6/K2.5 can report sampler mismatches as "401 Invalid
        // Authentication"; suppress LangChain's defaults for all compatible
        // providers unless a future settings field explicitly opts in.
        modelKwargs: omittedSamplingParams,
        model,
        streaming: true,
      });
    },

    async isAvailable() {
      if (id === "local") {
        const baseURL = config.baseURL ?? OPENAI_COMPATIBLE_ENDPOINTS.local;

        try {
          const res = await fetchModels(modelListURL(baseURL), {
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
