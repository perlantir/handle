import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent, type CreateOpenAIToolsAgentParams } from 'langchain/agents';
import { configureLangSmithTracing } from '../lib/langsmith';
import { logger } from '../lib/logger';
import { createLangChainTools, type ToolExecutionContext } from './toolRegistry';
import { createPhase1ToolDefinitions } from './tools';
import { PHASE_1_SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './prompts';

export function createOpenAIChatModel({ streaming = true, temperature = 0.2 } = {}) {
  configureLangSmithTracing();

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';

  logger.info({ model, promptVersion: SYSTEM_PROMPT_VERSION }, 'Creating Phase 1 OpenAI chat model');

  return new ChatOpenAI({
    model,
    streaming,
    temperature,
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
  });
}

interface CreatePhase1AgentOptions {
  llm?: CreateOpenAIToolsAgentParams['llm'];
}

export async function createPhase1Agent(context: ToolExecutionContext, options: CreatePhase1AgentOptions = {}) {
  const tools = createLangChainTools(createPhase1ToolDefinitions(), context);
  const llm = options.llm ?? createOpenAIChatModel();
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', PHASE_1_SYSTEM_PROMPT],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);
  const agent = await createOpenAIToolsAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    maxIterations: 25,
    returnIntermediateSteps: false,
    tools,
    verbose: false,
  });
}
