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
import { createPhase1ToolDefinitions } from "./tools";
import {
  PHASE_1_SYSTEM_PROMPT,
  PHASE_3_SYSTEM_PROMPT,
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

export async function createPhase1Agent(
  context: ToolExecutionContext,
  options: CreatePhase1AgentOptions = {},
) {
  const tools = createLangChainTools(createPhase1ToolDefinitions(), context);
  const llm = options.llm ?? createOpenAIChatModel();
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", PHASE_1_SYSTEM_PROMPT],
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
      ...createBrowserToolDefinitions(),
      ...createComputerUseToolDefinitions(),
    ],
    context,
  );
  const llm = options.llm ?? createOpenAIChatModel();
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", PHASE_3_SYSTEM_PROMPT],
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
