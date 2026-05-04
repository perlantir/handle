import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import {
  AgentExecutor,
  createToolCallingAgent,
  type CreateToolCallingAgentParams,
} from "langchain/agents";
import { configureLangSmithTracing } from "../lib/langsmith";
import { logger } from "../lib/logger";
import {
  createLangChainTools,
  type ToolExecutionContext,
} from "./toolRegistry";
import { createBrowserToolDefinitions } from "./browserTools";
import { createComputerUseToolDefinitions } from "./computerUseTools";
import { createTier1IntegrationToolDefinitions } from "./integrationTools";
import { createMemoryToolDefinitions } from "./memoryTools";
import { createSearchToolDefinitions } from "./searchTools";
import { createSharedMemoryToolDefinitions } from "./sharedMemoryTools";
import { createPhase1ToolDefinitions } from "./tools";
import {
  buildHandleSystemPrompt,
  buildPhase1SystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from "./prompts";

export function createOpenAIChatModel({
  streaming = true,
  temperature = 0.2,
} = {}) {
  configureLangSmithTracing();

  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  logger.info(
    { model, promptVersion: SYSTEM_PROMPT_VERSION },
    "Creating Phase 1 OpenAI chat model",
  );

  return new ChatOpenAI({
    model,
    streaming,
    temperature,
    ...(process.env.OPENAI_API_KEY
      ? { apiKey: process.env.OPENAI_API_KEY }
      : {}),
  });
}

interface CreatePhase1AgentOptions {
  llm?: CreateToolCallingAgentParams["llm"];
}

function escapePromptTemplateLiterals(text: string) {
  return text.replaceAll("{", "{{").replaceAll("}", "}}");
}

export async function createPhase1Agent(
  context: ToolExecutionContext,
  options: CreatePhase1AgentOptions = {},
) {
  const tools = createLangChainTools(createPhase1ToolDefinitions(), context);
  const llm = options.llm ?? createOpenAIChatModel();
  const systemPrompt = buildPhase1SystemPrompt({
    backendId: context.backend.id,
    memoryContext: context.memoryContext,
    workspaceDir: context.backend.getWorkspaceDir(),
  });
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", escapePromptTemplateLiterals(systemPrompt)],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);
  const agent = createToolCallingAgent({
    llm,
    prompt,
    // Provider content blocks can stream in vendor-specific shapes.
    // Parse one complete AIMessage before deciding on the next action.
    streamRunnable: false,
    tools,
  });

  return new AgentExecutor({
    agent,
    maxIterations: 40,
    returnIntermediateSteps: false,
    tools,
    verbose: false,
  });
}

export async function createHandleAgent(
  context: ToolExecutionContext,
  options: CreatePhase1AgentOptions = {},
) {
  const tools = createLangChainTools(
    [
      ...createPhase1ToolDefinitions(),
      ...createMemoryToolDefinitions(),
      ...createSearchToolDefinitions(),
      ...createSharedMemoryToolDefinitions(),
      ...createBrowserToolDefinitions(),
      ...createComputerUseToolDefinitions(),
      ...createTier1IntegrationToolDefinitions(),
    ],
    context,
  );
  const llm = options.llm ?? createOpenAIChatModel();
  const systemPrompt = buildHandleSystemPrompt({
    backendId: context.backend.id,
    memoryContext: context.memoryContext,
    workspaceDir: context.backend.getWorkspaceDir(),
  });
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", escapePromptTemplateLiterals(systemPrompt)],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);
  const agent = createToolCallingAgent({
    llm,
    prompt,
    streamRunnable: false,
    tools,
  });

  return new AgentExecutor({
    agent,
    maxIterations: 40,
    returnIntermediateSteps: false,
    tools,
    verbose: false,
  });
}
