import { basename, join } from "node:path";
import type { ExecutionBackend } from "../execution/types";

const MULTI_STEP_VERBS =
  /\b(build|create|implement|research|plan|setup|set up|configure|deploy|automate|integrate|migrate|refactor|debug|fix|audit|write|generate|analyze|compare|summarize.*and|find.*and)\b/i;
const ONE_SHOT_PATTERNS =
  /^(what(?:'s| is)|who is|when is|where is|define|tell me a joke|calculate|solve)\b/i;

export interface TodoMdResult {
  content: string;
  created: boolean;
  path: string;
}

export function shouldCreateTodoMd(goal: string) {
  const trimmed = goal.trim();
  if (!trimmed) return false;
  if (ONE_SHOT_PATTERNS.test(trimmed) && !MULTI_STEP_VERBS.test(trimmed)) return false;
  if (MULTI_STEP_VERBS.test(trimmed)) return true;

  const separators = (trimmed.match(/\b(and then|then|after that|finally)\b|[;\n]/gi) ?? []).length;
  const bullets = (trimmed.match(/(^|\n)\s*(?:[-*]|\d+[.)])\s+/g) ?? []).length;
  const commaSteps = (trimmed.match(/,/g) ?? []).length >= 2;
  return separators + bullets >= 2 || commaSteps;
}

function safeConversationFileStem(conversationId: string) {
  return basename(conversationId).replace(/[^A-Za-z0-9._-]/g, "_");
}

export function todoMdPath(workspaceDir: string, conversationId: string) {
  return join(workspaceDir, `${safeConversationFileStem(conversationId)}.todo.md`);
}

export function initialTodoMd(goal: string) {
  const escapedGoal = goal
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return [
    "# Task Todo",
    "",
    "Original request:",
    escapedGoal,
    "",
    "- [ ] Confirm the objective and constraints",
    "- [ ] Break the work into concrete steps",
    "- [ ] Execute the steps while updating this checklist",
    "- [ ] Verify the final result",
    "- [ ] Report what changed and any remaining gaps",
    "",
  ].join("\n");
}

export function formatTodoMdContext(result: TodoMdResult | null) {
  if (!result) return "";
  return [
    `<todo_md path="${result.path}">`,
    result.content,
    "</todo_md>",
  ].join("\n");
}

export async function ensureTodoMd({
  backend,
  conversationId,
  goal,
}: {
  backend: ExecutionBackend;
  conversationId: string;
  goal: string;
}): Promise<TodoMdResult | null> {
  if (!shouldCreateTodoMd(goal)) return null;
  const path = todoMdPath(backend.getWorkspaceDir(), conversationId);

  try {
    const existing = await backend.fileRead(path);
    return { content: existing, created: false, path };
  } catch {
    const content = initialTodoMd(goal);
    await backend.fileWrite(path, content);
    return { content, created: true, path };
  }
}
