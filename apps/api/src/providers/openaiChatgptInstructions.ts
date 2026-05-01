import { logger } from "../lib/logger";

const CODEX_RELEASES_URL =
  "https://api.github.com/repos/openai/codex/releases/latest";
const PROMPT_CANDIDATES = [
  "codex-rs/core/gpt_5_2_prompt.md",
  "codex-rs/core/gpt_5_1_prompt.md",
  "codex-rs/core/gpt_5_codex_prompt.md",
  "codex-rs/models-manager/prompt.md",
] as const;

const FALLBACK_CODEX_INSTRUCTIONS =
  "You are Codex, OpenAI's coding agent. Follow the user's instructions, use tools carefully, and return concise, accurate answers.";

let cachedInstructions: string | null = null;

async function latestCodexReleaseTag(fetchInstructions: typeof fetch) {
  const response = await fetchInstructions(CODEX_RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return "main";

  const body = (await response.json()) as { tag_name?: string };
  return body.tag_name || "main";
}

export async function getCodexInstructions({
  fetchInstructions = fetch,
  model = "gpt-5.1",
}: {
  fetchInstructions?: typeof fetch;
  model?: string;
} = {}) {
  if (cachedInstructions) return cachedInstructions;

  const tag = await latestCodexReleaseTag(fetchInstructions).catch(
    () => "main",
  );
  const candidates = [
    ...PROMPT_CANDIDATES,
    ...(model.includes("codex")
      ? (["codex-rs/core/gpt_5_codex_prompt.md"] as const)
      : []),
  ];

  for (const promptPath of candidates) {
    const response = await fetchInstructions(
      `https://raw.githubusercontent.com/openai/codex/${tag}/${promptPath}`,
    ).catch(() => null);

    if (!response?.ok) continue;

    const text = await response.text();
    if (text.trim()) {
      cachedInstructions = text;
      return text;
    }
  }

  logger.warn({ tag }, "Using fallback Codex instructions for ChatGPT OAuth");
  cachedInstructions = FALLBACK_CODEX_INSTRUCTIONS;
  return cachedInstructions;
}

export function resetCodexInstructionsCacheForTest() {
  cachedInstructions = null;
}
