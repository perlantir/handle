import { describe, expect, it } from "vitest";
import { formatTodoMdContext, initialTodoMd, shouldCreateTodoMd, todoMdPath } from "./todoMd";

describe("todo.md task tracking", () => {
  it("detects multi-step build and research requests", () => {
    expect(shouldCreateTodoMd("Build a search settings page and add tests")).toBe(true);
    expect(shouldCreateTodoMd("Research providers, compare pricing, and summarize options")).toBe(true);
  });

  it("skips one-shot questions", () => {
    expect(shouldCreateTodoMd("what's 2+2?")).toBe(false);
    expect(shouldCreateTodoMd("Tell me a joke")).toBe(false);
  });

  it("uses a workspace-local conversation todo path", () => {
    expect(todoMdPath("/tmp/workspace", "../conv/abc")).toBe("/tmp/workspace/abc.todo.md");
  });

  it("formats initial checklist context for the agent", () => {
    const content = initialTodoMd("Build the thing");
    const context = formatTodoMdContext({
      content,
      created: true,
      path: "/tmp/workspace/conv.todo.md",
    });

    expect(content).toContain("- [ ] Verify the final result");
    expect(context).toContain('<todo_md path="/tmp/workspace/conv.todo.md">');
  });
});
