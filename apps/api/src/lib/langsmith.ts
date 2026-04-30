export function configureLangSmithTracing() {
  if (!process.env.LANGSMITH_API_KEY) return;

  process.env.LANGCHAIN_TRACING_V2 ??= 'true';
  process.env.LANGCHAIN_API_KEY ??= process.env.LANGSMITH_API_KEY;
  process.env.LANGCHAIN_PROJECT ??= process.env.LANGSMITH_PROJECT ?? 'handle-dev';
}
